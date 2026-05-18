import { describe, expect, it } from "vitest";

import { RUNNER_ERROR_EXIT, resultExitCode } from "../src/core/exit.js";
import { formatJson } from "../src/renderers/json.js";
import type { RunResult } from "../src/core/result.js";

function result(over: Partial<RunResult> = {}): RunResult {
  return {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    durationMs: 4234,
    ok: true,
    failures: [],
    ...over,
  };
}

describe("formatJson", () => {
  it("success → valid JSON, status pass, ok true, empty failures", () => {
    const json = formatJson(result({ passed: 146, skipped: 1, total: 147 }));
    const obj = JSON.parse(json);
    expect(obj).toMatchObject({
      schemaVersion: 1,
      status: "pass",
      ok: true,
      passed: 146,
      failed: 0,
      skipped: 1,
      total: 147,
      durationMs: 4234,
      failures: [],
    });
  });

  it("failure → status fail and lists ALL failures (no truncation)", () => {
    const mk = (n: string) => ({
      file: `${n}.test.ts`,
      test: "t",
      suite: "s",
      line: 1,
      col: 2,
      errorType: "AssertionError",
      message: "boom",
    });
    const json = formatJson(
      result({ failed: 60, ok: false, total: 60, failures: Array.from({ length: 60 }, (_, i) => mk(String(i))) }),
    );
    const obj = JSON.parse(json);
    expect(obj.status).toBe("fail");
    expect(obj.ok).toBe(false);
    expect(obj.failures).toHaveLength(60);
    expect(obj.failures[0]).toEqual({
      file: "0.test.ts",
      test: "t",
      suite: "s",
      line: 1,
      col: 2,
      errorType: "AssertionError",
      error: "boom",
    });
  });

  it("is byte-deterministic for the same input", () => {
    const r = result({ passed: 2, total: 2 });
    expect(formatJson(r)).toBe(formatJson(r));
  });
});

describe("exit codes", () => {
  it("0 when ok, 1 when a test failed", () => {
    expect(resultExitCode(result({ ok: true }))).toBe(0);
    expect(resultExitCode(result({ ok: false, failed: 1 }))).toBe(1);
  });

  it("runner/config error exit code is > 1", () => {
    expect(RUNNER_ERROR_EXIT).toBeGreaterThan(1);
  });
});
