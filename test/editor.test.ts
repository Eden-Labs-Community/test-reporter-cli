import { describe, expect, it } from "vitest";

import { editorCommand } from "../src/renderers/tui/editor.js";

const F = "/proj/src/a.test.ts";

describe("editorCommand (editor comes from ui.editor in config)", () => {
  it("defaults to VS Code `-g file:line:col` when editor is blank", () => {
    expect(editorCommand(F, 12, 3, "")).toEqual({
      cmd: "code",
      args: ["-g", `${F}:12:3`],
    });
  });

  it("honors the configured editor; vim-family uses +line", () => {
    expect(editorCommand(F, 8, undefined, "vim")).toEqual({
      cmd: "vim",
      args: ["+8", F],
    });
    expect(editorCommand(F, 8, 2, "nvim")).toEqual({
      cmd: "nvim",
      args: ["+8", F],
    });
  });

  it("VS Code forks (cursor/windsurf/codium) use `-g file:line:col`", () => {
    for (const ed of ["cursor", "windsurf", "codium"])
      expect(editorCommand(F, 6, 2, ed)).toEqual({
        cmd: ed,
        args: ["-g", `${F}:6:2`],
      });
  });

  it("code/subl take a file:line:col target", () => {
    expect(editorCommand(F, 5, 1, "code-insiders")).toEqual({
      cmd: "code-insiders",
      args: ["-g", `${F}:5:1`],
    });
    expect(editorCommand(F, 5, undefined, "subl")).toEqual({
      cmd: "subl",
      args: [`${F}:5`],
    });
  });

  it("no line → just open the file; unknown editor → bare file arg", () => {
    expect(editorCommand(F, undefined, undefined, "vim")).toEqual({
      cmd: "vim",
      args: [F],
    });
    expect(editorCommand(F, 9, 9, "weirded")).toEqual({
      cmd: "weirded",
      args: [F],
    });
  });
});
