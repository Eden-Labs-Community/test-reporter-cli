/**
 * TUI color resolution (M4). The headless `check`/`run --summary` contract is
 * always ANSI-free regardless — this only governs the live Ink TUI. A `mono`
 * palette (every hue `undefined`) makes the renderer pass no `color` props, so
 * Ink emits plain text; `dim`/`bold` are intensity, not hue, so they stay.
 */
export type ThemeName = "auto" | "light" | "dark";

export interface Palette {
  /** True when color is suppressed (`--no-color` / `NO_COLOR`). */
  mono: boolean;
  pass: string | undefined;
  fail: string | undefined;
  skip: string | undefined;
  accent: string | undefined;
  warn: string | undefined;
}

export interface PaletteOptions {
  theme: ThemeName;
  /** Explicit `--no-color` flag (wins over everything). */
  noColor?: boolean;
  /** Process env (injected for testability); `NO_COLOR` is honored per spec. */
  env?: NodeJS.ProcessEnv;
}

const MONO: Palette = {
  mono: true,
  pass: undefined,
  fail: undefined,
  skip: undefined,
  accent: undefined,
  warn: undefined,
};

// Dark = terminal default (also `auto`). Light swaps the accent to a hue that
// stays legible on a light background (cyan/yellow wash out there).
const DARK: Palette = {
  mono: false,
  pass: "green",
  fail: "red",
  skip: "gray",
  accent: "cyan",
  warn: "yellow",
};
const LIGHT: Palette = { ...DARK, accent: "blue", warn: "magenta" };

/** Pure: pick the TUI palette from theme + color suppression. */
export function resolvePalette(o: PaletteOptions): Palette {
  const env = o.env ?? process.env;
  // NO_COLOR spec: presence (any value, including "") disables color.
  const noColorEnv = env.NO_COLOR !== undefined;
  if (o.noColor || noColorEnv) return MONO;
  return o.theme === "light" ? LIGHT : DARK;
}
