import { describe, expect, it } from "vitest";

import type { RawRun, RawTest } from "../src/core/result.js";
import { createStore } from "../src/tui/createStore.js";
import { initState, reduce, type TuiState } from "../src/tui/store.js";

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
