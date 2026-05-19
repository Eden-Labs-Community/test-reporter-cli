import { readFileSync } from "node:fs";

/**
 * A best-effort source code frame around a failing line (M4, TUI-only). The
 * headless `check` contract never calls this — it stays cause+location. Pure
 * apart from one sync file read; any problem (missing file, out-of-range line)
 * yields `[]` and never throws, so the TUI degrades to cause+location.
 */
export function codeFrame(
  file: string,
  line?: number,
  col?: number,
  ctx = 2,
): string[] {
  if (!line || line < 1) return [];

  let src: string;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    return [];
  }

  const all = src.split("\n");
  if (line > all.length) return [];

  const start = Math.max(1, line - ctx);
  const end = Math.min(all.length, line + ctx);
  const gutter = String(end).length;
  const out: string[] = [];

  for (let l = start; l <= end; l++) {
    const mark = l === line ? "> " : "  ";
    out.push(`${mark}${String(l).padStart(gutter)} | ${all[l - 1] ?? ""}`);
    if (l === line && col && col >= 1) {
      out.push(`  ${" ".repeat(gutter)} | ${" ".repeat(col - 1)}^`);
    }
  }
  return out;
}
