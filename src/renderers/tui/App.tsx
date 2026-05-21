import { Box, Text, useApp, useInput, useStdout } from "ink";
import { join } from "node:path";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { RawTest } from "../../core/result.js";
import { toPosixRelative } from "../../core/result.js";
import type { Store } from "../../tui/createStore.js";
import { type TuiState, buildGroupedList, buildSuiteTree } from "../../tui/store.js";
import { failureBlock } from "../summary.js";
import { codeFrame } from "./codeframe.js";
import { useMouse } from "./mouse.js";
import type { Palette } from "./theme.js";

const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Strip the suite prefix from a full test name, leaving just the leaf title. */
function leafName(fullName: string, suite: string | undefined): string {
  if (!suite) return fullName;
  const prefix = suite + " > ";
  return fullName.startsWith(prefix) ? fullName.slice(prefix.length) : fullName;
}

/** Group a live-stream slice of tests by (file, suite) preserving arrival order. */
type StreamGroup = { file: string; suite: string; tests: RawTest[] };
function groupStream(tests: RawTest[]): StreamGroup[] {
  const groups: StreamGroup[] = [];
  let lastKey = "";
  for (const t of tests) {
    const key = `${t.file}\0${t.suite ?? ""}`;
    if (key !== lastKey) {
      groups.push({ file: t.file, suite: t.suite ?? "", tests: [] });
      lastKey = key;
    }
    // groups is always non-empty here since we just pushed when key changed
    groups[groups.length - 1]!.tests.push(t);
  }
  return groups;
}

/**
 * Terminal row (1-indexed) of the test list's first item. The done-list header
 * is a FIXED height so click→item mapping stays a simple linear offset:
 *   row 1 headline · row 2 counters · row 3 range · row 4 blank (marginTop)
 *   → row 5 = first item.
 * Keep this in sync with `TestList`'s layout; nothing conditional may sit above
 * the list (the watch indicator and `notice` live in the footer / below it).
 */
const LIST_TOP_ROW = 5;

/** Map a 1-indexed terminal row to a grouped-list item index (every item is one
 *  row tall). Returns undefined when the row is outside the visible window. */
function rowToItemIndex(
  termRow: number,
  itemCount: number,
  offset: number,
  page: number,
): number | undefined {
  const within = termRow - LIST_TOP_ROW;
  if (within < 0 || within >= page) return undefined;
  const idx = offset + within;
  return idx >= 0 && idx < itemCount ? idx : undefined;
}

const glyph = (st: string) =>
  st === "failed" ? "✗" : st === "passed" ? "✓" : "⊘";
const hue = (p: Palette, st: string) =>
  st === "failed" ? p.fail : st === "passed" ? p.pass : p.skip;

function Counters({
  s,
  elapsed,
  p,
}: {
  s: TuiState;
  elapsed: number;
  p: Palette;
}) {
  const r = s.result;
  return (
    <Box gap={2}>
      <Text color={p.pass}>✓ {r.passed}</Text>
      <Text color={r.failed > 0 ? p.fail : p.skip}>✗ {r.failed}</Text>
      <Text color={p.skip}>⊘ {r.skipped}</Text>
      <Text dimColor>· {(elapsed / 1000).toFixed(1)}s</Text>
    </Box>
  );
}

function relTrigger(s: TuiState): string | undefined {
  const tr = s.watchTrigger;
  if (!tr) return undefined;
  const pre = `${s.rootDir}/`;
  return tr.startsWith(pre) ? tr.slice(pre.length) : tr;
}

/** Live progress while the run is in flight: spinner + counters + a tail of the
 *  arriving tests (arrival order). When the run finishes the main screen
 *  switches to the scrollable `TestList`. */
function Overview({
  s,
  tick,
  elapsed,
  watch,
  p,
  overviewCount,
}: {
  s: TuiState;
  tick: number;
  elapsed: number;
  watch?: boolean;
  p: Palette;
  overviewCount: number;
}) {
  const recent = s.tests.slice(-overviewCount);
  const saved = relTrigger(s);
  const groups = groupStream(recent);
  return (
    <Box flexDirection="column">
      <Text>
        <Text color={p.accent} bold>
          test-reporter{" "}
        </Text>
        <Text color={p.warn}>{SPIN[tick % SPIN.length]} running</Text>
      </Text>
      <Counters s={s} elapsed={elapsed} p={p} />
      {watch && saved !== undefined && (
        <Text color={p.accent}>↻ saved: {saved}</Text>
      )}
      <Box flexDirection="column" marginTop={1}>
        {groups.map((g) => {
          const rel = toPosixRelative(s.rootDir, g.file);
          return (
            <Box key={`${g.file}\0${g.suite}`} flexDirection="column">
              <Text>
                <Text bold color={p.heading}>
                  {rel}
                </Text>
                {g.suite ? (
                  <Text bold color={p.heading}>
                    {"  "}
                    {g.suite}
                  </Text>
                ) : null}
              </Text>
              {g.tests.map((t, i) => (
                <Text key={`${t.file} ${t.name} ${i}`}>
                  {"  "}
                  <Text color={hue(p, t.status)}>{glyph(t.status)}</Text>{" "}
                  <Text dimColor={t.status !== "failed"}>
                    {leafName(t.name, t.suite)}
                  </Text>
                </Text>
              ))}
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>running… · [s]uites · [q]uit</Text>
      </Box>
    </Box>
  );
}

function FailureView({ s, p }: { s: TuiState; p: Palette }) {
  const f = s.result.failures[s.focused];
  if (!f) return <Text dimColor>no failure selected</Text>;
  const lines = failureBlock(f, "cause");
  // TUI-only enrichment (M4): assertion diff (when the runner gave it) and a
  // best-effort source frame around the failing line. `check` is unaffected.
  const hasDiff = f.expected !== undefined || f.actual !== undefined;
  const frame = codeFrame(join(s.rootDir, f.file), f.line, f.col);
  return (
    <Box flexDirection="column">
      <Text color={p.fail} bold>
        {lines[0] ?? ""}
      </Text>
      {lines[1] !== undefined && <Text dimColor>{lines[1]}</Text>}
      {lines[2] !== undefined && <Text color={p.warn}>{lines[2]}</Text>}
      {hasDiff && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={p.pass}>+ expected: {f.expected ?? "—"}</Text>
          <Text color={p.fail}>- received: {f.actual ?? "—"}</Text>
        </Box>
      )}
      {frame.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {frame.map((ln, i) => (
            <Text
              key={`cf${i}`}
              color={ln.startsWith(">") ? p.warn : undefined}
              dimColor={!ln.startsWith(">")}
            >
              {ln}
            </Text>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          failure {s.focused + 1}/{s.result.failures.length} · [n]ext [p]rev ·
          [o]pen · [esc] overview · [q]uit
        </Text>
      </Box>
    </Box>
  );
}

function SuitesView({ s, p }: { s: TuiState; p: Palette }) {
  const tree = buildSuiteTree(s.tests);
  return (
    <Box flexDirection="column">
      <Text color={p.accent} bold>
        suites ({tree.length})
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {tree.length === 0 && <Text dimColor>no tests yet…</Text>}
        {tree.map((node, i) => {
          const sel = i === s.treeFocus;
          const rel = toPosixRelative(s.rootDir, node.file);
          const label = node.suite ? `${rel} › ${node.suite}` : rel;
          return (
            <Text key={`${node.file} ${node.suite}`} inverse={sel}>
              {sel ? "❯ " : "  "}
              <Text color={node.failed > 0 ? p.fail : p.pass}>{label}</Text>{" "}
              <Text dimColor>
                ✓{node.passed} ✗{node.failed} ⊘{node.skipped}
              </Text>
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          [↑]/[↓] move · [enter] open failing · [o]pen file · [s] back · [q]
          quit
        </Text>
      </Box>
    </Box>
  );
}

/** The finished-run main screen: a mouse-driven, scrollable list of every test
 *  grouped by (file, suite). The wheel scrolls; a click opens that test in the
 *  editor; hover underlines the row under the cursor. File + suite headers are
 *  bold white (palette `heading`) so a dev can locate a test fast. No keyboard
 *  cursor — test interaction is 100% mouse. */
function TestList({
  s,
  elapsed,
  watch,
  p,
  hoverIndex,
}: {
  s: TuiState;
  elapsed: number;
  watch?: boolean;
  p: Palette;
  hoverIndex?: number;
}) {
  const items = buildGroupedList(s.tests);
  const offset = Math.min(s.listOffset, Math.max(0, items.length - s.listPage));
  const shown = items.slice(offset, offset + s.listPage);
  const end = Math.min(offset + s.listPage, items.length);
  const n = s.result.failures.length;
  return (
    <Box flexDirection="column">
      <Text>
        <Text color={p.accent} bold>
          test-reporter{" "}
        </Text>
        {n > 0 ? (
          <Text color={p.fail} bold>
            ✗ FAIL
          </Text>
        ) : (
          <Text color={p.pass} bold>
            ✓ PASS
          </Text>
        )}
      </Text>
      <Counters s={s} elapsed={elapsed} p={p} />
      <Text dimColor>
        tests ({items.length === 0 ? 0 : offset + 1}–{end} of {items.length})
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {items.length === 0 && <Text dimColor>no tests…</Text>}
        {shown.map((item, i) => {
          const idx = offset + i;
          const isHovered = idx === hoverIndex;

          if (item.kind === "suite-header") {
            const rel = toPosixRelative(s.rootDir, item.file);
            return (
              <Text key={`h${item.file}\0${item.suite}`}>
                <Text color={p.accent}>▸ </Text>
                <Text bold color={p.heading} underline={isHovered}>
                  {rel}
                </Text>
                {item.suite !== "" && (
                  <Text bold color={p.heading} underline={isHovered}>
                    {"  "}
                    {item.suite}
                  </Text>
                )}
              </Text>
            );
          }

          const t = item.data;
          const leaf = leafName(t.name, t.suite);
          return (
            <Text key={`t${t.file}\0${t.name}`}>
              {"    "}
              <Text color={hue(p, t.status)}>{glyph(t.status)}</Text>{" "}
              <Text
                underline={isHovered}
                color={
                  isHovered
                    ? p.accent
                    : t.status === "failed"
                      ? p.fail
                      : undefined
                }
              >
                {leaf}
              </Text>
              {t.durationMs !== undefined && (
                <Text dimColor>
                  {"  · "}
                  {Math.round(t.durationMs)}ms
                </Text>
              )}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {offset > 0 ? "▲ " : "  "}
          {end < items.length ? "▼ " : "  "}
          clique: abrir no editor · roda: rolar · [s]uites
          {watch ? " · [a]ll [f]ailed" : ""}
          {n > 0 ? " · [n]/[p] falhas" : ""} · [q]uit
        </Text>
      </Box>
    </Box>
  );
}

export function App({
  store,
  watch,
  palette,
}: {
  store: Store;
  watch?: boolean;
  palette: Palette;
}) {
  const s = useSyncExternalStore(store.subscribe, store.getState);
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [tick, setTick] = useState(0);
  const [rows, setRows] = useState(() => stdout?.rows ?? 24);
  const startRef = useRef(Date.now());

  const [hoverRow, setHoverRow] = useState<number | undefined>(undefined);

  // Sync terminal height into the store and keep rows state up to date on resize.
  useEffect(() => {
    const update = () => {
      const r = stdout?.rows ?? 24;
      setRows(r);
      // Keep the whole list view inside the screen so the terminal never scrolls
      // (which would break click→row mapping). Overhead: header(3) + marginTop(1)
      // + footer(2) + an eventual notice(2) = 8 rows.
      const pageSize = Math.max(3, r - 8);
      store.dispatch({ type: "resize", pageSize });
    };
    update();
    stdout?.on("resize", update);
    return () => {
      stdout?.off("resize", update);
    };
  }, [stdout]);

  useMouse({
    onScrollUp: () => store.dispatch({ type: "scroll", delta: -3 }),
    onScrollDown: () => store.dispatch({ type: "scroll", delta: 3 }),
    onClick: (row) => {
      // The clickable list only shows on the finished-run overview. Read fresh
      // state from the store so the mapping never uses a stale render.
      const st = store.getState();
      if (st.phase !== "done" || st.view !== "overview") return;
      const idx = rowToItemIndex(
        row,
        buildGroupedList(st.tests).length,
        st.listOffset,
        st.listPage,
      );
      if (idx !== undefined) store.dispatch({ type: "openAt", index: idx });
    },
    onHover: (row) => setHoverRow(row),
  });

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c"))
      store.dispatch({ type: "key", key: "q" });
    else if (input === "s") store.dispatch({ type: "key", key: "s" });
    else if (input === "o") store.dispatch({ type: "key", key: "open" });
    else if (key.upArrow) store.dispatch({ type: "key", key: "up" });
    else if (key.downArrow) store.dispatch({ type: "key", key: "down" });
    else if (key.return) store.dispatch({ type: "key", key: "enter" });
    else if (input === "n") store.dispatch({ type: "key", key: "n" });
    else if (input === "p") store.dispatch({ type: "key", key: "p" });
    else if (key.escape) store.dispatch({ type: "key", key: "esc" });
    // Watch-only: command the native watcher (consumed by renderWatchTui).
    else if (watch && input === "a") store.dispatch({ type: "key", key: "a" });
    else if (watch && input === "f") store.dispatch({ type: "key", key: "f" });
  });

  useEffect(() => {
    if (s.phase === "done") return;
    const id = setInterval(() => setTick((n) => n + 1), 80);
    return () => clearInterval(id);
  }, [s.phase]);

  useEffect(() => {
    if (s.exited) exit();
  }, [s.exited, exit]);

  const elapsed =
    s.phase === "done" ? s.result.durationMs : Date.now() - startRef.current;

  // Hover highlight only matters on the finished-run list (the clickable view).
  const hoverIndex =
    s.phase === "done" && s.view === "overview" && hoverRow !== undefined
      ? rowToItemIndex(
          hoverRow,
          buildGroupedList(s.tests).length,
          s.listOffset,
          s.listPage,
        )
      : undefined;

  const view =
    s.view === "failure" ? (
      <FailureView s={s} p={palette} />
    ) : s.view === "suites" ? (
      <SuitesView s={s} p={palette} />
    ) : s.phase === "done" ? (
      <TestList
        s={s}
        elapsed={elapsed}
        watch={watch}
        p={palette}
        hoverIndex={hoverIndex}
      />
    ) : (
      <Overview
        s={s}
        tick={tick}
        elapsed={elapsed}
        watch={watch}
        p={palette}
        overviewCount={Math.max(3, rows - 7)}
      />
    );
  // Single place for the transient editor/status notice (DRY across views).
  return (
    <Box flexDirection="column">
      {view}
      {s.notice !== undefined && (
        <Box marginTop={1}>
          <Text color={palette.warn}>» {s.notice}</Text>
        </Box>
      )}
    </Box>
  );
}
