import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  defaultConfig,
  loadConfig,
  serializeDefaultConfig,
} from "../src/config/index.js";

// `init` only writes a JSON file (no runner spawned), so it is safe to drive
// via tmpdir + child process — and loadConfig is pure (no runner) so calling
// it directly is consistent with config.test.ts.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TSX = join(ROOT, "node_modules", ".bin", "tsx");
const CLI = join(ROOT, "src", "cli.ts");
const CONFIG = "test-reporter-config.json";
const isWin = process.platform === "win32";

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "trc-init-"));
  dirs.push(d);
  return d;
}

interface Run {
  stdout: string;
  stderr: string;
  code: number;
}
function init(cwd: string, extra: string[] = []): Run {
  const r = spawnSync(TSX, [CLI, "init", "--cwd", cwd, ...extra], {
    encoding: "utf8",
    shell: isWin,
  });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", code: r.status ?? -1 };
}

// The exact config the PRD §8 documents — init must emit THESE defaults.
const DOCUMENTED_DEFAULTS = {
  runner: "vitest",
  include: ["src/**/*.test.ts"],
  defaultMode: "standard",
  watch: { followLastSaved: true },
  summary: { detail: "cause", maxFailures: 50 },
  ui: { autoFocusFailures: true, theme: "auto", editor: "code" },
};

const T = 30_000;

describe("config defaults source of truth", () => {
  it("defaultConfig() equals the PRD-documented defaults", () => {
    expect(defaultConfig()).toEqual(DOCUMENTED_DEFAULTS);
  });

  it("serializeDefaultConfig() is pretty JSON that round-trips through the schema", () => {
    const s = serializeDefaultConfig();
    expect(s.endsWith("\n")).toBe(true);
    expect(JSON.parse(s)).toEqual(DOCUMENTED_DEFAULTS);
  });
});

describe("init (e2e)", () => {
  afterEach(() => {
    dirs.length = 0;
  });

  it("writes a schema-valid config == documented defaults, exit 0", () => {
    const dir = tmp();
    const r = init(dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(CONFIG);
    expect(r.stderr).toBe("");
    // exact, deterministic file content
    expect(readFileSync(join(dir, CONFIG), "utf8")).toBe(
      serializeDefaultConfig(),
    );
    // and it actually loads (passes zod) to the documented defaults
    expect(loadConfig(dir)).toEqual(DOCUMENTED_DEFAULTS);
  }, T);

  it("refuses to clobber an existing config without --force (exit 1, untouched)", () => {
    const dir = tmp();
    const sentinel = JSON.stringify({ runner: "jest" });
    writeFileSync(join(dir, CONFIG), sentinel);
    const r = init(dir);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("already exists");
    expect(r.stderr).toContain("--force");
    expect(readFileSync(join(dir, CONFIG), "utf8")).toBe(sentinel);
  }, T);

  it("--force overwrites an existing config back to valid defaults", () => {
    const dir = tmp();
    writeFileSync(join(dir, CONFIG), "{ not even json ]");
    const r = init(dir, ["--force"]);
    expect(r.code).toBe(0);
    expect(loadConfig(dir)).toEqual(DOCUMENTED_DEFAULTS);
  }, T);
});
