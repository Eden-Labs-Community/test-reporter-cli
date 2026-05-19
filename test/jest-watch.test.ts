import { describe, expect, it } from "vitest";

// Pure predicate only — NEVER construct/run the Jest adapter here (that would
// boot a runner inside Vitest = reentrancy; see CLAUDE.md). The watch loop
// itself is verified by event-level smoke in a real dir, like the Vitest one.
import { ignoredWatchPath } from "../src/core/runner/jest.js";

describe("ignoredWatchPath", () => {
  it("ignores dependency / vcs / build / coverage trees", () => {
    for (const p of [
      "/proj/node_modules/x/index.js",
      "/proj/.git/HEAD",
      "/proj/dist/cli.js",
      "/proj/coverage/lcov.info",
    ])
      expect(ignoredWatchPath(p)).toBe(true);
  });

  it("ignores dotfiles and editor scratch files", () => {
    expect(ignoredWatchPath("/proj/.env")).toBe(true);
    expect(ignoredWatchPath("/proj/src/a.test.ts~")).toBe(true);
    expect(ignoredWatchPath("/proj/src/.a.test.ts.swp")).toBe(true);
  });

  it("does NOT ignore real source/test files", () => {
    for (const p of [
      "/proj/src/a.test.ts",
      "/proj/src/feature.ts",
      "/proj/test/e2e.test.js",
    ])
      expect(ignoredWatchPath(p)).toBe(false);
  });
});
