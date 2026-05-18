import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/index.js";
import { TestRunnerAdapter } from "../src/core/runner/adapter.js";
import { createRunner } from "../src/core/runner/factory.js";

// No adapter is ever .run() here: constructing/selecting must not boot any
// runner (that would be Vitest-in-Vitest — see CLAUDE.md). Selection only.
const baseCfg = loadConfig(mkdtempSync(join(tmpdir(), "trc-rf-")));

describe("createRunner", () => {
  it("selects the vitest adapter by default", () => {
    const a = createRunner(baseCfg);
    expect(a).toBeInstanceOf(TestRunnerAdapter);
    expect(a.name).toBe("vitest");
  });

  it("selects the jest adapter when configured", () => {
    const a = createRunner({ ...baseCfg, runner: "jest" });
    expect(a).toBeInstanceOf(TestRunnerAdapter);
    expect(a.name).toBe("jest");
  });
});
