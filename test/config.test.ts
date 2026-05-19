import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "../src/config/index.js";

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "trc-cfg-"));
  dirs.push(d);
  return d;
}
function writeConfig(dir: string, content: string, name = "test-reporter-config.json"): string {
  const p = join(dir, name);
  writeFileSync(p, content);
  return p;
}

const DEFAULTS = {
  runner: "vitest",
  include: ["src/**/*.test.ts"],
  defaultMode: "standard",
  watch: { followLastSaved: true },
  summary: { detail: "cause", maxFailures: 50 },
  ui: { autoFocusFailures: true, theme: "auto", editor: "code" },
};

describe("loadConfig", () => {
  afterEach(() => {
    dirs.length = 0;
  });

  it("returns documented defaults when no config file exists", () => {
    expect(loadConfig(tmp())).toEqual(DEFAULTS);
  });

  it("merges a partial config over the defaults", () => {
    const dir = tmp();
    writeConfig(dir, JSON.stringify({ summary: { maxFailures: 10 } }));
    const cfg = loadConfig(dir);
    expect(cfg.summary).toEqual({ detail: "cause", maxFailures: 10 });
    expect(cfg.include).toEqual(DEFAULTS.include);
  });

  it("defaults runner to vitest and accepts an explicit jest runner", () => {
    expect(loadConfig(tmp()).runner).toBe("vitest");
    const dir = tmp();
    writeConfig(dir, JSON.stringify({ runner: "jest" }));
    expect(loadConfig(dir).runner).toBe("jest");
  });

  it("rejects an unknown runner with an actionable ConfigError", () => {
    const dir = tmp();
    writeConfig(dir, JSON.stringify({ runner: "mocha" }));
    try {
      loadConfig(dir);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).message).toContain("runner");
    }
  });

  it("throws an actionable ConfigError on schema-invalid config", () => {
    const dir = tmp();
    writeConfig(dir, JSON.stringify({ summary: { detail: "nope" } }));
    try {
      loadConfig(dir);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).message).toContain("test-reporter-config.json");
      expect((err as ConfigError).message).toContain("summary.detail");
    }
  });

  it("throws a ConfigError on invalid JSON", () => {
    const dir = tmp();
    writeConfig(dir, "{ not json ]");
    expect(() => loadConfig(dir)).toThrow(ConfigError);
  });

  it("loads an explicit --config path", () => {
    const dir = tmp();
    const p = writeConfig(dir, JSON.stringify({ defaultMode: "watch" }), "custom.json");
    expect(loadConfig(dir, p).defaultMode).toBe("watch");
  });

  it("throws a ConfigError when an explicit --config path is missing", () => {
    const dir = tmp();
    expect(() => loadConfig(dir, join(dir, "missing.json"))).toThrow(ConfigError);
  });
});
