/**
 * Programmatic API (the package `main`/`exports` entry). The stable, reusable
 * surface is the **headless contract core** — run a suite, get the normalized
 * deterministic result, format it exactly like `test-reporter check`. The live
 * TUI is a CLI-only concern and intentionally not part of the library API.
 */

// Commands (compose-and-go)
export { runCheck } from "./commands/check.js";
export type { CheckOptions } from "./commands/check.js";
export { runInit } from "./commands/init.js";
export type { InitOptions } from "./commands/init.js";

// Config (loader + the single source of documented defaults)
export {
  CONFIG_FILENAME,
  ConfigError,
  defaultConfig,
  loadConfig,
  serializeDefaultConfig,
} from "./config/index.js";
export type { Config } from "./config/index.js";

// Run a suite via the configured runner adapter (Vitest/Jest)
export { RunnerError, runTests, watchTests } from "./core/run.js";
export type { WatchHandle } from "./core/run.js";
export type { RunEvent } from "./core/events.js";

// Normalized result model + deterministic normalize
export { normalize, toPosixRelative } from "./core/result.js";
export type {
  Failure,
  RawRun,
  RawTest,
  RunResult,
} from "./core/result.js";

// Exit-code policy (0 pass · 1 a test failed · >1 runner/config error)
export { RUNNER_ERROR_EXIT, resultExitCode } from "./core/exit.js";

// Renderers implementing the PRD §7 output contract
export { failureBlock, formatText } from "./renderers/summary.js";
export type { FormatTextOptions } from "./renderers/summary.js";
export { SCHEMA_VERSION, buildJsonReport, formatJson } from "./renderers/json.js";
export type { JsonFailure, JsonReport } from "./renderers/json.js";
