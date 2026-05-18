import type { RunResult } from "../core/result.js";

/** Stable, versioned JSON contract (PRD §7). Lists ALL failures. */
export const SCHEMA_VERSION = 1;

export interface JsonFailure {
  file: string;
  test: string;
  suite: string;
  line?: number;
  col?: number;
  errorType: string;
  error: string;
}

export interface JsonReport {
  schemaVersion: number;
  status: "pass" | "fail";
  ok: boolean;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  durationMs: number;
  failures: JsonFailure[];
}

export function buildJsonReport(r: RunResult): JsonReport {
  return {
    schemaVersion: SCHEMA_VERSION,
    status: r.ok ? "pass" : "fail",
    ok: r.ok,
    passed: r.passed,
    failed: r.failed,
    skipped: r.skipped,
    total: r.total,
    durationMs: r.durationMs,
    failures: r.failures.map((f) => {
      const jf: JsonFailure = {
        file: f.file,
        test: f.test,
        suite: f.suite,
        errorType: f.errorType,
        error: f.message,
      };
      if (f.line !== undefined) jf.line = f.line;
      if (f.col !== undefined) jf.col = f.col;
      return jf;
    }),
  };
}

export function formatJson(r: RunResult): string {
  return JSON.stringify(buildJsonReport(r));
}
