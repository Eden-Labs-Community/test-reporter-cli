import { spawn } from "node:child_process";
import { join } from "node:path";

import blessed from "blessed";
// Types live as named exports; the default import gives us the runtime module.
import type { Widgets } from "blessed";

import type { Config } from "../../config/index.js";
import { RUNNER_ERROR_EXIT } from "../../core/exit.js";
import type { Failure } from "../../core/result.js";
import { toPosixRelative } from "../../core/result.js";
import {
  RunnerError,
  type WatchHandle,
  runTests,
  watchTests,
} from "../../core/run.js";
import type { Store } from "../../tui/createStore.js";
import { createStore } from "../../tui/createStore.js";
import {
  type TuiState,
  buildVisibleGroups,
  buildVisibleList,
  listStatus,
} from "../../tui/store.js";
import { codeFrame } from "./codeframe.js";
import { editorCommand } from "./editor.js";
import { type Palette, resolvePalette } from "./theme.js";

const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/* ============================================================
 * Text painting via blessed inline tags
 * --------------------------------------------------------------
 *  blessed lights text via `{red-fg}…{/}` tags when `tags: true`
 *  is set on a box. Funneling everything through `paint` means a
 *  mono palette (NO_COLOR / --no-color, resolved upstream) skips
 *  all tags — and we have a single place to evolve color taste.
 * ============================================================ */
type Hue = keyof Omit<Palette, "mono">;
interface PaintOpts {
  color?: Hue;
  bold?: boolean;
  dim?: boolean;
}

function paint(p: Palette, text: string, o: PaintOpts = {}): string {
  if (p.mono) return text;
  let s = text;
  if (o.dim) s = `{gray-fg}${s}{/}`;
  if (o.color) {
    const c = p[o.color];
    if (c) s = `{${c}-fg}${s}{/}`;
  }
  if (o.bold) s = `{bold}${s}{/bold}`;
  return s;
}

const glyphFor = (st: string) =>
  st === "failed" ? "✗" : st === "passed" ? "✓" : "⊘";

function relTrigger(s: TuiState): string | undefined {
  const tr = s.watchTrigger;
  if (!tr) return undefined;
  const pre = `${s.rootDir}/`;
  return tr.startsWith(pre) ? tr.slice(pre.length) : tr;
}

/* ============================================================
 * Failure block for the stderr panel — header + assertion +
 * expected/actual diff (TUI-only enrichment, runner-agnostic)
 * + a best-effort code frame (file I/O behind try/catch). Same
 * data as `check`'s failure block, just visually richer.
 * ============================================================ */
function paintFailure(rootDir: string, p: Palette, f: Failure): string[] {
  const lines: string[] = [];
  lines.push(
    paint(p, `✗ ${f.file} › ${f.test}`, { color: "fail", bold: true }),
  );
  const loc =
    f.line === undefined
      ? `  at ${f.file}`
      : `  at ${f.file}:${f.line}${f.col === undefined ? "" : `:${f.col}`}`;
  lines.push(paint(p, loc, { dim: true }));
  const firstLine = (f.message ?? "").split("\n")[0] ?? "";
  lines.push(paint(p, `  ${f.errorType}: ${firstLine}`, { color: "warn" }));
  if (f.expected !== undefined || f.actual !== undefined) {
    lines.push("");
    lines.push(
      paint(p, `  + expected: ${f.expected ?? "—"}`, { color: "pass" }),
    );
    lines.push(
      paint(p, `  - received: ${f.actual ?? "—"}`, { color: "fail" }),
    );
  }
  const frame = codeFrame(join(rootDir, f.file), f.line, f.col);
  if (frame.length > 0) {
    lines.push("");
    for (const ln of frame) {
      lines.push(
        ln.startsWith(">")
          ? paint(p, ln, { color: "warn" })
          : paint(p, ln, { dim: true }),
      );
    }
  }
  return lines;
}

/* ============================================================
 * `wireEditor`: edge that spawns the configured editor when the
 * store's monotonic `openRequest.seq` advances, and reports back
 * via `notice` so the user always sees what happened.
 * ============================================================ */
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
          text: `couldn't run "${cmd}" — set "ui.editor" in test-reporter-config.json`,
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

export interface TuiOptions {
  /** Explicit `--no-color`; `NO_COLOR` env is also honored downstream. */
  noColor?: boolean;
}

/* ============================================================
 * 3-panel blessed layout factory. Returns the screen and the
 * `render()` you call after every store change.
 *
 *   ┌── Summary ────────────────────────┐  ← 5 rows fixed (last = notice)
 *   ├── Passed | Failed (title flips) ──┤  ← 60% - 5
 *   ├── stderr ────────────────────────┤  ← 40%
 *   └───────────────────────────────────┘
 *
 * The middle panel's title flips with `listStatus(s)` — the user
 * decision driving the rewrite. The border colour of the focused
 * panel highlights tab focus.
 * ============================================================ */
function buildScreen(
  store: Store,
  palette: Palette,
  watch: boolean,
): {
  screen: Widgets.Screen;
  render: () => void;
  destroy: () => void;
} {
  const screen = blessed.screen({
    smartCSR: true,
    title: "test-reporter",
    fullUnicode: true,
  });

  const acc = palette.accent ?? "white";
  const pass = palette.pass ?? "white";
  const fail = palette.fail ?? "white";
  const skip = palette.skip ?? "white";

  const summary = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 5,
    label: " Summary ",
    border: { type: "line" },
    tags: true,
    padding: { left: 1, right: 1 },
    style: {
      border: { fg: acc },
      label: { fg: acc, bold: true },
    },
  });

  // NOTE on mouse wiring: we do NOT set `mouse: true` / `clickable: true` on
  // any element. blessed's per-element click logic
  // (`screen.js`: `(self.mouseDown || el).emit('click', data)`) fires `click`
  // on the *previous* mousedown target whenever ANY mouseup later lands in a
  // clickable element — so a trackpad scroll that started over a chip and
  // ended over the list would fire the chip's click and rerun all tests.
  // Instead we enable mouse capture once and handle everything in a single
  // screen-level handler below, with strict mousedown/mouseup hit-test pairing.
  const listBox = blessed.box({
    parent: screen,
    top: 5,
    left: 0,
    width: "100%",
    height: "60%-5",
    label: " Passed ",
    border: { type: "line" },
    tags: true,
    padding: { left: 1, right: 1 },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: "│", style: { fg: acc } },
    style: {
      border: { fg: pass },
      label: { fg: pass, bold: true },
    },
  });

  const stderrBox = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "40%",
    label: " stderr ",
    border: { type: "line" },
    tags: true,
    padding: { left: 1, right: 1 },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: "│", style: { fg: fail } },
    style: {
      border: { fg: fail },
      label: { fg: fail, bold: true },
    },
  });

  /* ----- Action chips overlayed on the summary border -----
   *
   *   ┌─ Summary ────────────────────[ all ][ failed ][ quit ]─┐
   *
   * Watch-only triggers (`all`/`failed`) only appear in watch mode.
   * `quit` is always present — it is the mouse-only exit path. Pure visual
   * boxes; clicks are dispatched by the screen-level handler below. */
  interface Chip {
    el: Widgets.BoxElement;
    onClick: () => void;
  }
  function makeChip(opts: {
    right: number;
    width: number;
    label: string;
    color: string;
    onClick: () => void;
  }): Chip {
    const el = blessed.box({
      parent: screen,
      top: 0,
      right: opts.right,
      width: opts.width,
      height: 1,
      content: opts.label,
      tags: true,
      style: { fg: opts.color, bold: true },
    });
    return { el, onClick: opts.onClick };
  }
  const chips: Chip[] = [
    makeChip({
      right: 2,
      width: 8,
      label: "[ quit ]",
      color: fail,
      onClick: () => store.dispatch({ type: "key", key: "q" }),
    }),
    ...(watch
      ? [
          makeChip({
            right: 11,
            width: 10,
            label: "[ failed ]",
            color: fail,
            onClick: () => store.dispatch({ type: "key", key: "f" }),
          }),
          makeChip({
            right: 22,
            width: 7,
            label: "[ all ]",
            color: pass,
            onClick: () => store.dispatch({ type: "key", key: "a" }),
          }),
        ]
      : []),
  ];

  let tick = 0;
  const startedAt = Date.now();
  // Updated every `render()` so the listBox click handler can map a click-y
  // coordinate back to a test index. Lives outside `render` because the
  // mouse edge fires asynchronously between renders.
  let testRowLineRef: number[] = [];

  function setBorderFg(box: Widgets.BoxElement, fg: string) {
    // blessed style is loosely typed — guarded mutation keeps TS happy.
    const style = box.style as { border?: { fg?: string } };
    if (style.border) style.border.fg = fg;
  }
  function setLabelFg(box: Widgets.BoxElement, fg: string) {
    const style = box.style as { label?: { fg?: string } };
    if (style.label) style.label.fg = fg;
  }

  function render() {
    const s = store.getState();
    const status = listStatus(s);
    const r = s.result;
    const elapsedMs =
      s.phase === "done" ? r.durationMs : Date.now() - startedAt;

    /* ----- Summary box (4 logical rows + notice strip) ----- */
    const headline =
      s.phase === "running"
        ? paint(palette, `${SPIN[tick % SPIN.length]} running`, {
            color: "warn",
          })
        : status === "failed"
          ? paint(palette, "✗ FAIL", { color: "fail", bold: true })
          : paint(palette, "✓ PASS", { color: "pass", bold: true });
    const counters =
      `${paint(palette, `✓ ${r.passed}`, { color: "pass" })}   ` +
      `${paint(palette, `✗ ${r.failed}`, { color: r.failed > 0 ? "fail" : "skip" })}   ` +
      `${paint(palette, `⊘ ${r.skipped}`, { color: "skip" })}   ` +
      paint(palette, `· ${(elapsedMs / 1000).toFixed(1)}s`, { dim: true });
    const sumLines = [
      `${paint(palette, "test-reporter", { color: "accent", bold: true })}  ${headline}`,
      counters,
    ];
    if (watch) {
      const trig = relTrigger(s);
      sumLines.push(
        trig
          ? paint(palette, `↻ saved: ${trig}`, { color: "accent" })
          : paint(palette, "↻ watching… (click chips above to act)", { dim: true }),
      );
    } else {
      sumLines.push(""); // keep the box height stable
    }
    sumLines.push(
      s.notice ? paint(palette, `» ${s.notice}`, { color: "warn" }) : "",
    );
    summary.setContent(sumLines.join("\n"));

    /* ----- Middle list box (Passed ↔ Failed) -----
     *
     * Layout (per file group):
     *
     *   src/strings.test.ts              ← header (file, accent/bold)
     *     ❯ ✓  strings > split           ← test rows (cursor + glyph + name)
     *       ✓  strings > template > X
     *                                    ← blank gap before next group
     *
     * The file appears once per group instead of repeating under every test —
     * easier to skim. Pressing enter/o on the cursor row still opens that
     * test at its real file:line:col (the location lives in the data, not the
     * display). The mapping `testRowLine[i]` lets us scroll so the focused
     * test (and ideally its header) stays visible. */
    const visible = buildVisibleList(s);
    const groups = buildVisibleGroups(s);
    const labelName = status === "failed" ? "Failed" : "Passed";
    const labelColor = status === "failed" ? fail : pass;
    listBox.setLabel(` ${labelName} (${visible.length}) `);
    setLabelFg(listBox, labelColor);
    setBorderFg(listBox, s.focusedPanel === "list" ? labelColor : skip);

    const listContent: string[] = [];
    const testRowLine: number[] = new Array(visible.length);
    testRowLineRef = testRowLine;
    if (visible.length === 0) {
      listContent.push(paint(palette, "  (no tests yet)", { dim: true }));
    } else {
      groups.forEach((g, gi) => {
        if (gi > 0) listContent.push("");
        const rel = toPosixRelative(s.rootDir, g.file);
        listContent.push(paint(palette, rel, { color: "accent", bold: true }));
        for (const { test: t, indexInList } of g.tests) {
          const sel = s.focusedPanel === "list" && indexInList === s.listFocus;
          const arrow = sel ? "❯ " : "  ";
          const glyph = glyphFor(t.status);
          const hue: Hue =
            t.status === "failed"
              ? "fail"
              : t.status === "passed"
                ? "pass"
                : "skip";
          const row =
            "  " +
            paint(palette, arrow, sel ? { color: "accent", bold: true } : {}) +
            paint(palette, glyph, { color: hue }) +
            "  " +
            paint(palette, t.name, sel ? { bold: true } : {});
          testRowLine[indexInList] = listContent.length;
          listContent.push(row);
        }
      });
    }
    listBox.setContent(listContent.join("\n"));
    // Scroll so the focused test (and its file header just above) stay visible.
    const focusLine = testRowLine[s.listFocus];
    listBox.setScroll(focusLine === undefined ? 0 : Math.max(0, focusLine - 1));

    /* ----- stderr box ----- */
    setBorderFg(
      stderrBox,
      s.focusedPanel === "stderr" ? fail : skip,
    );
    const stderrLines: string[] = [];
    if (r.failures.length === 0) {
      stderrLines.push(paint(palette, "  —", { dim: true }));
    } else {
      r.failures.forEach((f, i) => {
        if (i > 0) stderrLines.push("");
        stderrLines.push(...paintFailure(s.rootDir, palette, f));
      });
    }
    stderrBox.setContent(stderrLines.join("\n"));
    stderrBox.setScroll(s.stderrOffset);

    screen.render();
  }

  // Animate the spinner while running — no work when done.
  const spinTimer = setInterval(() => {
    if (store.getState().phase === "running") {
      tick++;
      render();
    }
  }, 80);

  /* ----- Mouse wiring (single screen-level handler) -----
   *
   * Mouse-only UX (2026-05-26 rewrite). We use ONE screen handler instead of
   * per-element listeners to bypass a blessed bug: when a `clickable` element
   * registers a mousedown, ANY later mouseup on any clickable target fires
   * the original element's `click`. On a trackpad, scroll gestures emit
   * mousedown over wherever the cursor sits — typically near a chip — and the
   * eventual mouseup over the list would then fire `[ all ]`, retesting
   * everything. Strict hit-test pairing (mousedown AND mouseup in the same
   * target) eliminates the misfire.
   *
   *   • click on a test row     → select it AND open in editor
   *   • click on list/stderr    → take that panel's scroll focus
   *   • wheel on list           → move the cursor up/down
   *   • wheel on stderr         → scroll its content offset
   *   • click on a chip         → drive its action (quit / all / failed)
   *
   * The only kept keyboard binding is Ctrl-C — a safety escape if mouse
   * capture is unavailable (some emulators, screen readers, ssh sessions).
   * --------------------------------------------------------------------- */
  interface MouseData {
    x: number;
    y: number;
    action: "mousedown" | "mouseup" | "wheelup" | "wheeldown" | string;
  }
  interface Lpos {
    xi: number;
    xl: number;
    yi: number;
    yl: number;
  }
  const lpos = (b: Widgets.BoxElement): Lpos | undefined =>
    (b as unknown as { lpos?: Lpos }).lpos;
  const inside = (p: Lpos | undefined, x: number, y: number): boolean =>
    !!p && x >= p.xi && x < p.xl && y >= p.yi && y < p.yl;

  type Target = { kind: "list" | "stderr" } | { kind: "chip"; index: number };
  function targetAt(x: number, y: number): Target | null {
    // Chips first: they overlay the summary border in the top row.
    for (let i = 0; i < chips.length; i++) {
      const chip = chips[i];
      if (chip && inside(lpos(chip.el), x, y))
        return { kind: "chip", index: i };
    }
    if (inside(lpos(listBox), x, y)) return { kind: "list" };
    if (inside(lpos(stderrBox), x, y)) return { kind: "stderr" };
    return null;
  }
  function sameTarget(a: Target | null, b: Target | null): boolean {
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === "chip" && b.kind === "chip") return a.index === b.index;
    return true;
  }

  let pressed: Target | null = null;
  screen.on("mouse", (data: MouseData) => {
    if (data.action === "mousedown") {
      pressed = targetAt(data.x, data.y);
      return;
    }
    if (data.action === "mouseup") {
      const up = targetAt(data.x, data.y);
      const press = pressed;
      pressed = null;
      if (!press || !sameTarget(press, up)) return; // strict pairing
      if (press.kind === "chip") {
        chips[press.index]?.onClick();
        return;
      }
      if (press.kind === "list") {
        // Map click-y → list content line → test index. Open the test in one
        // gesture if a row matched; otherwise just take scroll focus.
        const b = listBox as unknown as {
          atop: number;
          itop: number;
          childBase: number;
        };
        const contentLine = data.y - b.atop - b.itop + b.childBase;
        const idx = testRowLineRef.findIndex((l) => l === contentLine);
        if (idx >= 0) {
          store.dispatch({ type: "selectListIndex", index: idx });
          store.dispatch({ type: "key", key: "open" });
        } else {
          store.dispatch({ type: "focusPanel", panel: "list" });
        }
        return;
      }
      // stderr
      store.dispatch({ type: "focusPanel", panel: "stderr" });
      return;
    }
    if (data.action === "wheelup" || data.action === "wheeldown") {
      const dir = data.action === "wheelup" ? "up" : "down";
      const t = targetAt(data.x, data.y);
      if (!t) return;
      if (t.kind === "list") {
        store.dispatch({ type: "focusPanel", panel: "list" });
        store.dispatch({ type: "key", key: dir });
      } else if (t.kind === "stderr") {
        store.dispatch({ type: "focusPanel", panel: "stderr" });
        store.dispatch({ type: "key", key: dir });
      }
      // wheel over chips: ignored.
    }
  });
  // Enable mouse capture explicitly (no per-element `mouse:true` does it now).
  screen.enableMouse();

  // Safety escape: clean teardown if the user falls back to Ctrl-C. No other
  // keyboard bindings — the rest of the UI is mouse-driven by design.
  screen.key(["C-c"], () => store.dispatch({ type: "key", key: "q" }));

  return {
    screen,
    render,
    destroy: () => {
      clearInterval(spinTimer);
      // Chips live as screen children; screen.destroy() releases them.
      void chips;
      screen.destroy();
    },
  };
}

/* ============================================================
 * `renderTui` — live TUI for `run` (TTY only). Streams runner
 * events into the store; mouse drives everything (click a row
 * to open it in the editor, wheel to scroll, chips on the
 * Summary border to act). Returns the process exit code (same
 * contract as `check`; never a false PASS on runner/config error).
 * ============================================================ */
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
  const ui = buildScreen(store, palette, /*watch*/ false);
  const unwireEditor = wireEditor(store, config.ui.editor);
  const unsubRender = store.subscribe(() => ui.render());
  ui.render();

  return new Promise<number>((resolve) => {
    let fatal: Error | undefined;

    const unsubExit = store.subscribe(() => {
      if (!store.getState().exited) return;
      unsubExit();
      unsubRender();
      unwireEditor();
      ui.destroy();
      if (fatal) {
        const name = fatal instanceof RunnerError ? "RunnerError" : fatal.name;
        process.stderr.write(`${name}: ${fatal.message}\n`);
        resolve(RUNNER_ERROR_EXIT);
      } else {
        resolve(store.getState().exitCode);
      }
    });

    runTests(cwd, config, (e) => store.dispatch(e)).catch((err: unknown) => {
      fatal = err instanceof Error ? err : new Error(String(err));
      // Push exit through the store so teardown follows the same path (DRY).
      store.dispatch({ type: "key", key: "q" });
    });
  });
}

/* ============================================================
 * `renderWatchTui` — same UI but wired to a `WatchHandle`. The
 * `[ all ]` / `[ failed ]` chips on the Summary border trigger
 * the watcher; both go through the store's monotonic `command`
 * (one effect per click, even on a double-tap). The `[ quit ]`
 * chip (or Ctrl-C) tears down the watcher cleanly.
 * ============================================================ */
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
  const ui = buildScreen(store, palette, /*watch*/ true);
  const unwireEditor = wireEditor(store, config.ui.editor);
  const unsubRender = store.subscribe(() => ui.render());
  ui.render();

  let handle: WatchHandle | undefined;
  let fatal: Error | undefined;
  try {
    handle = await watchTests(cwd, config, (e) => store.dispatch(e));
  } catch (err) {
    fatal = err instanceof Error ? err : new Error(String(err));
    store.dispatch({ type: "key", key: "q" });
  }

  let lastCmdSeq = 0;
  const unsubCmd = store.subscribe(() => {
    const cmd = store.getState().command;
    if (!handle || !cmd || cmd.seq === lastCmdSeq) return;
    lastCmdSeq = cmd.seq;
    if (cmd.kind === "all") handle.triggerAll();
    else handle.triggerFailed();
  });

  return new Promise<number>((resolve) => {
    const unsubExit = store.subscribe(() => {
      if (!store.getState().exited) return;
      unsubExit();
      unsubRender();
      unsubCmd();
      unwireEditor();
      void (async () => {
        if (handle) await handle.close();
        ui.destroy();
        if (fatal) {
          const name = fatal instanceof RunnerError ? "RunnerError" : fatal.name;
          process.stderr.write(`${name}: ${fatal.message}\n`);
          resolve(RUNNER_ERROR_EXIT);
        } else {
          resolve(store.getState().exitCode);
        }
      })();
    });
  });
}
