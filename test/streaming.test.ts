import { describe, expect, it } from "vitest";

import { pickUnemitted } from "../src/core/events.js";
import type { RawTest } from "../src/core/result.js";
import { isTerminalState } from "../src/core/runner/vitest.js";

const mk = (file: string, name: string): RawTest => ({
  file,
  name,
  suite: "",
  status: "passed",
});

describe("isTerminalState (vitest)", () => {
  it("treats pass/fail/skip/todo as terminal", () => {
    for (const s of ["pass", "fail", "skip", "todo"])
      expect(isTerminalState(s)).toBe(true);
  });
  it("treats running/undefined as not terminal (no premature emit)", () => {
    for (const s of ["run", "", undefined])
      expect(isTerminalState(s)).toBe(false);
  });
});

describe("pickUnemitted (streaming dedupe)", () => {
  it("returns only tests whose key is not already emitted", () => {
    const emitted = new Set<string>();
    const a = mk("a.ts", "one");
    const b = mk("a.ts", "two");

    const first = pickUnemitted([a], emitted);
    expect(first).toEqual([a]);

    // caller records what it emitted; a re-scan must not re-emit `a`
    const second = pickUnemitted([a, b], emitted);
    expect(second).toEqual([b]);
    expect(pickUnemitted([a, b], emitted)).toEqual([]);
  });

  it("disambiguates same test name across different files", () => {
    const emitted = new Set<string>();
    const x = mk("a.ts", "dup");
    const y = mk("b.ts", "dup");
    expect(pickUnemitted([x, y], emitted)).toEqual([x, y]);
  });
});
