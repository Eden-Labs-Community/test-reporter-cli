import type { Config } from "../config/index.js";
import { createRunner } from "./runner/factory.js";
import type { RawRun } from "./result.js";

// Facade: the rest of the CLI runs tests through here and never learns which
// runner did it. The runner is chosen by config (see core/runner/factory).
export { RunnerError } from "./runner/adapter.js";

/** Run the target project's suite once using the configured runner adapter. */
export function runTests(cwd: string, config: Config): Promise<RawRun> {
  return createRunner(config).run(cwd, config);
}
