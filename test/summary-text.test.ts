import { describe, expect, it } from "vitest";

import { formatText } from "../src/renderers/summary.js";
import type { RunResult } from "../src/core/result.js";

const ANSI = /\[[0-9;]*m/;

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

describe("formatText", () => {
  it("success: exactly the status line, nothing else", () => {
    const out = formatText(
      result({ passed: 146, failed: 0, skipped: 1, total: 147, ok: true }),
    );
    expect(out).toBe("✓ PASS · 146 passed · 0 failed · 1 skipped · 4.2s");
  });

  it("failure: status line + blank + one block per failure", () => {
    const out = formatText(
      result({
        passed: 142,
        failed: 2,
        skipped: 1,
        total: 145,
        ok: false,
        failures: [
          {
            file: "src/api/users.test.ts",
            test: "validates email format",
            suite: "",
            line: 88,
            col: undefined,
            errorType: "AssertionError",
            message: 'expected "a@b" to match /.+@.+/',
          },
          {
            file: "src/auth/login.test.ts",
            test: "rejects expired token",
            suite: "",
            line: 42,
            col: 7,
            errorType: "AssertionError",
            message: "expected 401 to be 200",
          },
        ],
      }),
    );
    expect(out).toBe(
      [
        "✗ FAIL · 142 passed · 2 failed · 1 skipped · 4.2s",
        "",
        "FAIL src/api/users.test.ts › validates email format",
        "  at src/api/users.test.ts:88",
        '  AssertionError: expected "a@b" to match /.+@.+/',
        "FAIL src/auth/login.test.ts › rejects expired token",
        "  at src/auth/login.test.ts:42:7",
        "  AssertionError: expected 401 to be 200",
      ].join("\n"),
    );
  });

  it("never emits ANSI escape codes", () => {
    const out = formatText(
      result({
        failed: 1,
        ok: false,
        failures: [
          { file: "a.test.ts", test: "t", suite: "", errorType: "Error", message: "m" },
        ],
      }),
    );
    expect(out).not.toMatch(ANSI);
  });

  it("is byte-deterministic for the same input", () => {
    const r = result({ passed: 3, total: 3 });
    expect(formatText(r)).toBe(formatText(r));
  });

  it("truncates above maxFailures with a pointer to --json", () => {
    const mk = (n: string) => ({
      file: `${n}.test.ts`,
      test: "t",
      suite: "",
      errorType: "Error",
      message: "m",
    });
    const out = formatText(
      result({
        failed: 3,
        ok: false,
        failures: [mk("a"), mk("b"), mk("c")],
      }),
      { maxFailures: 2 },
    );
    const lines = out.split("\n");
    expect(lines.filter((l) => l.startsWith("FAIL ")).length).toBe(2);
    expect(lines.at(-1)).toBe("… +1 more (use --json)");
  });

  it('detail "list" → only `FAIL file › test` lines, no at/cause', () => {
    const out = formatText(
      result({
        failed: 1,
        ok: false,
        failures: [
          {
            file: "a.test.ts",
            test: "t",
            suite: "",
            line: 9,
            col: 2,
            errorType: "AssertionError",
            message: "boom",
          },
        ],
      }),
      { detail: "list" },
    );
    expect(out).toBe(
      ["✗ FAIL · 0 passed · 1 failed · 0 skipped · 4.2s", "", "FAIL a.test.ts › t"].join(
        "\n",
      ),
    );
  });

  it("omits line/col in the `at` line when absent", () => {
    const out = formatText(
      result({
        failed: 1,
        ok: false,
        failures: [
          { file: "a.test.ts", test: "t", suite: "", errorType: "Error", message: "m" },
        ],
      }),
    );
    expect(out).toContain("\n  at a.test.ts\n");
  });
});
