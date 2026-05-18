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
 * The seam between "how a runner executes tests" and the rest of the CLI.
 * An adapter's only job is to run the target project's suite once and return
 * a raw, un-normalized {@link RawRun}. Everything downstream (`normalize`,
 * renderers, exit codes) is runner-agnostic and never changes when a new
 * runner is added — only a new subclass does.
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
}
