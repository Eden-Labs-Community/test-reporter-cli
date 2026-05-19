/**
 * Pure: which command opens `file` at `line:col` for the user's editor (M4.1).
 * The editor is chosen by `ui.editor` in test-reporter-config.json (default
 * `code`) — no `.env`/`$EDITOR`/`$VISUAL` involved. The actual spawn is a thin
 * edge in renderers/tui/index.ts (best-effort, like codeFrame) — this stays
 * pure so it is unit-tested.
 */
export interface EditorInvocation {
  cmd: string;
  args: string[];
}

// VS Code and its forks share the `-g <file>:<line>:<col>` CLI.
const VSCODE = new Set([
  "code",
  "code-insiders",
  "vscode",
  "codium",
  "vscodium",
  "cursor",
  "windsurf",
]);
const PLUSLINE = new Set(["vim", "nvim", "vi", "nano", "emacs", "emacsclient"]);
const COLON = new Set(["subl", "sublime_text", "sublime", "mate", "atom"]);

/**
 * Build the editor invocation from the configured editor command
 * (`ui.editor`). Blank/unset → default to VS Code (`code -g`). The editor
 * choice belongs entirely to test-reporter-config.json.
 */
export function editorCommand(
  file: string,
  line: number | undefined,
  col: number | undefined,
  editor: string,
): EditorInvocation {
  const configured = (editor ?? "").trim();
  const cmd = configured || "code";
  const name = (cmd.split(/[\\/]/).pop() ?? cmd).toLowerCase();
  const L = line && line >= 1 ? line : undefined;
  const C = col && col >= 1 ? col : undefined;

  if (!configured || VSCODE.has(name)) {
    const target = L ? `${file}:${L}${C ? `:${C}` : ""}` : file;
    return { cmd, args: ["-g", target] };
  }
  if (L !== undefined && PLUSLINE.has(name)) {
    return { cmd, args: [`+${L}`, file] };
  }
  if (L !== undefined && COLON.has(name)) {
    return { cmd, args: [`${file}:${L}${C ? `:${C}` : ""}`] };
  }
  return { cmd, args: [file] }; // no line, or an editor we don't special-case
}
