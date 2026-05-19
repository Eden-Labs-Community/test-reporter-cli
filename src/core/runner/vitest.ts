import { startVitest } from "vitest/node";

import type { Config } from "../../config/index.js";
import { type RunEventSink, pickUnemitted } from "../events.js";
import type { RawRun, RawTest, TestStatus } from "../result.js";
import {
  RunnerError,
  TestRunnerAdapter,
  type WatchHandle,
} from "./adapter.js";

/** Minimal structural view of the Vitest task tree (avoids unstable types). */
interface VError {
  name?: string;
  message?: string;
  expected?: unknown;
  actual?: unknown;
}

/** Vitest pre-stringifies diff sides; coerce defensively, omit if absent. */
function diffSide(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === "string" ? v : JSON.stringify(v);
}
interface VTask {
  type?: string;
  name?: string;
  filepath?: string;
  location?: { line?: number; column?: number };
  result?: { state?: string; duration?: number; errors?: VError[] };
  tasks?: VTask[];
}
/** What Vitest hands to `onInit` — only the bits we need (live task state). */
interface VContext {
  state: {
    getFiles: () => unknown[];
    getUnhandledErrors?: () => unknown[];
  };
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
      // Per-test definition location (every test) for the TUI list's
      // "open in editor". `includeTaskLocation:true` makes this available.
      line: task.location?.line,
      col: task.location?.column,
      error:
        status === "failed"
          ? {
              name: err?.name,
              message: err?.message,
              line: task.location?.line,
              col: task.location?.column,
              file: filepath,
              expected: diffSide(err?.expected),
              actual: diffSide(err?.actual),
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

/** Full snapshot of every collected test (shared by one-shot run + watch). */
function collectAll(files: VTask[]): RawTest[] {
  const out: RawTest[] = [];
  for (const f of files) collectFile(f, out, false);
  return out;
}

/**
 * A fatal collection/import error message, or undefined if the suite ran.
 * One-shot `run` throws on this (exit > 1 contract); watch tolerates it per
 * cycle so the dev can fix and re-save (no error overlay in watch = M4 debt).
 */
function collectionError(
  files: VTask[],
  unhandled: unknown[],
): string | undefined {
  const failed = files.some(
    (f) => f.result?.state === "fail" && countTests(f) === 0,
  );
  if (unhandled.length > 0 || failed)
    return firstErrorMessage(files, unhandled);
  return undefined;
}

/**
 * Replaces Vitest's default reporter so nothing pollutes stdout. With no sink
 * it is a pure no-op (same role as M1's silent reporter); with a sink it
 * streams every terminal test once, live, as the run progresses. In watch mode
 * (`watch` set) it also emits a `rerun` at the start of each cycle (resetting
 * the per-cycle dedupe) and an authoritative `done` at the end of each cycle —
 * one-shot `run` leaves `watch` unset and emits its own `done`, so the M1/M2
 * contract is byte-unchanged.
 */
class StreamReporter {
  private provider?: () => VTask[];
  private emitted = new Set<string>();
  private cycleStart = Date.now();

  constructor(
    private readonly onEvent?: RunEventSink,
    private readonly watch?: { cwd: string },
  ) {}

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
  onWatcherRerun(_files: string[], trigger?: string): void {
    if (!this.onEvent || !this.watch) return;
    this.emitted = new Set(); // fresh per-cycle dedupe
    this.cycleStart = Date.now();
    this.onEvent({ type: "rerun", trigger }); // RF-04: focus the saved file
  }
  onServerRestart(): void {}
  onUserConsoleLog(): void {}
  onFinished(): void {
    this.flush();
    if (!this.onEvent || !this.watch || !this.provider) return;
    // Per-cycle authoritative verdict (one-shot `run` emits its own instead).
    this.onEvent({
      type: "done",
      run: {
        rootDir: this.watch.cwd,
        tests: collectAll(this.provider()),
        durationMs: Date.now() - this.cycleStart,
      },
    });
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

      const err = collectionError(files, unhandled);
      if (err) throw new RunnerError(err);

      const run: RawRun = {
        rootDir: cwd,
        tests: collectAll(files),
        durationMs: Date.now() - start,
      };
      onEvent?.({ type: "done", run });
      return run;
    } finally {
      await vitest.close();
    }
  }

  /**
   * Live watch (M3, decision #14): Vitest's *native* watcher re-runs the tests
   * related to the saved file via its module graph — fast and catches
   * cross-file breakage. The reporter streams `rerun`/`test`/`done`; the
   * handle lets the TUI command re-runs and tear down cleanly (no leaked
   * watcher). A per-cycle collection error is tolerated (the dev fixes & saves
   * again); only a hard boot failure throws (exit > 1, never a false PASS).
   */
  async watch(
    cwd: string,
    config: Config,
    onEvent: RunEventSink,
  ): Promise<WatchHandle> {
    let vitest: Awaited<ReturnType<typeof startVitest>> | undefined;
    try {
      vitest = await startVitest("test", [], {
        root: cwd,
        watch: true,
        include: config.include,
        reporters: [new StreamReporter(onEvent, { cwd })],
        includeTaskLocation: true,
        silent: true,
        passWithNoTests: true,
      });
    } catch (err) {
      throw new RunnerError((err as Error).message);
    }
    if (!vitest) throw new RunnerError("Vitest failed to start");

    const v = vitest;
    const api = v as unknown as {
      rerunFiles?: (files?: string[]) => unknown;
    };
    const failedFiles = (): string[] => {
      const files = v.state.getFiles() as unknown as VTask[];
      return [
        ...new Set(
          collectAll(files)
            .filter((t) => t.status === "failed")
            .map((t) => t.file),
        ),
      ];
    };

    return {
      triggerAll: () => {
        void api.rerunFiles?.();
      },
      triggerFailed: () => {
        const f = failedFiles();
        if (f.length > 0) void api.rerunFiles?.(f);
      },
      close: async () => {
        await v.close();
      },
    };
  }
}
