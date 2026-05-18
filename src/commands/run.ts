import { loadConfig } from "../config/index.js";
import { RUNNER_ERROR_EXIT } from "../core/exit.js";
import { renderTui } from "../renderers/tui/index.js";
import { type CheckOptions, runCheck } from "./check.js";

export interface RunOptions extends CheckOptions {
  /** Force the headless verdict even on a TTY. */
  summary?: boolean;
}

/**
 * `run`: the flagship. On a TTY → live Ink TUI (decision #13: option B —
 * focus a failure the instant it happens). Non-TTY / CI / `--json` /
 * `--summary` → fall back to the exact `check` contract (DRY: same bytes,
 * same exit codes), so agents and pipelines keep the stable verdict.
 */
export async function runRun(opts: RunOptions): Promise<number> {
  const headless = !process.stdout.isTTY || opts.json || opts.summary;
  if (headless) return runCheck(opts);

  let config;
  try {
    config = loadConfig(opts.cwd, opts.configPath);
  } catch (err) {
    const e = err as Error;
    process.stderr.write(`${e.name}: ${e.message}\n`);
    return RUNNER_ERROR_EXIT;
  }
  return renderTui(opts.cwd, config);
}
