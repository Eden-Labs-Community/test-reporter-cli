import type { Config } from "../../config/index.js";
import type { RunEventSink } from "../events.js";
import type { RawRun } from "../result.js";

/**
 * Thrown when the test runner itself fails (cannot start, collection/import
 * error, or the selected runner is unavailable) → process exit > 1.
 * Runner-agnostic: every adapter raises this same type so `check` keeps one
 * contract regardless of which runner produced the run.
 */
export class RunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnerError";
  }
}

/**
 * A live watch session (M3). The TUI commands it through these methods; the
 * runner streams {@link RunEventSink} `rerun`/`test`/`done` events back. The
 * caller MUST `close()` it on exit so no watcher/process leaks.
 */
export interface WatchHandle {
  /** Re-run the whole suite (the `a` key). */
  triggerAll(): void;
  /** Re-run only the files that currently have failures (the `f` key). */
  triggerFailed(): void;
  /** Tear the watcher down cleanly (Ctrl-C / `q`). */
  close(): Promise<void>;
}

/**
 * The seam between "how a runner executes tests" and the rest of the CLI.
 * An adapter's only job is to run the target project's suite and return a raw,
 * un-normalized {@link RawRun}. Everything downstream (`normalize`, renderers,
 * exit codes) is runner-agnostic and never changes when a new runner is added —
 * only a new subclass does.
 */
export abstract class TestRunnerAdapter {
  /** Stable identifier, must equal the `runner` config value it serves. */
  abstract readonly name: string;

  /**
   * Run the suite once. Throws {@link RunnerError} if the runner fails.
   * `onEvent` (optional) receives live lifecycle events for the TUI; when
   * omitted (e.g. `check`) the run is silent and the M1 contract is unchanged.
   */
  abstract run(
    cwd: string,
    config: Config,
    onEvent?: RunEventSink,
  ): Promise<RawRun>;

  /**
   * Start a live watch session (M3). Streams `rerun`/`test`/`done` events as
   * files change. Throws {@link RunnerError} if the runner cannot start or does
   * not support watch (never a false PASS). Watch is Vitest-only in v1.
   */
  abstract watch(
    cwd: string,
    config: Config,
    onEvent: RunEventSink,
  ): Promise<WatchHandle>;
}
