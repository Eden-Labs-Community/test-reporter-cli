import { render } from "ink";
import { createElement } from "react";

import type { Config } from "../../config/index.js";
import { RUNNER_ERROR_EXIT } from "../../core/exit.js";
import { RunnerError, runTests } from "../../core/run.js";
import { createStore } from "../../tui/createStore.js";
import { App } from "./App.js";

/**
 * Render the live TUI for `run` (TTY only). Streams runner events into the
 * store; the user browses failures (decision #13: option B) and quits with `q`.
 * Returns the process exit code; a runner/config failure → stderr + exit > 1
 * (same contract as `check`, never a false PASS).
 */
export async function renderTui(cwd: string, config: Config): Promise<number> {
  const store = createStore(cwd);
  const ink = render(createElement(App, { store }));

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
