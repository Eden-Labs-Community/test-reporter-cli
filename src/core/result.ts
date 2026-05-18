import { relative } from "node:path";

export type TestStatus = "passed" | "failed" | "skipped";

/** Raw, runner-shaped input. Produced by the Vitest reporter (see core/run). */
export interface RawTestError {
  name?: string;
  message?: string;
  line?: number;
  col?: number;
  file?: string;
}
export interface RawTest {
  file: string;
  name: string;
  suite?: string;
  status: TestStatus;
  durationMs?: number;
  error?: RawTestError;
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

function toPosixRelative(rootDir: string, file: string): string {
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
