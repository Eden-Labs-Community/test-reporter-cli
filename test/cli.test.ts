import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TSX = join(ROOT, "node_modules", ".bin", "tsx");
const CLI = join(ROOT, "src", "cli.ts");
const PKG_VERSION = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
).version as string;
const isWin = process.platform === "win32";

interface Run {
  stdout: string;
  stderr: string;
  code: number;
}
function cli(...args: string[]): Run {
  const r = spawnSync(TSX, [CLI, ...args], { encoding: "utf8", shell: isWin });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", code: r.status ?? -1 };
}
 
const T = 20_000;

describe("cli help/version (e2e)", () => {
  it("--version prints the package.json version (single source), exit 0", () => {
    const r = cli("--version");
    expect(r.stdout.trim()).toBe(PKG_VERSION);
    expect(r.code).toBe(0);
  }, T);

  it("--help lists every command, exit 0", () => {
    const r = cli("--help");
    for (const c of ["run", "watch", "check", "init"])
      expect(r.stdout).toContain(c);
    expect(r.code).toBe(0);
  }, T);

  it("each command has its own --help with its options", () => {
    expect(cli("check", "--help").stdout).toContain("--json");
    expect(cli("run", "--help").stdout).toContain("--no-color");
    expect(cli("watch", "--help").stdout).toContain("--summary");
    const initHelp = cli("init", "--help");
    expect(initHelp.stdout).toContain("--force");
    expect(initHelp.code).toBe(0);
  }, T);

  it("an unknown command fails loud (non-zero + actionable stderr)", () => {
    const r = cli("frobnicate");
    expect(r.code).not.toBe(0);
    expect(r.stderr.toLowerCase()).toContain("unknown command");
  }, T);
});
