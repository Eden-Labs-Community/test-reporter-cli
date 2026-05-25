// Probe — uses the real store + Vitest adapter, prints store state.
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { tsImport } from "tsx/esm/api";

const cwd = "/Users/maisondamarante/Documents/Apps/eden-labs/eden-test-reporter-cli/playground";
const target = resolve(cwd, "src/math.test.ts");

const storeMod = await tsImport("./src/tui/createStore.ts", import.meta.url);
const vitestMod = await tsImport("./src/core/runner/vitest.ts", import.meta.url);

const store = storeMod.createStore(cwd);
console.log("[p] initial rootDir =", JSON.stringify(store.getState().rootDir));

let lastLogged = "";
store.subscribe(() => {
  const s = store.getState();
  const snapshot = JSON.stringify({
    phase: s.phase,
    testsCount: s.tests.length,
    resultPassed: s.result.passed,
    lockedFiles: s.lockedFiles,
    countdown: s.countdown ? "active" : undefined,
  });
  if (snapshot !== lastLogged) {
    lastLogged = snapshot;
    console.log("[p] state →", snapshot);
  }
});

const adapter = new vitestMod.VitestAdapter();
const handle = await adapter.watch(
  cwd,
  { runner: "vitest", include: ["src/**/*.test.ts"] },
  (e) => {
    if (e.type === "rerun") {
      console.log("[p] rerun event:");
      console.log("    trigger:", JSON.stringify(e.trigger));
      console.log("    relatedFiles:", JSON.stringify(e.relatedFiles));
    }
    store.dispatch(e);
  },
);

setTimeout(async () => {
  console.log("[p] touching target");
  const buf = await fs.readFile(target, "utf8");
  await fs.writeFile(target, buf);
}, 2000);

setTimeout(async () => {
  console.log("[p] closing");
  await handle.close();
  process.exit(0);
}, 7000);
