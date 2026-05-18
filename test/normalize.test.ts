import { describe, expect, it } from "vitest";

import { normalize, type RawRun } from "../src/core/result.js";

const ROOT = "/abs/project";

function raw(partial: Partial<RawRun> & Pick<RawRun, "tests">): RawRun {
  return { rootDir: ROOT, durationMs: 1234, ...partial };
}

describe("normalize", () => {
  it("counts passed / failed / skipped / total", () => {
    const r = normalize(
      raw({
        tests: [
          { file: `${ROOT}/a.test.ts`, name: "a1", status: "passed" },
          { file: `${ROOT}/a.test.ts`, name: "a2", status: "skipped" },
          {
            file: `${ROOT}/a.test.ts`,
            name: "a3",
            status: "failed",
            error: { name: "AssertionError", message: "boom" },
          },
        ],
      }),
    );
    expect(r).toMatchObject({ passed: 1, skipped: 1, failed: 1, total: 3, ok: false });
    expect(r.durationMs).toBe(1234);
  });

  it("all passing → ok true, no failures", () => {
    const r = normalize(
      raw({ tests: [{ file: `${ROOT}/x.test.ts`, name: "ok", status: "passed" }] }),
    );
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it("relativizes paths to POSIX and keeps only the first line of the message", () => {
    const r = normalize(
      raw({
        tests: [
          {
            file: `${ROOT}/src/auth/login.test.ts`,
            name: "rejects expired token",
            status: "failed",
            error: {
              name: "AssertionError",
              message: "expected 401 to be 200\n  at deeper\n  more",
              line: 42,
              col: 7,
            },
          },
        ],
      }),
    );
    expect(r.failures[0]).toEqual({
      file: "src/auth/login.test.ts",
      test: "rejects expired token",
      suite: "",
      line: 42,
      col: 7,
      errorType: "AssertionError",
      message: "expected 401 to be 200",
    });
  });

  it("sorts failures deterministically by (file, test)", () => {
    const r = normalize(
      raw({
        tests: [
          { file: `${ROOT}/b.test.ts`, name: "z", status: "failed", error: { message: "e" } },
          { file: `${ROOT}/a.test.ts`, name: "b", status: "failed", error: { message: "e" } },
          { file: `${ROOT}/a.test.ts`, name: "a", status: "failed", error: { message: "e" } },
        ],
      }),
    );
    expect(r.failures.map((f) => `${f.file} ${f.test}`)).toEqual([
      "a.test.ts a",
      "a.test.ts b",
      "b.test.ts z",
    ]);
  });

  it("defaults errorType to Error when missing", () => {
    const r = normalize(
      raw({
        tests: [{ file: `${ROOT}/a.test.ts`, name: "t", status: "failed", error: { message: "x" } }],
      }),
    );
    expect(r.failures[0]!.errorType).toBe("Error");
  });
});
