import type { RunResult } from "./result.js";

/** Exit code for a runner/config error (must be > 1 so agents/CI can branch). */
export const RUNNER_ERROR_EXIT = 2;

/** 0 = all passed · 1 = a test failed. */
export function resultExitCode(r: RunResult): number {
  return r.ok ? 0 : 1;
}
