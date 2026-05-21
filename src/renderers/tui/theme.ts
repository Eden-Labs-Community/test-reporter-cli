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
  /** Emphasis for the test list's file/suite headers ("bold white"). White on
   *  dark/auto; dropped on light (washes out) and mono — bold carries it there. */
  heading: string | undefined;
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
  heading: undefined,
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
  heading: "white",
};
// White headings wash out on a light background → drop the hue, keep bold.
const LIGHT: Palette = {
  ...DARK,
  accent: "blue",
  warn: "magenta",
  heading: undefined,
};

/** Pure: pick the TUI palette from theme + color suppression. */
export function resolvePalette(o: PaletteOptions): Palette {
  const env = o.env ?? process.env;
  // NO_COLOR spec: presence (any value, including "") disables color.
  const noColorEnv = env.NO_COLOR !== undefined;
  if (o.noColor || noColorEnv) return MONO;
  return o.theme === "light" ? LIGHT : DARK;
}
