import { isAbsolute, resolve } from "node:path";

import type { RunEvent } from "../core/events.js";
import {
  type RawTest,
  type RunResult,
  normalize,
} from "../core/result.js";

/**
 * Visible rows in the scrollable list (and the page-jump unit for stderr).
 * Render-side panels enforce their own visual height; this is the *logical*
 * page size that the pure reducer uses for `pgup`/`pgdn` and window-sliding.
 */
export const LIST_PAGE = 8;

/**
 * Which panel currently owns scroll/arrow input. Tab toggles. The list panel
 * (middle box) is the only one that has a "current item" — `enter`/`o` always
 * opens that one regardless of which panel has scroll focus.
 */
export type FocusedPanel = "list" | "stderr";

export interface TuiState {
  phase: "running" | "done";
  rootDir: string;
  /** Terminal tests seen so far (deduped upstream by the streaming adapter). */
  tests: RawTest[];
  /** Always `normalize(...)` of `tests` — same model/ordering as `check` (DRY). */
  result: RunResult;
  /** Which of the two scrollable panels owns up/down/PgUp/PgDn. */
  focusedPanel: FocusedPanel;
  /** Selection + scroll window into `buildVisibleList(s)` (middle box). */
  listFocus: number;
  listOffset: number;
  /** Scroll offset into the stderr box; the renderer clamps to its content height. */
  stderrOffset: number;
  /**
   * "Open this test in the editor" intent. `seq` is monotonic so the edge
   * (renderTui) spawns the editor once per press — same discipline as
   * `command`/`exited`. The store stays pure; spawning is the thin edge.
   */
  openRequest?: { file: string; line?: number; col?: number; seq: number };
  /** Transient status line (e.g. "opening …" / "couldn't run editor — set ui.editor"). */
  notice?: string;
  exited: boolean;
  exitCode: number;
  /** Watch (M3): the saved source file that triggered the current cycle (RF-04). */
  watchTrigger?: string;
  /**
   * Watch (M3): a re-run requested via `a`/`f`. `seq` is monotonic so the edge
   * (renderWatchTui) acts once per press even when the same kind repeats.
   */
  command?: { kind: "all" | "failed"; seq: number };
}

/** Store inputs: runner lifecycle events + UI events (mouse edges in v1.2,
 *  keyboard inputs kept for the store's unit tests and as a safety escape). */
export type Input =
  | RunEvent
  | { type: "notice"; text: string } // edge → store (editor spawn result)
  /** Mouse: click a row in the visible list (selects + scroll-window adjust). */
  | { type: "selectListIndex"; index: number }
  /** Mouse: click a panel to take scroll focus (so wheel scroll applies there). */
  | { type: "focusPanel"; panel: FocusedPanel }
  | {
      type: "key";
      key:
        | "q"
        | "tab"
        | "up"
        | "down"
        | "pgup"
        | "pgdn"
        | "enter"
        | "open"
        | "a"
        | "f";
    };

/**
 * The middle panel's title flips with the overall verdict — this is the user
 * decision driving the 2026-05-25 rewrite: "Passed" while everything passes,
 * "Failed" the moment any test fails. Derived (never stored) so it is always
 * consistent with `result.failed`.
 */
export function listStatus(s: TuiState): "passed" | "failed" {
  return s.result.failed > 0 ? "failed" : "passed";
}

/**
 * Pure selector: tests shown in the middle box — passed while all green,
 * failed once any fail. Ordering:
 *
 *   1. by file (alphabetical, so the groups are predictable);
 *   2. within a file, by **source order** (`line` then `col`), so a test
 *      written first appears first — what the user expects when scanning a
 *      file in the editor. Tests without a location fall back to name.
 *
 * Source order (decision 2026-05-25) intentionally diverges from the `check`
 * contract's alphabetical sort: this is TUI-only and `check` byte output is
 * unaffected (renderers there ignore `line`/`col`).
 */
export function buildVisibleList(s: TuiState): RawTest[] {
  const want = listStatus(s); // "passed" | "failed"
  return s.tests
    .filter((t) => t.status === want)
    .sort((a, b) => {
      if (a.file !== b.file) return a.file < b.file ? -1 : 1;
      const al = a.line ?? Number.POSITIVE_INFINITY;
      const bl = b.line ?? Number.POSITIVE_INFINITY;
      if (al !== bl) return al - bl;
      const ac = a.col ?? 0;
      const bc = b.col ?? 0;
      if (ac !== bc) return ac - bc;
      // Fall back to name when locations are absent or tied (e.g. test.each).
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
}

/** Visible list grouped by file. File order matches `buildVisibleList` (sorted),
 *  tests within a group keep their flat-list order. The flat-list index of each
 *  test (`indexInList`) is what `listFocus` points at, so the renderer can map
 *  the selection back to a visual row even though headers sit between groups. */
export interface VisibleGroup {
  file: string;
  tests: { test: RawTest; indexInList: number }[];
}
export function buildVisibleGroups(s: TuiState): VisibleGroup[] {
  const flat = buildVisibleList(s);
  const groups: VisibleGroup[] = [];
  flat.forEach((test, indexInList) => {
    const last = groups[groups.length - 1];
    if (last && last.file === test.file) last.tests.push({ test, indexInList });
    else groups.push({ file: test.file, tests: [{ test, indexInList }] });
  });
  return groups;
}

/** Pure: keep `focus` in range and the scroll window around it. */
function windowAround(
  focus: number,
  offset: number,
  len: number,
): { focus: number; offset: number } {
  if (len <= 0) return { focus: 0, offset: 0 };
  const f = Math.min(Math.max(focus, 0), len - 1);
  let o = offset;
  if (f < o) o = f;
  else if (f >= o + LIST_PAGE) o = f - LIST_PAGE + 1;
  o = Math.max(0, Math.min(o, Math.max(0, len - LIST_PAGE)));
  return { focus: f, offset: o };
}

function recompute(rootDir: string, tests: RawTest[], durationMs: number) {
  return normalize({ rootDir, tests, durationMs });
}

export function initState(rootDir: string): TuiState {
  return {
    phase: "running",
    rootDir,
    tests: [],
    result: recompute(rootDir, [], 0),
    focusedPanel: "list",
    listFocus: 0,
    listOffset: 0,
    stderrOffset: 0,
    exited: false,
    exitCode: 0,
  };
}

/** Always hand the editor a clean ABSOLUTE path: it is spawned detached with
 *  no controlled cwd, so a relative path would resolve unpredictably. */
function absFile(rootDir: string, file: string): string {
  return isAbsolute(file) ? resolve(file) : resolve(rootDir, file);
}

/** The (file, line, col) the "open in editor" key targets: always the test
 *  currently focused in the visible list — regardless of which panel has
 *  scroll focus. The list is where test identity lives. */
function openTarget(
  s: TuiState,
): { file: string; line?: number; col?: number } | undefined {
  const list = buildVisibleList(s);
  const t = list[s.listFocus];
  if (!t) return undefined;
  return { file: absFile(s.rootDir, t.file), line: t.line, col: t.col };
}

function requestOpen(s: TuiState): TuiState {
  const target = openTarget(s);
  if (!target) return s;
  // Show the REAL absolute path being opened — no relative display that could
  // look like it is missing a directory (this confused a user otherwise).
  const at =
    target.line === undefined ? target.file : `${target.file}:${target.line}`;
  return {
    ...s,
    openRequest: { ...target, seq: (s.openRequest?.seq ?? 0) + 1 },
    notice: `opening ${at}`,
  };
}

export function reduce(s: TuiState, input: Input): TuiState {
  switch (input.type) {
    case "notice":
      return { ...s, notice: input.text };

    case "focusPanel":
      return { ...s, focusedPanel: input.panel };

    case "selectListIndex": {
      // Mouse click on a test row: move the cursor to that row, slide the
      // scroll window to keep it visible, and take list scroll-focus so wheel
      // events apply here without a second click. Clamped by `windowAround`.
      const list = buildVisibleList(s);
      const w = windowAround(input.index, s.listOffset, list.length);
      return {
        ...s,
        focusedPanel: "list",
        listFocus: w.focus,
        listOffset: w.offset,
      };
    }

    case "test": {
      const tests = [...s.tests, input.test];
      const result = recompute(s.rootDir, tests, s.result.durationMs);
      // When the listStatus flips (no failures → at least one, or back), the
      // visible list contents change — reset the cursor so it doesn't dangle
      // off-list. This is the practical edge of the user's "title flips" ask.
      const flipped = (s.result.failed === 0) !== (result.failed === 0);
      return {
        ...s,
        tests,
        result,
        listFocus: flipped ? 0 : s.listFocus,
        listOffset: flipped ? 0 : s.listOffset,
      };
    }

    case "done": {
      const result = normalize(input.run);
      return {
        ...s,
        phase: "done",
        tests: input.run.tests,
        result,
        exitCode: result.failed === 0 ? 0 : 1,
      };
    }

    case "rerun": {
      // Watch (M3) starts a fresh cycle: per-cycle counters reset and the UI
      // returns to a clean state. Decision #18 (last-failed-wins) re-applies
      // naturally as the new cycle's tests stream in. `watchTrigger` = the
      // saved file (RF-04) so the renderer can surface it.
      return {
        ...s,
        phase: "running",
        tests: [],
        result: recompute(s.rootDir, [], 0),
        focusedPanel: "list",
        listFocus: 0,
        listOffset: 0,
        stderrOffset: 0,
        watchTrigger: input.trigger,
      };
    }

    case "key": {
      switch (input.key) {
        case "q":
          return { ...s, exited: true };

        case "tab":
          return {
            ...s,
            focusedPanel: s.focusedPanel === "list" ? "stderr" : "list",
          };

        case "up": {
          if (s.focusedPanel === "list") {
            const list = buildVisibleList(s);
            const w = windowAround(s.listFocus - 1, s.listOffset, list.length);
            return { ...s, listFocus: w.focus, listOffset: w.offset };
          }
          return { ...s, stderrOffset: Math.max(0, s.stderrOffset - 1) };
        }

        case "down": {
          if (s.focusedPanel === "list") {
            const list = buildVisibleList(s);
            const w = windowAround(s.listFocus + 1, s.listOffset, list.length);
            return { ...s, listFocus: w.focus, listOffset: w.offset };
          }
          // Renderer clamps to actual content height; the store just monotonically
          // bumps so the user can scroll past whatever is currently rendered.
          return { ...s, stderrOffset: s.stderrOffset + 1 };
        }

        case "pgup": {
          if (s.focusedPanel === "list") {
            const list = buildVisibleList(s);
            const w = windowAround(
              s.listFocus - LIST_PAGE,
              s.listOffset,
              list.length,
            );
            return { ...s, listFocus: w.focus, listOffset: w.offset };
          }
          return {
            ...s,
            stderrOffset: Math.max(0, s.stderrOffset - LIST_PAGE),
          };
        }

        case "pgdn": {
          if (s.focusedPanel === "list") {
            const list = buildVisibleList(s);
            const w = windowAround(
              s.listFocus + LIST_PAGE,
              s.listOffset,
              list.length,
            );
            return { ...s, listFocus: w.focus, listOffset: w.offset };
          }
          return { ...s, stderrOffset: s.stderrOffset + LIST_PAGE };
        }

        case "enter":
        case "open":
          return requestOpen(s);

        case "a":
          return {
            ...s,
            command: { kind: "all", seq: (s.command?.seq ?? 0) + 1 },
          };
        case "f":
          return {
            ...s,
            command: { kind: "failed", seq: (s.command?.seq ?? 0) + 1 },
          };
      }
    }
  }
}
