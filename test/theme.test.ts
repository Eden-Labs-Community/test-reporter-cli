import { describe, expect, it } from "vitest";

import { resolvePalette } from "../src/renderers/tui/theme.js";

describe("resolvePalette", () => {
  it("auto resolves to the dark palette with hues", () => {
    const p = resolvePalette({ theme: "auto", env: {} });
    expect(p.mono).toBe(false);
    expect(p.pass).toBe("green");
    expect(p.fail).toBe("red");
    expect(p.accent).toBe("cyan");
  });

  it("light theme differs from dark on the accent (contrast)", () => {
    const light = resolvePalette({ theme: "light", env: {} });
    const dark = resolvePalette({ theme: "dark", env: {} });
    expect(light.accent).not.toBe(dark.accent);
    expect(light.mono).toBe(false);
  });

  it("--no-color forces a monochrome palette (all hues undefined)", () => {
    const p = resolvePalette({ theme: "dark", noColor: true, env: {} });
    expect(p.mono).toBe(true);
    expect(p.pass).toBeUndefined();
    expect(p.fail).toBeUndefined();
    expect(p.accent).toBeUndefined();
  });

  it("honors the NO_COLOR env var even without the flag", () => {
    expect(resolvePalette({ theme: "dark", env: { NO_COLOR: "1" } }).mono).toBe(
      true,
    );
    // an empty NO_COLOR is still "set" per the NO_COLOR spec
    expect(resolvePalette({ theme: "dark", env: { NO_COLOR: "" } }).mono).toBe(
      true,
    );
  });
});
