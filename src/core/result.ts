import { relative } from "node:path";

export type TestStatus = "passed" | "failed" | "skipped";

/** Raw, runner-shaped input. Produced by the Vitest reporter (see core/run). */
export interface RawTestError {
  name?: string;
  message?: string;
  line?: number;
  col?: number;
  file?: string;
  /** Assertion diff sides (TUI detail only — never in the `check` contract). */
  expected?: string;
  actual?: string;
}
export interface RawTest {
  file: string;
  name: string;
  suite?: string;
  status: TestStatus;
  durationMs?: number;
  error?: RawTestError;
  /** Test-definition location (every test, not just failures) — TUI list
   *  "open in editor" only; the `check` contract does not read this. */
  line?: number;
  col?: number;
}
export interface RawRun {
  rootDir: string;
  tests: RawTest[];
  durationMs: number;
}

/** Normalized, deterministic failure — the unit every renderer consumes. */
export interface Failure {
  file: string;
  test: string;
  suite: string;
  line?: number;
  col?: number;
  errorType: string;
  message: string;
  /**
   * Optional assertion diff sides. The text/JSON `check` renderers IGNORE
   * these (contract stays byte-identical, modulo duration); only the live
   * TUI's failure detail renders them. Runner-agnostic — Vitest populates
   * them; Jest leaves them undefined (no human-message parsing).
   */
  expected?: string;
  actual?: string;
}

/** Normalized run result. Single model shared by every renderer (DRY). */
export interface RunResult {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  durationMs: number;
  ok: boolean;
  failures: Failure[];
}

/** Root-relative POSIX path — the canonical file form every renderer uses. */
export function toPosixRelative(rootDir: string, file: string): string {
  return relative(rootDir, file).split("\\").join("/");
}

function firstLine(message: string | undefined): string {
  return (message ?? "").split("\n")[0]?.trim() ?? "";
}

function byFileThenTest(a: Failure, b: Failure): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.test !== b.test) return a.test < b.test ? -1 : 1;
  return 0;
}

export function normalize(raw: RawRun): RunResult {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: Failure[] = [];

  for (const t of raw.tests) {
    if (t.status === "passed") passed++;
    else if (t.status === "skipped") skipped++;
    else {
      failed++;
      const err = t.error ?? {};
      failures.push({
        file: toPosixRelative(raw.rootDir, err.file ?? t.file),
        test: t.name,
        suite: t.suite ?? "",
        line: err.line,
        col: err.col,
        errorType: err.name ?? "Error",
        message: firstLine(err.message),
        // Carried for the TUI only (no I/O here — deterministic). Contract
        // renderers never read these, so `check` bytes are unchanged.
        ...(err.expected !== undefined ? { expected: err.expected } : {}),
        ...(err.actual !== undefined ? { actual: err.actual } : {}),
      });
    }
  }

  failures.sort(byFileThenTest);

  return {
    passed,
    failed,
    skipped,
    total: raw.tests.length,
    durationMs: raw.durationMs,
    ok: failed === 0,
    failures,
  };
}
