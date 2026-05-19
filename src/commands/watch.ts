import { loadConfig } from "../config/index.js";
import { RUNNER_ERROR_EXIT } from "../core/exit.js";
import { renderWatchTui } from "../renderers/tui/index.js";
import { runCheck } from "./check.js";
import type { RunOptions } from "./run.js";

export type WatchOptions = RunOptions;

/**
 * `watch` (M3): a live Ink TUI that re-runs on save via Vitest's native
 * watcher (decision #14 — related tests by module graph), focusing the saved
 * file's suite (RF-04). Non-TTY / CI / `--json` / `--summary` make no sense
 * for an interactive watcher, so they fall back to a single `check` run (DRY:
 * same bytes, same exit codes) — agents and pipelines keep the stable verdict.
 */
export async function runWatch(opts: WatchOptions): Promise<number> {
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
  return renderWatchTui(opts.cwd, config, { noColor: opts.noColor });
}
