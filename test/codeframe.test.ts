import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { codeFrame } from "../src/renderers/tui/codeframe.js";

function fixture(lines: string[]): string {
  const d = mkdtempSync(join(tmpdir(), "trc-cf-"));
  const f = join(d, "src.ts");
  writeFileSync(f, lines.join("\n"));
  return f;
}

describe("codeFrame", () => {
  it("returns a windowed frame marking the failing line + a caret", () => {
    const f = fixture(["L1", "L2", "L3", "L4", "L5"]);
    const out = codeFrame(f, 3, 2, 1);
    // window = lines 2..4 (ctx=1) + a caret line
    expect(out).toHaveLength(4);
    expect(out[0]).toContain("2 | L2");
    expect(out[1]).toBe("> 3 | L3");
    expect(out[2]).toContain("^"); // caret under col 2
    expect(out[3]).toContain("4 | L4");
  });

  it("clamps the window at file bounds", () => {
    const f = fixture(["only", "two"]);
    const out = codeFrame(f, 1, undefined, 2);
    expect(out[0]).toBe("> 1 | only");
    expect(out.some((l) => l.includes("two"))).toBe(true);
  });

  it("is best-effort: missing file or no line → empty (never throws)", () => {
    expect(codeFrame("/no/such/file.ts", 3)).toEqual([]);
    expect(codeFrame(fixture(["a"]), undefined)).toEqual([]);
    expect(codeFrame(fixture(["a"]), 99)).toEqual([]);
  });
});
