import { render } from "ink";
import { createElement } from "react";

import type { Config } from "../../config/index.js";
import { RUNNER_ERROR_EXIT } from "../../core/exit.js";
import {
  RunnerError,
  type WatchHandle,
  runTests,
  watchTests,
} from "../../core/run.js";
import { createStore } from "../../tui/createStore.js";
import { App } from "./App.js";
import { resolvePalette } from "./theme.js";

/** Color/theme options threaded from the CLI into the live TUI. */
export interface TuiOptions {
  /** Explicit `--no-color`; `NO_COLOR` env is also honored downstream. */
  noColor?: boolean;
}

/**
 * Render the live TUI for `run` (TTY only). Streams runner events into the
 * store; the user browses failures (decision #13: option B) and quits with `q`.
 * Returns the process exit code; a runner/config failure → stderr + exit > 1
 * (same contract as `check`, never a false PASS).
 */
export async function renderTui(
  cwd: string,
  config: Config,
  opts: TuiOptions = {},
): Promise<number> {
  const store = createStore(cwd);
  const palette = resolvePalette({
    theme: config.ui.theme,
    noColor: opts.noColor,
  });
  const ink = render(createElement(App, { store, palette }));

  let fatal: Error | undefined;
  const runP = runTests(cwd, config, (e) => store.dispatch(e)).catch(
    (err: unknown) => {
      fatal = err instanceof Error ? err : new Error(String(err));
      ink.unmount();
    },
  );

  await ink.waitUntilExit();
  await runP;

  if (fatal) {
    const name = fatal instanceof RunnerError ? "RunnerError" : fatal.name;
    process.stderr.write(`${name}: ${fatal.message}\n`);
    return RUNNER_ERROR_EXIT;
  }
  return store.getState().exitCode;
}

/**
 * Render the live **watch** TUI (M3, TTY only). Vitest's native watcher
 * re-runs related tests on save; the store resets per cycle and focuses the
 * saved file's suite (RF-04, decision #14/#18). `a`/`f` (via the store's
 * monotonic `command`) drive the watcher; `q`/Ctrl-C tears it down with no
 * leaked watcher. A boot/runner failure → stderr + exit > 1 (never false PASS).
 */
export async function renderWatchTui(
  cwd: string,
  config: Config,
  opts: TuiOptions = {},
): Promise<number> {
  const store = createStore(cwd);
  const palette = resolvePalette({
    theme: config.ui.theme,
    noColor: opts.noColor,
  });
  const ink = render(createElement(App, { store, watch: true, palette }));

  let fatal: Error | undefined;
  let handle: WatchHandle | undefined;
  try {
    handle = await watchTests(cwd, config, (e) => store.dispatch(e));
  } catch (err) {
    fatal = err instanceof Error ? err : new Error(String(err));
    ink.unmount();
  }

  // Pure-store edge: act once per `a`/`f` press (seq is monotonic).
  let lastSeq = 0;
  const unsub = store.subscribe(() => {
    const cmd = store.getState().command;
    if (!handle || !cmd || cmd.seq === lastSeq) return;
    lastSeq = cmd.seq;
    if (cmd.kind === "all") handle.triggerAll();
    else handle.triggerFailed();
  });

  await ink.waitUntilExit(); // resolves when the store signals exit (`q`/Ctrl-C)
  unsub();
  if (handle) await handle.close(); // clean teardown — no leaked watcher

  if (fatal) {
    const name = fatal instanceof RunnerError ? "RunnerError" : fatal.name;
    process.stderr.write(`${name}: ${fatal.message}\n`);
    return RUNNER_ERROR_EXIT;
  }
  return store.getState().exitCode;
}
