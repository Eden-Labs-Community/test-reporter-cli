import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { RawRun, RawTest } from "../src/core/result.js";
import { createStore } from "../src/tui/createStore.js";
import {
  LIST_PAGE,
  buildVisibleGroups,
  buildVisibleList,
  initState,
  listStatus,
  reduce,
  type TuiState,
} from "../src/tui/store.js";

const ROOT = "/proj";
const t = (
  file: string,
  name: string,
  status: RawTest["status"],
  error?: RawTest["error"],
  line?: number,
): RawTest => ({
  file: `${ROOT}/${file}`,
  name,
  suite: "",
  status,
  error,
  line,
});

const feed = (s: TuiState, ...tests: RawTest[]): TuiState =>
  tests.reduce((acc, test) => reduce(acc, { type: "test", test }), s);

// The user's main ask (2026-05-25 rewrite): the middle panel title flips —
// "Passed" while everything passes, "Failed" the moment any test fails. The
// visible list filters to that status so the user always sees what matters.
describe("tui store — list status flip (Passed ↔ Failed)", () => {
  it("listStatus is 'passed' with 0 failures, 'failed' with ≥1", () => {
    let s = initState(ROOT);
    expect(listStatus(s)).toBe("passed"); // empty
    s = feed(s, t("a.test.ts", "x", "passed"));
    expect(listStatus(s)).toBe("passed");
    s = feed(s, t("a.test.ts", "y", "failed", { name: "E", message: "m" }));
    expect(listStatus(s)).toBe("failed");
  });

  it("buildVisibleList shows passed tests until a failure, then only failed (sorted file→name)", () => {
    let s = initState(ROOT);
    s = feed(
      s,
      t("b.test.ts", "p2", "passed"),
      t("a.test.ts", "p1", "passed"),
    );
    expect(buildVisibleList(s).map((x) => x.name)).toEqual(["p1", "p2"]);
    s = feed(
      s,
      t("z.test.ts", "z-fail", "failed", { name: "E", message: "m" }),
      t("a.test.ts", "a-fail", "failed", { name: "E", message: "n" }),
    );
    // status flipped → only the failed tests remain visible
    expect(buildVisibleList(s).map((x) => x.name)).toEqual(["a-fail", "z-fail"]);
  });

  it("buildVisibleGroups groups by file in flat-list order, preserving listFocus index", () => {
    let s = initState(ROOT);
    s = feed(
      s,
      t("strings.test.ts", "split", "passed"),
      t("math.test.ts", "divides", "passed"),
      t("strings.test.ts", "trim", "passed"),
      t("math.test.ts", "modulo", "passed"),
    );
    const groups = buildVisibleGroups(s);
    expect(groups.map((g) => g.file)).toEqual([
      `${ROOT}/math.test.ts`,
      `${ROOT}/strings.test.ts`,
    ]);
    expect(groups[0]?.tests.map((x) => x.test.name)).toEqual([
      "divides",
      "modulo",
    ]);
    expect(groups[1]?.tests.map((x) => x.test.name)).toEqual(["split", "trim"]);
    // indexInList must match buildVisibleList — same selection the cursor uses.
    const flat = buildVisibleList(s);
    for (const g of groups) {
      for (const { test, indexInList } of g.tests) {
        expect(flat[indexInList]).toBe(test);
      }
    }
  });

  it("flipping listStatus resets listFocus/listOffset (cursor would otherwise dangle)", () => {
    let s = initState(ROOT);
    const many = Array.from({ length: LIST_PAGE + 3 }, (_, i) =>
      t("a.test.ts", `p${String(i).padStart(2, "0")}`, "passed"),
    );
    s = feed(s, ...many);
    for (let i = 0; i < LIST_PAGE + 2; i++)
      s = reduce(s, { type: "key", key: "down" });
    expect(s.listFocus).toBeGreaterThan(0);
    s = feed(s, t("z.test.ts", "boom", "failed", { name: "E", message: "m" }));
    expect(listStatus(s)).toBe("failed");
    expect(s.listFocus).toBe(0);
    expect(s.listOffset).toBe(0);
  });
});

describe("tui store — keyboard (3-panel blessed UI)", () => {
  it("starts focused on the list panel", () => {
    const s = initState(ROOT);
    expect(s.focusedPanel).toBe("list");
  });

  it("tab toggles focusedPanel: list ↔ stderr", () => {
    let s = initState(ROOT);
    s = reduce(s, { type: "key", key: "tab" });
    expect(s.focusedPanel).toBe("stderr");
    s = reduce(s, { type: "key", key: "tab" });
    expect(s.focusedPanel).toBe("list");
  });

  it("up/down moves the list cursor when panel=list (clamped)", () => {
    let s = initState(ROOT);
    s = feed(
      s,
      t("a.test.ts", "p1", "passed"),
      t("a.test.ts", "p2", "passed"),
      t("a.test.ts", "p3", "passed"),
    );
    s = reduce(s, { type: "key", key: "down" });
    expect(s.listFocus).toBe(1);
    s = reduce(s, { type: "key", key: "down" });
    expect(s.listFocus).toBe(2);
    s = reduce(s, { type: "key", key: "down" }); // clamp at last
    expect(s.listFocus).toBe(2);
    s = reduce(s, { type: "key", key: "up" });
    expect(s.listFocus).toBe(1);
    s = reduce(s, { type: "key", key: "up" });
    s = reduce(s, { type: "key", key: "up" });
    s = reduce(s, { type: "key", key: "up" }); // clamp at 0
    expect(s.listFocus).toBe(0);
  });

  it("up/down scrolls stderrOffset when panel=stderr (clamped at 0; renderer clamps the top)", () => {
    let s = initState(ROOT);
    s = reduce(s, { type: "key", key: "tab" });
    expect(s.stderrOffset).toBe(0);
    s = reduce(s, { type: "key", key: "up" }); // clamp at 0
    expect(s.stderrOffset).toBe(0);
    s = reduce(s, { type: "key", key: "down" });
    expect(s.stderrOffset).toBe(1);
    s = reduce(s, { type: "key", key: "down" });
    expect(s.stderrOffset).toBe(2);
    s = reduce(s, { type: "key", key: "up" });
    expect(s.stderrOffset).toBe(1);
  });

  it("pgdn/pgup jump by LIST_PAGE on the focused panel", () => {
    let s = initState(ROOT);
    const many = Array.from({ length: LIST_PAGE * 3 }, (_, i) =>
      t("a.test.ts", `p${String(i).padStart(2, "0")}`, "passed"),
    );
    s = feed(s, ...many);
    s = reduce(s, { type: "key", key: "pgdn" });
    expect(s.listFocus).toBe(LIST_PAGE);
    s = reduce(s, { type: "key", key: "pgup" });
    expect(s.listFocus).toBe(0);

    s = reduce(s, { type: "key", key: "tab" });
    s = reduce(s, { type: "key", key: "pgdn" });
    expect(s.stderrOffset).toBe(LIST_PAGE);
    s = reduce(s, { type: "key", key: "pgup" });
    expect(s.stderrOffset).toBe(0);
  });

  it("enter/open opens the focused list test in the editor (monotonic seq, abs path)", () => {
    let s = initState(ROOT);
    s = feed(
      s,
      t("a.test.ts", "p1", "passed", undefined, 5),
      t("b.test.ts", "p2", "passed", undefined, 9),
    );
    expect(s.openRequest).toBeUndefined();
    s = reduce(s, { type: "key", key: "open" });
    expect(s.openRequest).toMatchObject({
      file: `${ROOT}/a.test.ts`,
      line: 5,
      seq: 1,
    });
    s = reduce(s, { type: "key", key: "down" });
    s = reduce(s, { type: "key", key: "enter" });
    expect(s.openRequest).toMatchObject({
      file: `${ROOT}/b.test.ts`,
      line: 9,
      seq: 2,
    });
  });

  it("enter/open targets the visible list (= failed tests when failures exist)", () => {
    let s = initState(ROOT);
    s = feed(
      s,
      t("a.test.ts", "p1", "passed", undefined, 3),
      t("a.test.ts", "boom", "failed", { name: "E", message: "m" }, 7),
    );
    expect(listStatus(s)).toBe("failed");
    s = reduce(s, { type: "key", key: "open" });
    expect(s.openRequest).toMatchObject({
      file: `${ROOT}/a.test.ts`,
      line: 7,
      seq: 1,
    });
  });

  it("open works regardless of which panel has scroll focus (always targets the list cursor)", () => {
    let s = initState(ROOT);
    s = feed(s, t("a.test.ts", "p1", "passed", undefined, 4));
    s = reduce(s, { type: "key", key: "tab" }); // focus stderr
    s = reduce(s, { type: "key", key: "open" });
    expect(s.openRequest).toMatchObject({
      file: `${ROOT}/a.test.ts`,
      line: 4,
      seq: 1,
    });
  });

  it("open with an empty list is a no-op (no openRequest)", () => {
    let s = initState(ROOT);
    s = reduce(s, { type: "key", key: "open" });
    expect(s.openRequest).toBeUndefined();
  });

  it("q signals exit", () => {
    let s = initState(ROOT);
    s = reduce(s, { type: "key", key: "q" });
    expect(s.exited).toBe(true);
  });
});

describe("tui store — mouse inputs (selectListIndex / focusPanel)", () => {
  it("focusPanel sets the scroll-focused panel", () => {
    let s = initState(ROOT);
    expect(s.focusedPanel).toBe("list");
    s = reduce(s, { type: "focusPanel", panel: "stderr" });
    expect(s.focusedPanel).toBe("stderr");
    s = reduce(s, { type: "focusPanel", panel: "list" });
    expect(s.focusedPanel).toBe("list");
  });

  it("selectListIndex moves listFocus and takes list focus (clamped, window slides)", () => {
    let s = initState(ROOT);
    const many = Array.from({ length: LIST_PAGE * 2 }, (_, i) =>
      t("a.test.ts", `p${String(i).padStart(2, "0")}`, "passed"),
    );
    s = feed(s, ...many);
    s = reduce(s, { type: "focusPanel", panel: "stderr" });
    s = reduce(s, { type: "selectListIndex", index: LIST_PAGE + 2 });
    expect(s.focusedPanel).toBe("list");
    expect(s.listFocus).toBe(LIST_PAGE + 2);
    expect(s.listOffset).toBeGreaterThan(0);
    // clamps to last when over-shooting
    s = reduce(s, { type: "selectListIndex", index: 9999 });
    expect(s.listFocus).toBe(many.length - 1);
  });

  it("selectListIndex + open opens the clicked test (sequence dispatched by the mouse edge)", () => {
    let s = initState(ROOT);
    s = feed(
      s,
      t("a.test.ts", "p1", "passed", undefined, 3),
      t("a.test.ts", "p2", "passed", undefined, 4),
      t("b.test.ts", "p3", "passed", undefined, 7),
    );
    s = reduce(s, { type: "selectListIndex", index: 2 });
    s = reduce(s, { type: "key", key: "open" });
    expect(s.openRequest).toMatchObject({
      file: `${ROOT}/b.test.ts`,
      line: 7,
      seq: 1,
    });
  });
});

describe("tui store — lifecycle (done/rerun/notice)", () => {
  it("done finalizes from the authoritative run; exitCode=1 if any failed", () => {
    let s = initState(ROOT);
    const run: RawRun = {
      rootDir: ROOT,
      durationMs: 4200,
      tests: [
        {
          file: `${ROOT}/a.test.ts`,
          name: "ok",
          suite: "",
          status: "passed",
        },
        {
          file: `${ROOT}/a.test.ts`,
          name: "boom",
          suite: "",
          status: "failed",
          error: { name: "E", message: "m" },
        },
      ],
    };
    s = reduce(s, { type: "done", run });
    expect(s.phase).toBe("done");
    expect(s.result.passed).toBe(1);
    expect(s.result.failed).toBe(1);
    expect(s.result.durationMs).toBe(4200);
    expect(s.exitCode).toBe(1);
    expect(listStatus(s)).toBe("failed");
  });

  it("done with all passing → exitCode 0, listStatus 'passed'", () => {
    let s = initState(ROOT);
    s = reduce(s, {
      type: "done",
      run: {
        rootDir: ROOT,
        durationMs: 100,
        tests: [
          {
            file: `${ROOT}/a.test.ts`,
            name: "ok",
            suite: "",
            status: "passed",
          },
        ],
      },
    });
    expect(s.exitCode).toBe(0);
    expect(listStatus(s)).toBe("passed");
  });

  it("rerun resets list/stderr offsets, focusedPanel, and records watchTrigger", () => {
    let s = initState(ROOT);
    s = feed(s, t("a.test.ts", "p", "passed"));
    s = reduce(s, { type: "key", key: "tab" });
    s = reduce(s, { type: "key", key: "down" });
    expect(s.focusedPanel).toBe("stderr");
    s = reduce(s, { type: "rerun", trigger: `${ROOT}/a.test.ts` });
    expect(s.phase).toBe("running");
    expect(s.tests).toEqual([]);
    expect(s.focusedPanel).toBe("list");
    expect(s.listFocus).toBe(0);
    expect(s.listOffset).toBe(0);
    expect(s.stderrOffset).toBe(0);
    expect(s.watchTrigger).toBe(`${ROOT}/a.test.ts`);
  });

  it("a/f bump command seq monotonically (watch keys)", () => {
    let s = initState(ROOT);
    expect(s.command).toBeUndefined();
    s = reduce(s, { type: "key", key: "a" });
    expect(s.command).toEqual({ kind: "all", seq: 1 });
    s = reduce(s, { type: "key", key: "f" });
    expect(s.command).toEqual({ kind: "failed", seq: 2 });
    s = reduce(s, { type: "key", key: "a" });
    expect(s.command).toEqual({ kind: "all", seq: 3 });
  });

  it("openAt sets an optimistic notice; a notice input overrides it", () => {
    let s = initState(ROOT);
    s = feed(s, t("a.test.ts", "p", "passed", undefined, 7));
    s = reduce(s, { type: "key", key: "open" });
    expect(s.notice).toContain("a.test.ts");
    expect(s.notice).toContain("7");
    s = reduce(s, { type: "notice", text: "could not open" });
    expect(s.notice).toBe("could not open");
  });
});

describe("createStore", () => {
  it("applies reduce and notifies/unsubscribes subscribers", () => {
    const store = createStore(ROOT);
    let n = 0;
    const unsub = store.subscribe(() => {
      n++;
    });
    store.dispatch({ type: "key", key: "q" });
    expect(store.getState().exited).toBe(true);
    expect(n).toBe(1);
    unsub();
    store.dispatch({ type: "key", key: "tab" });
    expect(n).toBe(1);
  });
});
