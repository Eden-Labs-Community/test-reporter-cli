#!/usr/bin/env node
import { resolve } from "node:path";

import { Command } from "commander";

import { runCheck } from "./commands/check.js";
import { runRun } from "./commands/run.js";
import { runWatch } from "./commands/watch.js";

const program = new Command();

program
  .name("test-reporter")
  .description(
    "Test reporter CLI — `run` (pretty live TUI for devs) and `check` (headless, deterministic verdict for agents/CI).",
  )
  .version("0.1.0");

program
  .command("run", { isDefault: true })
  .description(
    "Flagship: live TUI on a TTY; falls back to the `check` verdict when headless (CI/pipe/--summary/--json).",
  )
  .option("--cwd <dir>", "project directory", process.cwd())
  .option("--config <path>", "path to test-reporter-config.json")
  .option("--json", "headless: emit the stable, versioned JSON contract")
  .option("--summary", "force the headless text verdict even on a TTY")
  .action(
    async (opts: {
      cwd: string;
      config?: string;
      json?: boolean;
      summary?: boolean;
    }) => {
      const code = await runRun({
        cwd: resolve(opts.cwd),
        configPath: opts.config,
        json: Boolean(opts.json),
        summary: Boolean(opts.summary),
      });
      process.exit(code);
    },
  );

program
  .command("watch")
  .description(
    "Live TUI that re-runs on save (Vitest native watcher; focuses the saved file's suite). Headless (CI/pipe/--summary/--json) → one `check` run.",
  )
  .option("--cwd <dir>", "project directory", process.cwd())
  .option("--config <path>", "path to test-reporter-config.json")
  .option("--json", "headless: emit the stable, versioned JSON contract")
  .option("--summary", "force the headless text verdict instead of the TUI")
  .action(
    async (opts: {
      cwd: string;
      config?: string;
      json?: boolean;
      summary?: boolean;
    }) => {
      const code = await runWatch({
        cwd: resolve(opts.cwd),
        configPath: opts.config,
        json: Boolean(opts.json),
        summary: Boolean(opts.summary),
      });
      process.exit(code);
    },
  );

program
  .command("check")
  .description(
    "Run the suite once and print a deterministic, agent-friendly verdict.",
  )
  .option("--cwd <dir>", "project directory", process.cwd())
  .option("--config <path>", "path to test-reporter-config.json")
  .option("--json", "emit the stable, versioned JSON contract instead of text")
  .action(async (opts: { cwd: string; config?: string; json?: boolean }) => {
    const code = await runCheck({
      cwd: resolve(opts.cwd),
      configPath: opts.config,
      json: Boolean(opts.json),
    });
    process.exit(code);
  });

program.parseAsync(process.argv);
