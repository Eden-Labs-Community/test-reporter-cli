import { Box, Text, useApp, useInput, useStdout } from "ink";
import { join } from "node:path";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { toPosixRelative } from "../../core/result.js";
import type { Store } from "../../tui/createStore.js";
import {
  type TuiState,
  buildSuiteTree,
  buildTestList,
} from "../../tui/store.js";
import { failureBlock } from "../summary.js";
import { codeFrame } from "./codeframe.js";
import type { Palette } from "./theme.js";

const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
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
  const n = s.result.failures.length;
  const saved = relTrigger(s);
  const footer =
    s.phase === "running"
      ? `running… · [q] quit`
      : watch
        ? `watching… · ${n > 0 ? "[n]/[p] inspect · " : ""}[l]ist [s]uites [a]ll [f]ailed · [q]uit`
        : n > 0
          ? `${n} failure(s) · [n]/[p] inspect · [l]ist [s]uites · [q] quit`
          : "all green · [l]ist [s]uites · [q] quit";
  const headline =
    s.phase === "running" ? (
      <Text color={p.warn}>{SPIN[tick % SPIN.length]} running</Text>
    ) : n > 0 ? (
      <Text color={p.fail} bold>
        ✗ FAIL
      </Text>
    ) : (
      <Text color={p.pass} bold>
        ✓ PASS
      </Text>
    );

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={p.accent} bold>
          test-reporter{" "}
        </Text>
        {headline}
      </Text>
      <Counters s={s} elapsed={elapsed} p={p} />
      {watch && saved !== undefined && (
        <Text color={p.accent}>↻ saved: {saved}</Text>
      )}
      <Box flexDirection="column" marginTop={1}>
        {recent.map((t, i) => (
          <Text key={`${t.file} ${t.name} ${i}`}>
            <Text color={hue(p, t.status)}>{glyph(t.status)}</Text>{" "}
            <Text dimColor={t.status !== "failed"}>{t.name}</Text>
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{footer}</Text>
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

function TestsView({ s, p }: { s: TuiState; p: Palette }) {
  const list = buildTestList(s.tests);
  const offset = Math.min(s.listOffset, Math.max(0, list.length - s.listPage));
  const shown = list.slice(offset, offset + s.listPage);
  const end = Math.min(offset + s.listPage, list.length);
  return (
    <Box flexDirection="column">
      <Text color={p.accent} bold>
        tests{" "}
        <Text dimColor>
          ({list.length === 0 ? 0 : offset + 1}–{end} of {list.length})
        </Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {list.length === 0 && <Text dimColor>no tests yet…</Text>}
        {shown.map((t, i) => {
          const idx = offset + i;
          const sel = idx === s.listFocus;
          const rel = toPosixRelative(s.rootDir, t.file);
          const loc =
            t.line === undefined
              ? rel
              : `${rel}:${t.line}${t.col === undefined ? "" : `:${t.col}`}`;
          return (
            <Box key={`${t.file} ${t.name}`} flexDirection="column" marginBottom={1}>
              <Text>
                <Text color={sel ? p.accent : undefined}>{sel ? "❯ " : "  "}</Text>
                <Text color={hue(p, t.status)}>{glyph(t.status)}</Text>{" "}
                <Text bold={sel} color={t.status === "failed" ? p.fail : undefined}>
                  {t.name}
                </Text>
              </Text>
              <Text dimColor>
                {"    "}
                {loc}
                {t.durationMs === undefined
                  ? ""
                  : ` · ${Math.round(t.durationMs)}ms`}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {offset > 0 ? "▲ " : "  "}
          {end < list.length ? "▼ " : "  "}
          [↑]/[↓] scroll · [PgUp]/[PgDn] page · [enter]/[o] open in editor ·
          [l]/[esc] back · [q] quit
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

  // Sync terminal height into the store and keep rows state up to date on resize.
  useEffect(() => {
    const update = () => {
      const r = stdout?.rows ?? 24;
      setRows(r);
      // Each test item in TestsView = name(1) + path(1) + marginBottom(1) = 3 rows.
      // Fixed overhead: header(1) + marginTop(1) + marginTop(1) + footer(1) = 4 rows.
      const pageSize = Math.max(3, Math.floor((r - 4) / 3));
      store.dispatch({ type: "resize", pageSize });
    };
    update();
    stdout?.on("resize", update);
    return () => { stdout?.off("resize", update); };
  }, [stdout]);

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c"))
      store.dispatch({ type: "key", key: "q" });
    else if (input === "s") store.dispatch({ type: "key", key: "s" });
    else if (input === "l") store.dispatch({ type: "key", key: "l" });
    else if (input === "o") store.dispatch({ type: "key", key: "open" });
    else if (key.pageUp) store.dispatch({ type: "key", key: "pgup" });
    else if (key.pageDown) store.dispatch({ type: "key", key: "pgdn" });
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

  const view =
    s.view === "failure" ? (
      <FailureView s={s} p={palette} />
    ) : s.view === "suites" ? (
      <SuitesView s={s} p={palette} />
    ) : s.view === "tests" ? (
      <TestsView s={s} p={palette} />
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
