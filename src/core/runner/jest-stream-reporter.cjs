// Jest custom reporter (CommonJS on purpose: Jest loads reporters by path via
// Node `require`, and a .cjs is require-able even though our package is ESM).
// It runs in the SAME process as the adapter (`runInBand`), so it bridges each
// per-test-case result to the live TUI through a single globalThis slot the
// JestAdapter sets before `runCLI` and clears after. It maps nothing itself —
// it forwards the raw Jest objects so the TS adapter owns the mapping (DRY).
const KEY = "__TEST_REPORTER_JEST_SINK__";

class TestReporterStream {
  onTestCaseResult(test, testCaseResult) {
    const sink = globalThis[KEY];
    if (typeof sink === "function") {
      sink((test && test.path) || "", testCaseResult);
    }
  }
}

module.exports = TestReporterStream;
