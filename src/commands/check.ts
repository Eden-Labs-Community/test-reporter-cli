import { ConfigError, loadConfig } from "../config/index.js";
import { RUNNER_ERROR_EXIT, resultExitCode } from "../core/exit.js";
import { normalize } from "../core/result.js";
import { RunnerError, runTests } from "../core/run.js";
import { formatJson } from "../renderers/json.js";
import { formatText } from "../renderers/summary.js";

export interface CheckOptions {
  cwd: string;
  configPath?: string;
  json?: boolean;
}

/**
 * `check`: run the suite once, print the deterministic verdict to STDOUT only,
 * diagnostics to STDERR. Returns the process exit code (0/1/>1). Never prints
 * a verdict on a runner/config error (no false PASS).
 */
export async function runCheck(opts: CheckOptions): Promise<number> {
  try {
    const config = loadConfig(opts.cwd, opts.configPath);
    const result = normalize(await runTests(opts.cwd, config));
    const out = opts.json
      ? formatJson(result)
      : formatText(result, {
          maxFailures: config.summary.maxFailures,
          detail: config.summary.detail,
        });
    process.stdout.write(`${out}\n`);
    return resultExitCode(result);
  } catch (err) {
    if (err instanceof ConfigError || err instanceof RunnerError) {
      process.stderr.write(`${err.name}: ${err.message}\n`);
    } else {
      process.stderr.write(`Unexpected error: ${(err as Error).message}\n`);
    }
    return RUNNER_ERROR_EXIT;
  }
}
