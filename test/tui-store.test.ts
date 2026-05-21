import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { RawRun, RawTest } from "../src/core/result.js";
import { createStore } from "../src/tui/createStore.js";
import {
  LIST_PAGE,
  buildSuiteTree,
  buildTestList,
  initState,
  reduce,
  type TuiState,
} from "../src/tui/store.js";

const ROOT = "/proj";
const t = (
  file: string,
  name: string,
  status: RawTest["status"],
  error?: RawTest["error"],
): RawTest => ({ file: `${ROOT}/${file}`, name, suite: "", status, error });

const feed = (s: TuiState, ...tests: RawTest[]): TuiState =>
  tests.reduce((acc, test) => reduce(acc, { type: "test", test }), s);

describe("tui store", () => {
  it("counts live and stays on overview while only passing", () => {
    let s = initState(ROOT);
    s = feed(s, t("a.test.ts", "x", "passed"), t("a.test.ts", "y", "skipped"));
    expect(s.result.passed).toBe(1);
    expect(s.result.skipped).toBe(1);
    expect(s.view).toBe("overview");
    expect(s.phase).toBe("running");
  });

  it("jumps to a failure the instant it happens (decision #13: option B)", () => {
    let s = initState(ROOT);
    s = feed(s, t("a.test.ts", "ok", "passed"));
    s = feed(s, t("a.test.ts", "boom", "failed", { name: "AssertionError", message: "nope" }));
    expect(s.view).toBe("failure");
    expect(s.result.failures[s.focused]?.test).toBe("boom");
  });

  it("last-failed-wins: a newer failure steals focus", () => {
    let s = initState(ROOT);
    s = feed(
      s,
      t("z.test.ts", "first", "failed", { name: "Error", message: "1" }),
      t("a.test.ts", "second", "failed", { name: "Error", message: "2" }),
    );
    // focus follows the just-failed one even though sort puts a.test.ts first
    expect(s.result.failures[s.focused]?.test).toBe("second");
  });

  it("n/p cycle failures in deterministic file→name order and wrap", () => {
    let s = initState(ROOT);
    s = feed(
      s,
      t("a.test.ts", "fa", "failed", { name: "E", message: "a" }),
      t("b.test.ts", "fb", "failed", { name: "E", message: "b" }),
    );
    // sorted: a.test.ts/fa (0), b.test.ts/fb (1). focus is on "fb" (last failed).
    expect(s.result.failures[s.focused]?.test).toBe("fb");
    s = reduce(s, { type: "key", key: "n" }); // wrap → index 0
    expect(s.result.failures[s.focused]?.test).toBe("fa");
    s = reduce(s, { type: "key", key: "p" }); // wrap back → index 1
    expect(s.result.failures[s.focused]?.test).toBe("fb");
  });

  it("esc returns to overview; n re-opens the failure view", () => {
    let s = initState(ROOT);
    s = feed(s, t("a.test.ts", "f", "failed", { name: "E", message: "m" }));
    s = reduce(s, { type: "key", key: "esc" });
    expect(s.view).toBe("overview");
    s = reduce(s, { type: "key", key: "n" });
    expect(s.view).toBe("failure");
  });

  it("done finalizes from the authoritative run and keeps the failure", () => {
    let s = initState(ROOT);
    s = feed(s, t("a.test.ts", "f", "failed", { name: "E", message: "m" }));
    const run: RawRun = {
      rootDir: ROOT,
      durationMs: 4200,
      tests: [
        { file: `${ROOT}/a.test.ts`, name: "f", suite: "", status: "failed", error: { name: "E", message: "m" } },
        { file: `${ROOT}/a.test.ts`, name: "g", suite: "", status: "passed" },
      ],
    };
    s = reduce(s, { type: "done", run });
    expect(s.phase).toBe("done");
    expect(s.result.passed).toBe(1);
    expect(s.result.failed).toBe(1);
    expect(s.result.durationMs).toBe(4200);
    expect(s.exitCode).toBe(1);
    expect(s.view).toBe("failure");
  });

  it("q signals exit", () => {
    let s = initState(ROOT);
    s = reduce(s, { type: "key", key: "q" });
    expect(s.exited).toBe(true);
  });
});

describe("tui store — watch (M3)", () => {
  const finished = (...tests: RawTest[]): RawRun => ({
    rootDir: ROOT,
    durationMs: 1000,
    tests,
  });

  it("rerun resets the per-cycle counters, returns to running/overview, records the trigger (RF-04)", () => {
    let s = initState(ROOT);
    s = feed(s, t("a.test.ts", "f", "failed", { name: "E", message: "m" }));
    s = reduce(s, {
      type: "done",
      run: finished(t("a.test.ts", "f", "failed", { name: "E", message: "m" })),
    });
    expect(s.phase).toBe("done");

    s = reduce(s, { type: "rerun", trigger: `${ROOT}/a.test.ts` });
    expect(s.phase).toBe("running");
    expect(s.tests).toEqual([]);
    expect(s.result.passed).toBe(0);
    expect(s.result.failed).toBe(0);
    expect(s.view).toBe("overview");
    expect(s.watchTrigger).toBe(`${ROOT}/a.test.ts`);
  });

  it("after a rerun, decision #18 still steals focus on a new failure", () => {
    let s = initState(ROOT);
    s = reduce(s, {
      type: "done",
      run: finished(t("a.test.ts", "ok", "passed")),
    });
    s = reduce(s, { type: "rerun", trigger: `${ROOT}/a.test.ts` });
    s = feed(s, t("a.test.ts", "boom", "failed", { name: "E", message: "x" }));
    expect(s.view).toBe("failure");
    expect(s.result.failures[s.focused]?.test).toBe("boom");
  });

  it("a/f request a watch command via a monotonic seq; q still exits", () => {
    let s = initState(ROOT);
    expect(s.command).toBeUndefined();
    s = reduce(s, { type: "key", key: "a" });
    expect(s.command).toEqual({ kind: "all", seq: 1 });
    s = reduce(s, { type: "key", key: "f" });
    expect(s.command).toEqual({ kind: "failed", seq: 2 });
    s = reduce(s, { type: "key", key: "a" }); // repeating a kind still bumps seq
    expect(s.command).toEqual({ kind: "all", seq: 3 });
    s = reduce(s, { type: "key", key: "q" });
    expect(s.exited).toBe(true);
  });
});

describe("tui store — suite tree (M4)", () => {
  const mk = (file: string, suite: string, st: RawTest["status"]): RawTest => ({
    file: `${ROOT}/${file}`,
    name: `${suite} > t`,
    suite,
    status: st,
  });

  it("buildSuiteTree groups by (file, suite), counts, deterministic order", () => {
    const tree = buildSuiteTree([
      mk("b.test.ts", "B", "passed"),
      mk("a.test.ts", "A", "failed"),
      mk("a.test.ts", "A", "passed"),
      mk("a.test.ts", "A", "skipped"),
    ]);
    expect(tree.map((n) => `${n.file}|${n.suite}`)).toEqual([
      `${ROOT}/a.test.ts|A`,
      `${ROOT}/b.test.ts|B`,
    ]);
    expect(tree[0]).toMatchObject({
      passed: 1,
      failed: 1,
      skipped: 1,
      total: 3,
    });
  });

  it("s toggles the suites view; up/down move and clamp", () => {
    let s = initState(ROOT);
    s = feed(
      s,
      mk("a.test.ts", "A", "passed"),
      mk("b.test.ts", "B", "failed"),
    );
    s = reduce(s, { type: "key", key: "s" });
    expect(s.view).toBe("suites");
    expect(s.treeFocus).toBe(0);
    s = reduce(s, { type: "key", key: "up" }); // clamp at 0
    expect(s.treeFocus).toBe(0);
    s = reduce(s, { type: "key", key: "down" });
    expect(s.treeFocus).toBe(1);
    s = reduce(s, { type: "key", key: "down" }); // clamp at last
    expect(s.treeFocus).toBe(1);
    s = reduce(s, { type: "key", key: "s" }); // toggle back
    expect(s.view).toBe("overview");
  });

  it("enter on a failing suite jumps to its first failure; enter on a green suite returns to the list at its header", () => {
    let s = initState(ROOT);
    s = feed(
      s,
      mk("a.test.ts", "A", "passed"), // green suite at tree index 0
      t("b.test.ts", "B > boom", "failed", { name: "E", message: "m" }),
    );
    // failure stole focus → go to suites and select the green suite (idx 0)
    s = reduce(s, { type: "key", key: "s" });
    expect(s.view).toBe("suites");
    s = reduce(s, { type: "key", key: "enter" }); // green suite → back to the list at its header
    expect(s.view).toBe("overview");
    expect(s.listOffset).toBe(0); // suite header for a.test.ts/A is the first grouped item
    s = reduce(s, { type: "key", key: "s" }); // back to suites
    s = reduce(s, { type: "key", key: "down" }); // select b.test.ts/B
    s = reduce(s, { type: "key", key: "enter" });
    expect(s.view).toBe("failure");
    expect(s.result.failures[s.focused]?.test).toBe("B > boom");
  });

  it("rerun resets the tree selection", () => {
    let s = initState(ROOT);
    s = feed(s, mk("a.test.ts", "A", "passed"), mk("b.test.ts", "B", "passed"));
    s = reduce(s, { type: "key", key: "s" });
    s = reduce(s, { type: "key", key: "down" });
    expect(s.treeFocus).toBe(1);
    s = reduce(s, { type: "rerun", trigger: `${ROOT}/a.test.ts` });
    expect(s.treeFocus).toBe(0);
  });
});

describe("tui store — scrollable test list (mouse-first)", () => {
  const lt = (
    file: string,
    name: string,
    st: RawTest["status"],
    line?: number,
  ): RawTest => ({ file: `${ROOT}/${file}`, name, suite: "", status: st, line });

  it("buildTestList orders deterministically by (file, name)", () => {
    const list = buildTestList([
      lt("b.test.ts", "z", "passed"),
      lt("a.test.ts", "b", "passed"),
      lt("a.test.ts", "a", "failed"),
    ]);
    expect(list.map((t) => `${t.file}|${t.name}`)).toEqual([
      `${ROOT}/a.test.ts|a`,
      `${ROOT}/a.test.ts|b`,
      `${ROOT}/b.test.ts|z`,
    ]);
  });

  it("scroll moves the offset by the wheel delta and clamps at both ends", () => {
    let s = initState(ROOT);
    // one suite header + (LIST_PAGE + 5) tests → grouped length = LIST_PAGE + 6
    const many = Array.from({ length: LIST_PAGE + 5 }, (_, i) =>
      lt("a.test.ts", `t${String(i).padStart(2, "0")}`, "passed", i + 1),
    );
    s = feed(s, ...many);
    const maxOffset = LIST_PAGE + 6 - LIST_PAGE; // grouped length − page = 6
    expect(s.listOffset).toBe(0);
    s = reduce(s, { type: "scroll", delta: 3 });
    expect(s.listOffset).toBe(3);
    s = reduce(s, { type: "scroll", delta: 100 }); // clamp at the bottom
    expect(s.listOffset).toBe(maxOffset);
    s = reduce(s, { type: "scroll", delta: -100 }); // clamp at the top
    expect(s.listOffset).toBe(0);
  });

  it("resize re-clamps the offset to the new page size", () => {
    let s = initState(ROOT);
    const many = Array.from({ length: LIST_PAGE + 5 }, (_, i) =>
      lt("a.test.ts", `t${String(i).padStart(2, "0")}`, "passed", i + 1),
    );
    s = feed(s, ...many);
    s = reduce(s, { type: "scroll", delta: 100 }); // offset pinned at the bottom (6)
    expect(s.listOffset).toBe(6);
    // grow the viewport so the whole list fits → offset must clamp back to 0
    s = reduce(s, { type: "resize", pageSize: LIST_PAGE + 20 });
    expect(s.listPage).toBe(LIST_PAGE + 20);
    expect(s.listOffset).toBe(0);
  });

  it("openAt opens the clicked test at file:line; a suite header opens just the file (monotonic seq)", () => {
    let s = initState(ROOT);
    s = feed(
      s,
      lt("a.test.ts", "first", "passed", 4),
      lt("b.test.ts", "second", "failed", 9),
    );
    // grouped: [header(a,0), test-first(1), header(b,2), test-second(3)]
    expect(s.openRequest).toBeUndefined();
    s = reduce(s, { type: "openAt", index: 1 }); // test: first, line 4
    expect(s.openRequest).toMatchObject({
      file: `${ROOT}/a.test.ts`,
      line: 4,
      seq: 1,
    });
    s = reduce(s, { type: "openAt", index: 2 }); // suite header for b.test.ts → file only
    expect(s.openRequest).toMatchObject({ file: `${ROOT}/b.test.ts`, seq: 2 });
    expect(s.openRequest?.line).toBeUndefined();
    s = reduce(s, { type: "openAt", index: 3 }); // test: second, line 9
    expect(s.openRequest).toMatchObject({
      file: `${ROOT}/b.test.ts`,
      line: 9,
      seq: 3,
    });
  });

  it("openAt with an out-of-range index is a no-op", () => {
    let s = initState(ROOT);
    s = feed(s, lt("a.test.ts", "x", "passed", 7));
    s = reduce(s, { type: "openAt", index: 99 });
    expect(s.openRequest).toBeUndefined();
  });

  it("open from the failure view targets the failing file:line (abs path)", () => {
    let s = initState(ROOT);
    s = feed(s, t("a.test.ts", "boom", "failed", { name: "E", message: "m" }));
    // failure view is auto-focused (decision #18)
    expect(s.view).toBe("failure");
    s = reduce(s, { type: "key", key: "open" });
    expect(s.openRequest?.file).toBe(resolve(ROOT, "a.test.ts"));
    expect(s.openRequest?.seq).toBe(1);
  });

  it("openAt sets an optimistic notice; a notice input overrides it", () => {
    let s = initState(ROOT);
    s = feed(s, lt("a.test.ts", "x", "passed", 7));
    // grouped: [header(0), test(1)] — click the test to get file:line in the notice
    s = reduce(s, { type: "openAt", index: 1 });
    expect(s.notice).toContain("a.test.ts");
    expect(s.notice).toContain("7");
    s = reduce(s, { type: "notice", text: "could not open editor" });
    expect(s.notice).toBe("could not open editor");
  });

  it("rerun resets the list scroll offset", () => {
    let s = initState(ROOT);
    const many = Array.from({ length: LIST_PAGE + 5 }, (_, i) =>
      lt("a.test.ts", `t${String(i).padStart(2, "0")}`, "passed", i + 1),
    );
    s = feed(s, ...many);
    s = reduce(s, { type: "scroll", delta: 5 });
    expect(s.listOffset).toBeGreaterThan(0);
    s = reduce(s, { type: "rerun", trigger: `${ROOT}/a.test.ts` });
    expect(s.listOffset).toBe(0);
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
    store.dispatch({ type: "key", key: "esc" });
    expect(n).toBe(1); // no longer notified after unsubscribe
  });
});
