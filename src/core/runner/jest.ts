import { watch as fsWatch } from "node:fs";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { Config } from "../../config/index.js";
import { type RunEventSink, pickUnemitted } from "../events.js";
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
const ANSI = /\[[0-9;]*m/g;

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

/** A single Jest assertion → our normalized {@link RawTest} (one mapper, DRY:
 *  used by both the batch reconcile and the incremental stream reporter). */
function toRawTest(a: JAssertion, file: string): RawTest {
  const status = mapStatus(a.status);
  return {
    file,
    name: [...(a.ancestorTitles ?? []), a.title ?? ""].join(" > "),
    suite: (a.ancestorTitles ?? []).join(" > "),
    status,
    durationMs: a.duration ?? undefined,
    error: status === "failed" ? toError(a, file) : undefined,
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

/**
 * Pure: should this changed path be ignored by the Jest watcher? Dependency,
 * VCS, build and coverage trees plus dotfiles / editor scratch files never
 * warrant a re-run. Exported for unit testing (the watch loop itself is not
 * unit-testable — runner-in-runner reentrancy — like the Vitest watcher).
 */
export function ignoredWatchPath(p: string): boolean {
  const segs = p.split(/[/\\]/);
  const base = segs[segs.length - 1] ?? "";
  if (
    segs.some(
      (s) =>
        s === "node_modules" ||
        s === ".git" ||
        s === "dist" ||
        s === "coverage",
    )
  )
    return true;
  if (base.startsWith(".")) return true; // dotfile (incl. .x.swp)
  if (base.endsWith("~")) return true; // editor backup
  return false;
}

// The globalThis slot the CJS stream reporter forwards each test case through.
// Same process as `runCLI` (runInBand), so a single slot is safe (runs are
// sequential). Keep the literal in sync with jest-stream-reporter.cjs.
const SINK_KEY = "__TEST_REPORTER_JEST_SINK__";
const REPORTER_PATH = fileURLToPath(
  new URL("./jest-stream-reporter.cjs", import.meta.url),
);
type CaseSink = (file: string, tcr: JAssertion) => void;

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

    // Incremental streaming (M4): only when a sink is present (the TUI). The
    // silent `check` path passes no sink and stays exactly as before (no
    // reporter, no global) so its byte contract cannot move.
    const emitted = new Set<string>();
    const streaming = onEvent !== undefined;
    if (streaming) {
      const sink: CaseSink = (file, tcr) => {
        const test = toRawTest(tcr, file);
        for (const t of pickUnemitted([test], emitted))
          onEvent({ type: "test", test: t });
      };
      (globalThis as Record<string, unknown>)[SINK_KEY] = sink;
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
          reporters: streaming ? [[REPORTER_PATH, {}]] : [],
          testMatch: config.include,
        },
        [cwd],
      );
      files = results.testResults ?? [];
    } catch (err) {
      throw new RunnerError((err as Error).message);
    } finally {
      if (streaming) delete (globalThis as Record<string, unknown>)[SINK_KEY];
    }

    const tests: RawTest[] = [];
    for (const f of files) {
      const file = f.testFilePath ?? "";
      const collectionFailed =
        f.testExecError !== undefined ||
        ((f.testResults ?? []).length === 0 && Boolean(f.failureMessage));
      if (collectionFailed) throw new RunnerError(firstRunnerError(files));

      for (const a of f.testResults ?? []) tests.push(toRawTest(a, file));
    }

    const run: RawRun = { rootDir: cwd, tests, durationMs: Date.now() - start };
    if (onEvent) {
      // Reconcile: emit only what the live reporter did not already stream
      // (none, normally) then the authoritative `done`. If the reporter never
      // loaded, `emitted` is empty so this degrades to the old batch path —
      // the final result/contract is unaffected either way.
      for (const test of pickUnemitted(tests, emitted))
        onEvent({ type: "test", test });
      onEvent({ type: "done", run });
    }
    return run;
  }

  /**
   * Live watch (M4, decision #21). Jest has no stable native-watcher Node API
   * (unlike Vitest), so we drive it ourselves: a debounced `fs.watch` re-runs
   * the *whole* suite via the one-shot `run` path (DRY — same incremental
   * streaming, same authoritative verdict). Coarser than Vitest's module-graph
   * watcher, but reliable and deterministic. Runs never overlap; `close()`
   * tears the watcher down with nothing leaked.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async watch(
    cwd: string,
    config: Config,
    onEvent: RunEventSink,
  ): Promise<WatchHandle> {
    let running = false;
    let queued: string | undefined;
    let closed = false;
    let timer: NodeJS.Timeout | undefined;

    const cycle = async (trigger?: string): Promise<void> => {
      if (closed) return;
      if (running) {
        queued = trigger ?? queued ?? "";
        return;
      }
      running = true;
      onEvent({ type: "rerun", trigger });
      try {
        await this.run(cwd, config, onEvent);
      } catch (err) {
        // Tolerate a per-cycle runner error (the dev fixes & saves again) —
        // mirrors the Vitest watcher; only a hard boot error would throw here.
        onEvent({
          type: "done",
          run: { rootDir: cwd, tests: [], durationMs: 0 },
        });
        void (err as Error);
      } finally {
        running = false;
        if (!closed && queued !== undefined) {
          const t = queued;
          queued = undefined;
          void cycle(t || undefined);
        }
      }
    };

    const onChange = (file: string): void => {
      if (closed || ignoredWatchPath(file)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void cycle(file), 120); // debounce bursts
    };

    let watcher: ReturnType<typeof fsWatch>;
    try {
      watcher = fsWatch(cwd, { recursive: true }, (_e, f) => {
        if (f) onChange(`${cwd}${sep}${f}`);
      });
    } catch {
      // Linux lacks recursive fs.watch — degrade to watching the root dir
      // only (still catches top-level + the common saved-file case).
      watcher = fsWatch(cwd, (_e, f) => {
        if (f) onChange(`${cwd}${sep}${f}`);
      });
    }

    void cycle(); // initial full run, like Vitest's first watch pass

    return {
      triggerAll: () => void cycle(),
      triggerFailed: () => void cycle(),
      close: async () => {
        closed = true;
        if (timer) clearTimeout(timer);
        watcher.close();
        return Promise.resolve();
      },
    };
  }
}
