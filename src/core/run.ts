import { startVitest } from "vitest/node";

import type { Config } from "../config/index.js";
import type { RawRun, RawTest, TestStatus } from "./result.js";

/** Thrown when Vitest itself fails (collection/import/config error) → exit > 1. */
export class RunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnerError";
  }
}

/** Minimal structural view of the Vitest task tree (avoids unstable types). */
interface VError {
  name?: string;
  message?: string;
}
interface VTask {
  type?: string;
  name?: string;
  filepath?: string;
  location?: { line?: number; column?: number };
  result?: { state?: string; duration?: number; errors?: VError[] };
  tasks?: VTask[];
}

/** No-op reporter: replaces Vitest's default so nothing pollutes stdout. */
class SilentReporter {
  onInit(): void {}
  onPathsCollected(): void {}
  onCollected(): void {}
  onTaskUpdate(): void {}
  onTestRemoved(): void {}
  onWatcherStart(): void {}
  onWatcherRerun(): void {}
  onServerRestart(): void {}
  onUserConsoleLog(): void {}
  onFinished(): void {}
}

function mapStatus(task: VTask): TestStatus {
  const s = task.result?.state;
  if (s === "pass") return "passed";
  if (s === "fail") return "failed";
  return "skipped";
}

function walk(
  task: VTask,
  filepath: string,
  prefix: string[],
  out: RawTest[],
): void {
  if (task.type === "suite") {
    const next = [...prefix, task.name ?? ""];
    for (const child of task.tasks ?? []) walk(child, filepath, next, out);
    return;
  }
  if (task.type === "test" || task.type === "custom") {
    const status = mapStatus(task);
    const err = task.result?.errors?.[0];
    out.push({
      file: filepath,
      name: [...prefix, task.name ?? ""].join(" > "),
      suite: prefix.join(" > "),
      status,
      durationMs: task.result?.duration,
      error:
        status === "failed"
          ? {
              name: err?.name,
              message: err?.message,
              line: task.location?.line,
              col: task.location?.column,
              file: filepath,
            }
          : undefined,
    });
  }
}

function collectFile(file: VTask, out: RawTest[]): void {
  const filepath = file.filepath ?? "";
  for (const child of file.tasks ?? []) walk(child, filepath, [], out);
}

function countTests(task: VTask): number {
  if (task.type === "test" || task.type === "custom") return 1;
  return (task.tasks ?? []).reduce((n, c) => n + countTests(c), 0);
}

function firstErrorMessage(files: VTask[], unhandled: unknown[]): string {
  for (const f of files) {
    const e = f.result?.errors?.[0];
    if (e?.message) return e.message;
  }
  const u = unhandled[0] as { message?: string } | undefined;
  return u?.message ?? "Vitest failed to run the test suite";
}

/** Run the target project's Vitest suite once and return a raw, un-normalized run. */
export async function runVitest(cwd: string, config: Config): Promise<RawRun> {
  const start = Date.now();
  let vitest: Awaited<ReturnType<typeof startVitest>> | undefined;
  try {
    vitest = await startVitest("test", [], {
      root: cwd,
      watch: false,
      run: true,
      include: config.include,
      reporters: [new SilentReporter()],
      includeTaskLocation: true,
      silent: true,
      passWithNoTests: true,
    });
  } catch (err) {
    throw new RunnerError((err as Error).message);
  }
  if (!vitest) throw new RunnerError("Vitest failed to start");

  try {
    const files = vitest.state.getFiles() as unknown as VTask[];
    const unhandled = (
      typeof vitest.state.getUnhandledErrors === "function"
        ? vitest.state.getUnhandledErrors()
        : []
    ) as unknown[];

    const tests: RawTest[] = [];
    for (const f of files) collectFile(f, tests);

    const collectionFailed = files.some(
      (f) => f.result?.state === "fail" && countTests(f) === 0,
    );
    if (unhandled.length > 0 || collectionFailed) {
      throw new RunnerError(firstErrorMessage(files, unhandled));
    }

    return { rootDir: cwd, tests, durationMs: Date.now() - start };
  } finally {
    await vitest.close();
  }
}
