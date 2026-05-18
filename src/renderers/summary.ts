import type { Failure, RunResult } from "../core/result.js";

/** Deterministic, ANSI-free text verdict. Implements the PRD §7 contract. */

function fmtDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusLine(r: RunResult): string {
  const icon = r.ok ? "✓ PASS" : "✗ FAIL";
  return `${icon} · ${r.passed} passed · ${r.failed} failed · ${r.skipped} skipped · ${fmtDuration(r.durationMs)}`;
}

/** One failure rendered as lines. Shared by the text verdict and the TUI (DRY). */
export function failureBlock(f: Failure, detail: "list" | "cause"): string[] {
  const head = `FAIL ${f.file} › ${f.test}`;
  if (detail === "list") return [head];
  const at =
    f.line === undefined
      ? `  at ${f.file}`
      : `  at ${f.file}:${f.line}${f.col === undefined ? "" : `:${f.col}`}`;
  return [head, at, `  ${f.errorType}: ${f.message}`];
}

export interface FormatTextOptions {
  maxFailures?: number;
  detail?: "list" | "cause";
}

export function formatText(r: RunResult, opts: FormatTextOptions = {}): string {
  const status = statusLine(r);
  if (r.failures.length === 0) return status;

  const max = opts.maxFailures ?? 50;
  const detail = opts.detail ?? "cause";
  const shown = r.failures.slice(0, max);
  const lines: string[] = [status, ""];
  for (const f of shown) lines.push(...failureBlock(f, detail));

  const hidden = r.failures.length - shown.length;
  if (hidden > 0) lines.push(`… +${hidden} more (use --json)`);
  return lines.join("\n");
}
