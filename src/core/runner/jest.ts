import type { Config } from "../../config/index.js";
import type { RunEventSink } from "../events.js";
import type { RawRun, RawTest, RawTestError, TestStatus } from "../result.js";
import {
  RunnerError,
  TestRunnerAdapter,
  type WatchHandle,
} from "./adapter.js";

/**
 * Minimal structural view of `@jest/core`'s `runCLI` result. We never depend
 * on `@jest/types` (Jest is an optional peer): the build stays decoupled and
 * Vitest-only users never need Jest installed. Mirrors the Vitest adapter's
 * structural-typing approach.
 */
interface JAssertion {
  ancestorTitles?: string[];
  title?: string;
  status?: string;
  failureMessages?: string[];
  duration?: number | null;
  location?: { line?: number; column?: number } | null;
}
interface JTestFile {
  testFilePath?: string;
  testResults?: JAssertion[];
  testExecError?: { message?: string };
  failureMessage?: string | null;
}
interface JAggregated {
  testResults?: JTestFile[];
}
interface JestCoreModule {
  runCLI: (
    argv: Record<string, unknown>,
    projects: string[],
  ) => Promise<{ results: JAggregated }>;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\[[0-9;]*m/g;

function mapStatus(status: string | undefined): TestStatus {
  if (status === "passed") return "passed";
  if (status === "failed") return "failed";
  return "skipped"; // pending | skipped | todo | disabled | focused
}

/**
 * Shape Jest's free-form `failureMessages[0]` into a {@link RawTestError}.
 * This parses the runner's *structured* result field, not human stdout — the
 * "results from the runner's API, never parse the report" invariant holds.
 */
function toError(a: JAssertion, file: string): RawTestError {
  const raw = (a.failureMessages?.[0] ?? "").replace(ANSI, "");
  const firstLine =
    raw
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "Test failed";
  const m = /^([A-Za-z_][\w.]*?(?:Error)?):\s+(.*)$/.exec(firstLine);
  return {
    name: m ? m[1] : undefined,
    message: m ? m[2] : firstLine,
    line: a.location?.line,
    col: a.location?.column,
    file,
  };
}

function firstRunnerError(files: JTestFile[]): string {
  for (const f of files) {
    const msg = f.testExecError?.message ?? f.failureMessage ?? "";
    const clean = msg.replace(ANSI, "").split("\n")[0]?.trim();
    if (clean) return clean;
  }
  return "Jest failed to run the test suite";
}

/** Runs the target project's suite with Jest's programmatic API (`runCLI`). */
export class JestAdapter extends TestRunnerAdapter {
  readonly name = "jest";

  async run(
    cwd: string,
    config: Config,
    onEvent?: RunEventSink,
  ): Promise<RawRun> {
    const start = Date.now();

    let runCLI: JestCoreModule["runCLI"];
    try {
      const spec = "@jest/core"; // non-literal: keeps the build decoupled
      const mod = (await import(spec)) as JestCoreModule & {
        default?: JestCoreModule;
      };
      runCLI = (mod.default ?? mod).runCLI;
    } catch {
      throw new RunnerError(
        'runner is "jest" but Jest is not installed. Add it: npm i -D jest',
      );
    }

    let files: JTestFile[];
    try {
      const { results } = await runCLI(
        {
          $0: "",
          _: [],
          rootDir: cwd,
          ci: true,
          watch: false,
          watchAll: false,
          watchman: false,
          cache: false,
          runInBand: true,
          silent: true,
          passWithNoTests: true,
          testLocationInResults: true,
          reporters: [],
          testMatch: config.include,
        },
        [cwd],
      );
      files = results.testResults ?? [];
    } catch (err) {
      throw new RunnerError((err as Error).message);
    }

    const tests: RawTest[] = [];
    for (const f of files) {
      const file = f.testFilePath ?? "";
      const collectionFailed =
        f.testExecError !== undefined ||
        ((f.testResults ?? []).length === 0 && Boolean(f.failureMessage));
      if (collectionFailed) throw new RunnerError(firstRunnerError(files));

      for (const a of f.testResults ?? []) {
        const status = mapStatus(a.status);
        tests.push({
          file,
          name: [...(a.ancestorTitles ?? []), a.title ?? ""].join(" > "),
          suite: (a.ancestorTitles ?? []).join(" > "),
          status,
          durationMs: a.duration ?? undefined,
          error: status === "failed" ? toError(a, file) : undefined,
        });
      }
    }

    const run: RawRun = { rootDir: cwd, tests, durationMs: Date.now() - start };
    if (onEvent) {
      // v1: Jest streams as a single batch at completion (no incremental
      // liveness yet — documented debt). Final result/contract is unaffected.
      for (const test of tests) onEvent({ type: "test", test });
      onEvent({ type: "done", run });
    }
    return run;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async watch(): Promise<WatchHandle> {
    // Watch needs incremental streaming, which the Jest adapter does not have
    // in v1 (batch-at-done; tracked M4 debt). Fail loud — never a false PASS.
    throw new RunnerError(
      'watch is only supported with the Vitest runner in v1 (runner is "jest"). ' +
        "Use `test-reporter check` for a one-shot Jest verdict.",
    );
  }
}
