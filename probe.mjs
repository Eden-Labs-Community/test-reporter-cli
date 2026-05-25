// Probe — no edits to the project. Boots Vitest in watch mode against
// the playground, instruments onWatcherRerun, edits math.test.ts to
// trigger a rerun, prints what the reporter actually sees, then exits.
import { startVitest } from "vitest/node";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { PassThrough } from "node:stream";

const cwd = "/Users/maisondamarante/Documents/Apps/eden-labs/eden-test-reporter-cli/playground";
const target = resolve(cwd, "src/math.test.ts");

class Probe {
  onInit(ctx) {
    console.log("[probe] onInit — ctx.config.root =", ctx.config?.root);
    this.ctx = ctx;
  }
  onWatcherRerun(files, trigger) {
    console.log("[probe] onWatcherRerun");
    console.log("        trigger:", JSON.stringify(trigger));
    console.log("        files:", JSON.stringify(files, null, 2));
  }
  onFinished() {
    if (!this.ctx) return;
    const files = this.ctx.state.getFiles();
    const filepaths = files.map((f) => f.filepath);
    console.log("[probe] onFinished — file paths in state:");
    for (const fp of filepaths) console.log("        ", JSON.stringify(fp));
  }
  onPathsCollected() {}
  onCollected() {}
  onTaskUpdate() {}
  onTestRemoved() {}
  onWatcherStart() {}
  onServerRestart() {}
  onUserConsoleLog() {}
}

console.log("[probe] cwd =", cwd);
console.log("[probe] target =", target);

const vitest = await startVitest(
  "test",
  [],
  {
    root: cwd,
    watch: true,
    include: ["src/**/*.test.ts"],
    reporters: [new Probe()],
    includeTaskLocation: true,
    silent: true,
    passWithNoTests: true,
  },
  undefined,
  {
    stdin: Object.assign(new PassThrough(), { isTTY: false }),
  },
);

// Wait for initial run to settle, then touch the test file.
setTimeout(async () => {
  console.log("[probe] touching target to trigger rerun…");
  const buf = await fs.readFile(target, "utf8");
  await fs.writeFile(target, buf); // identical write → mtime bump
}, 1500);

// Close after we've seen the rerun.
setTimeout(async () => {
  console.log("[probe] closing");
  await vitest.close();
  process.exit(0);
}, 6000);
