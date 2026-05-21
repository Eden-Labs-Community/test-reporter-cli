import { spawn } from "node:child_process";
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
import type { Store } from "../../tui/createStore.js";
import { createStore } from "../../tui/createStore.js";
import { App } from "./App.js";
import { editorCommand } from "./editor.js";
import { resolvePalette } from "./theme.js";

// Enter alternate screen buffer, clear it, and move cursor to home position.
// This version of Ink (v5) does not expose an altScreen option, so we manage
// the alternate screen ourselves with raw ANSI sequences.
const ENTER_ALT_SCREEN = "\x1b[?1049h\x1b[2J\x1b[H";
// Exit alternate screen, restore cursor visibility, and reset all attributes.
const EXIT_ALT_SCREEN = "\x1b[?1006l\x1b[?1003l\x1b[?1000l\x1b[?1049l\x1b[?25h\x1b[0m";

/**
 * Switch to the alternate screen buffer and register cleanup handlers so the
 * terminal is always restored to a clean state even when the process is killed
 * externally (SIGTERM, IDE stop button).
 *
 * - `exit` listener: writes EXIT_ALT_SCREEN as a last-resort fallback
 *   (synchronous, runs on any exit path).
 * - `SIGTERM` listener: unmounts Ink cleanly and exits with code 0 so the
 *   `exit` handler above runs in order.
 *
 * Returns an unregister function to call after a normal exit so we don't
 * leave stale listeners.
 */
function enterAltScreenAndGuard(ink: ReturnType<typeof render>): () => void {
  process.stdout.write(ENTER_ALT_SCREEN);
  const restoreTerminal = () => process.stdout.write(EXIT_ALT_SCREEN);
  const onSigterm = () => {
    ink.unmount();
    process.exit(0);
  };
  process.once("exit", restoreTerminal);
  process.once("SIGTERM", onSigterm);
  return () => {
    process.off("exit", restoreTerminal);
    process.off("SIGTERM", onSigterm);
  };
}

/**
 * Edge effect: open the focused test/failure in the user's editor when the
 * store's monotonic `openRequest.seq` advances (M4.1). The editor is the
 * configured `ui.editor` (test-reporter-config.json). Best-effort and
 * detached — a missing editor fails silently rather than corrupting the Ink
 * screen (same spirit as the best-effort code frame). Returns an unsubscribe.
 */
function wireEditor(store: Store, editor: string): () => void {
  let lastSeq = 0;
  return store.subscribe(() => {
    const req = store.getState().openRequest;
    if (!req || req.seq === lastSeq) return;
    lastSeq = req.seq;
    const { cmd, args } = editorCommand(req.file, req.line, req.col, editor);
    try {
      const child = spawn(cmd, args, { stdio: "ignore", detached: true });
      child.on("spawn", () =>
        store.dispatch({ type: "notice", text: `opened in ${cmd}` }),
      );
      child.on("error", () =>
        store.dispatch({
          type: "notice",
          text: `couldn't run "${cmd}" — set "ui.editor" in test-reporter-config.json (e.g. "code") or install the \`code\` command`,
        }),
      );
      child.unref();
    } catch {
      store.dispatch({
        type: "notice",
        text: `couldn't launch the editor — set "ui.editor" in test-reporter-config.json`,
      });
    }
  });
}

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
  const unguard = enterAltScreenAndGuard(ink);
  const unwire = wireEditor(store, config.ui.editor);

  let fatal: Error | undefined;
  const runP = runTests(cwd, config, (e) => store.dispatch(e)).catch(
    (err: unknown) => {
      fatal = err instanceof Error ? err : new Error(String(err));
      ink.unmount();
    },
  );

  await ink.waitUntilExit();
  unguard();
  unwire();
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
  const unguard = enterAltScreenAndGuard(ink);

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
  const unwire = wireEditor(store, config.ui.editor);

  await ink.waitUntilExit(); // resolves when the store signals exit (`q`/Ctrl-C)
  unguard();
  unsub();
  unwire();
  if (handle) await handle.close(); // clean teardown — no leaked watcher

  if (fatal) {
    const name = fatal instanceof RunnerError ? "RunnerError" : fatal.name;
    process.stderr.write(`${name}: ${fatal.message}\n`);
    return RUNNER_ERROR_EXIT;
  }
  return store.getState().exitCode;
}
