import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// E2E: spawn the CLI as a CHILD PROCESS (via tsx) against fixtures. Never run
// the core inside this Vitest worker — see CLAUDE.md (Vitest reentrancy).
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TSX = join(ROOT, "node_modules", ".bin", "tsx");
const CLI = join(ROOT, "src", "cli.ts");
const fixture = (name: string) => join(ROOT, "test", "fixtures", name);

interface Run {
  stdout: string;
  stderr: string;
  code: number;
}
function cli(cmd: "check" | "run", fixtureName: string, extra: string[]): Run {
  const r = spawnSync(
    TSX,
    [CLI, cmd, "--cwd", fixture(fixtureName), ...extra],
    { encoding: "utf8" },
  );
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", code: r.status ?? -1 };
}
const check = (fixtureName: string, extra: string[] = []): Run =>
  cli("check", fixtureName, extra);
const run = (fixtureName: string, extra: string[] = []): Run =>
  cli("run", fixtureName, extra);
/** Duration is inherently non-deterministic; normalize it for byte assertions. */
const stripDur = (s: string) => s.replace(/\d+\.\d+s/g, "<dur>s");

const T = 30_000;

describe("check (e2e)", () => {
  it("pass fixture → explicit PASS, exit 0, clean stderr", () => {
    const r = check("pass");
    expect(stripDur(r.stdout)).toBe(
      "✓ PASS · 2 passed · 0 failed · 0 skipped · <dur>s\n",
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  }, T);

  it("mixed fixture → FAIL block with location + cause, exit 1", () => {
    const r = check("mixed");
    expect(stripDur(r.stdout)).toBe(
      [
        "✗ FAIL · 1 passed · 1 failed · 1 skipped · <dur>s",
        "",
        "FAIL src/feature.test.ts › feature > is broken",
        "  at src/feature.test.ts:8:3",
        "  AssertionError: expected 2 to be 5 // Object.is equality",
        "",
      ].join("\n"),
    );
    expect(r.code).toBe(1);
  }, T);

  it("--json → valid stable contract, exit 1", () => {
    const r = check("fail", ["--json"]);
    const obj = JSON.parse(r.stdout);
    expect(obj).toMatchObject({
      schemaVersion: 1,
      status: "fail",
      ok: false,
      failed: 1,
      total: 1,
    });
    expect(obj.failures[0]).toMatchObject({
      file: "src/broken.test.ts",
      test: "is wrong",
      errorType: "AssertionError",
    });
    expect(r.code).toBe(1);
  }, T);

  it("invalid config → exit 2, empty stdout, actionable stderr", () => {
    const r = check("config-invalid");
    expect(r.stdout).toBe("");
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("ConfigError");
    expect(r.stderr).toContain("summary.detail");
  }, T);

  it("runner error → exit 2, empty stdout (no false PASS)", () => {
    const r = check("runner-error");
    expect(r.stdout).toBe("");
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("RunnerError");
  }, T);

  it("is deterministic across runs (modulo duration)", () => {
    const a = stripDur(check("mixed").stdout);
    const b = stripDur(check("mixed").stdout);
    expect(a).toBe(b);
  }, T);
});

// Same contract, different runner: proves the adapter abstraction keeps
// `check`'s output runner-agnostic (config picks vitest vs jest).
describe("check (e2e) — jest adapter", () => {
  it("jest pass fixture → explicit PASS, exit 0, clean stderr", () => {
    const r = check("jest-pass");
    expect(stripDur(r.stdout)).toBe(
      "✓ PASS · 2 passed · 0 failed · 0 skipped · <dur>s\n",
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  }, T);

  it("jest mixed fixture → same FAIL grammar (location + cause), exit 1", () => {
    const r = check("jest-mixed");
    expect(stripDur(r.stdout)).toBe(
      [
        "✗ FAIL · 1 passed · 1 failed · 1 skipped · <dur>s",
        "",
        "FAIL src/feature.test.js › feature > is broken",
        "  at src/feature.test.js:6:3",
        "  Error: expect(received).toBe(expected) // Object.is equality",
        "",
      ].join("\n"),
    );
    expect(r.code).toBe(1);
  }, T);

  it("emits the same byte verdict whether vitest or jest produced the run", () => {
    expect(stripDur(check("jest-pass").stdout)).toBe(
      stripDur(check("pass").stdout),
    );
  }, T);
});

// `run` is the flagship TUI, but headless (non-TTY: piped stdout here) it MUST
// fall back to the exact `check` contract — same bytes, same exit codes.
describe("run (e2e) — non-TTY falls back to the check contract", () => {
  it("run == check on a passing project (exit 0)", () => {
    const a = run("pass");
    expect(stripDur(a.stdout)).toBe(stripDur(check("pass").stdout));
    expect(a.code).toBe(0);
    expect(a.stderr).toBe("");
  }, T);

  it("run == check on failures, incl. exit 1 and --json", () => {
    const a = run("mixed");
    expect(stripDur(a.stdout)).toBe(stripDur(check("mixed").stdout));
    expect(a.code).toBe(1);
    // JSON contract carries runtime durationMs by design — compare modulo it.
    const noDur = (s: string) => {
      const o = JSON.parse(s);
      delete o.durationMs;
      return o;
    };
    expect(noDur(run("mixed", ["--json"]).stdout)).toEqual(
      noDur(check("mixed", ["--json"]).stdout),
    );
  }, T);

  it("run == check through the jest adapter too", () => {
    expect(stripDur(run("jest-pass").stdout)).toBe(
      stripDur(check("jest-pass").stdout),
    );
    expect(run("jest-mixed").code).toBe(1);
  }, T);

  it("run keeps exit > 1 + clean stdout on a runner error", () => {
    const a = run("runner-error");
    expect(a.stdout).toBe("");
    expect(a.code).toBe(2);
    expect(a.stderr).toContain("RunnerError");
  }, T);
});
