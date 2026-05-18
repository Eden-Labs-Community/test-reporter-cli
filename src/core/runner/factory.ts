import type { Config } from "../../config/index.js";
import { RunnerError, TestRunnerAdapter } from "./adapter.js";
import { JestAdapter } from "./jest.js";
import { VitestAdapter } from "./vitest.js";

/**
 * Pick the runner adapter for this project. The only place that knows the
 * runner→implementation mapping; `check` (and future `run`/`watch`) just
 * compose `createRunner(config).run(...)` and stay runner-agnostic.
 */
export function createRunner(config: Config): TestRunnerAdapter {
  switch (config.runner) {
    case "vitest":
      return new VitestAdapter();
    case "jest":
      return new JestAdapter();
    default: {
      const exhaustive: never = config.runner;
      throw new RunnerError(`Unsupported runner: ${String(exhaustive)}`);
    }
  }
}
