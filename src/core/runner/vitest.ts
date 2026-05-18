import { startVitest } from "vitest/node";

import type { Config } from "../../config/index.js";
import { type RunEventSink, pickUnemitted } from "../events.js";
import type { RawRun, RawTest, TestStatus } from "../result.js";
import { RunnerError, TestRunnerAdapter } from "./adapter.js";

/** Minimal structural view of the Vitest task tree (avoids unstable types). */
interface VError {
  name?: string;
  message?: string;
}
interface VTask {
  type?: string;
  name?: string;
  filepath?: string;
  location?: { line?: number; column?: number };
  result?: { state?: string; duration?: number; errors?: VError[] };
  tasks?: VTask[];
}
/** What Vitest hands to `onInit` — only the bit we need (live task state). */
interface VContext {
  state: { getFiles: () => unknown[] };
}

/** A test is "settled" once its state is terminal — never emit it before. */
export function isTerminalState(s: string | undefined): boolean {
  return s === "pass" || s === "fail" || s === "skip" || s === "todo";
}

function mapStatus(task: VTask): TestStatus {
  const s = task.result?.state;
  if (s === "pass") return "passed";
  if (s === "fail") return "failed";
  return "skipped";
}

function walk(
  task: VTask,
  filepath: string,
  prefix: string[],
  out: RawTest[],
  settledOnly: boolean,
): void {
  if (task.type === "suite") {
    const next = [...prefix, task.name ?? ""];
    for (const child of task.tasks ?? [])
      walk(child, filepath, next, out, settledOnly);
    return;
  }
  if (task.type === "test" || task.type === "custom") {
    if (settledOnly && !isTerminalState(task.result?.state)) return;
    const status = mapStatus(task);
    const err = task.result?.errors?.[0];
    out.push({
      file: filepath,
      name: [...prefix, task.name ?? ""].join(" > "),
      suite: prefix.join(" > "),
      status,
      durationMs: task.result?.duration,
      error:
        status === "failed"
          ? {
              name: err?.name,
              message: err?.message,
              line: task.location?.line,
              col: task.location?.column,
              file: filepath,
            }
          : undefined,
    });
  }
}

function collectFile(file: VTask, out: RawTest[], settledOnly: boolean): void {
  const filepath = file.filepath ?? "";
  for (const child of file.tasks ?? [])
    walk(child, filepath, [], out, settledOnly);
}

function countTests(task: VTask): number {
  if (task.type === "test" || task.type === "custom") return 1;
  return (task.tasks ?? []).reduce((n, c) => n + countTests(c), 0);
}

function firstErrorMessage(files: VTask[], unhandled: unknown[]): string {
  for (const f of files) {
    const e = f.result?.errors?.[0];
    if (e?.message) return e.message;
  }
  const u = unhandled[0] as { message?: string } | undefined;
  return u?.message ?? "Vitest failed to run the test suite";
}

/**
 * Replaces Vitest's default reporter so nothing pollutes stdout. With no sink
 * it is a pure no-op (same role as M1's silent reporter); with a sink it
 * streams every terminal test once, live, as the run progresses.
 */
class StreamReporter {
  private provider?: () => VTask[];
  private readonly emitted = new Set<string>();

  constructor(private readonly onEvent?: RunEventSink) {}

  onInit(ctx: VContext): void {
    this.provider = () => ctx.state.getFiles() as unknown as VTask[];
  }
  onTaskUpdate(): void {
    this.flush();
  }
  onPathsCollected(): void {}
  onCollected(): void {}
  onTestRemoved(): void {}
  onWatcherStart(): void {}
  onWatcherRerun(): void {}
  onServerRestart(): void {}
  onUserConsoleLog(): void {}
  onFinished(): void {
    this.flush();
  }

  private flush(): void {
    if (!this.onEvent || !this.provider) return;
    const tests: RawTest[] = [];
    for (const f of this.provider()) collectFile(f, tests, true);
    for (const t of pickUnemitted(tests, this.emitted))
      this.onEvent({ type: "test", test: t });
  }
}

/** Runs the target project's suite with Vitest's Node API (`startVitest`). */
export class VitestAdapter extends TestRunnerAdapter {
  readonly name = "vitest";

  async run(
    cwd: string,
    config: Config,
    onEvent?: RunEventSink,
  ): Promise<RawRun> {
    const start = Date.now();
    let vitest: Awaited<ReturnType<typeof startVitest>> | undefined;
    try {
      vitest = await startVitest("test", [], {
        root: cwd,
        watch: false,
        run: true,
        include: config.include,
        reporters: [new StreamReporter(onEvent)],
        includeTaskLocation: true,
        silent: true,
        passWithNoTests: true,
      });
    } catch (err) {
      throw new RunnerError((err as Error).message);
    }
    if (!vitest) throw new RunnerError("Vitest failed to start");

    try {
      const files = vitest.state.getFiles() as unknown as VTask[];
      const unhandled = (
        typeof vitest.state.getUnhandledErrors === "function"
          ? vitest.state.getUnhandledErrors()
          : []
      ) as unknown[];

      const tests: RawTest[] = [];
      for (const f of files) collectFile(f, tests, false);

      const collectionFailed = files.some(
        (f) => f.result?.state === "fail" && countTests(f) === 0,
      );
      if (unhandled.length > 0 || collectionFailed) {
        throw new RunnerError(firstErrorMessage(files, unhandled));
      }

      const run: RawRun = {
        rootDir: cwd,
        tests,
        durationMs: Date.now() - start,
      };
      onEvent?.({ type: "done", run });
      return run;
    } finally {
      await vitest.close();
    }
  }
}
