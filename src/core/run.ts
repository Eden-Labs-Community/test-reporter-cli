import type { Config } from "../config/index.js";
import type { RunEventSink } from "./events.js";
import type { WatchHandle } from "./runner/adapter.js";
import { createRunner } from "./runner/factory.js";
import type { RawRun } from "./result.js";

// Facade: the rest of the CLI runs tests through here and never learns which
// runner did it. The runner is chosen by config (see core/runner/factory).
export { RunnerError } from "./runner/adapter.js";
export type { WatchHandle } from "./runner/adapter.js";

/**
 * Run the target project's suite once using the configured runner adapter.
 * Pass `onEvent` for live streaming (TUI); omit it for the silent `check` path.
 */
export function runTests(
  cwd: string,
  config: Config,
  onEvent?: RunEventSink,
): Promise<RawRun> {
  return createRunner(config).run(cwd, config, onEvent);
}

/**
 * Start a live watch session (M3) with the configured runner adapter. Streams
 * `rerun`/`test`/`done` events; the returned handle lets the TUI command
 * re-runs and tear down cleanly. Throws `RunnerError` if the runner can't
 * start or doesn't support watch (Vitest-only in v1).
 */
export function watchTests(
  cwd: string,
  config: Config,
  onEvent: RunEventSink,
): Promise<WatchHandle> {
  return createRunner(config).watch(cwd, config, onEvent);
}
