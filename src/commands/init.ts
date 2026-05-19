import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_FILENAME, serializeDefaultConfig } from "../config/index.js";

export interface InitOptions {
  cwd: string;
  /** Overwrite an existing config file instead of refusing. */
  force?: boolean;
}

/**
 * `init`: scaffold a documented, schema-valid `test-reporter-config.json` into
 * the project. Human-facing (not the agent contract): a confirmation line on
 * stdout, errors on stderr. Safe by default — refuses to clobber an existing
 * file unless `--force`. Exit `0` on success, `1` on refusal/write error.
 */
export function runInit(opts: InitOptions): number {
  const path = join(opts.cwd, CONFIG_FILENAME);

  if (existsSync(path) && !opts.force) {
    process.stderr.write(
      `${CONFIG_FILENAME} already exists at ${path}. Re-run with --force to overwrite.\n`,
    );
    return 1;
  }

  try {
    writeFileSync(path, serializeDefaultConfig());
  } catch (err) {
    process.stderr.write(
      `Could not write ${path}: ${(err as Error).message}\n`,
    );
    return 1;
  }

  process.stdout.write(`Wrote ${CONFIG_FILENAME} with documented defaults.\n`);
  return 0;
}
