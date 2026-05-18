#!/usr/bin/env node
import { resolve } from "node:path";

import { Command } from "commander";

import { runCheck } from "./commands/check.js";

const program = new Command();

program
  .name("test-reporter")
  .description(
    "Test reporter CLI — `run` (pretty live TUI for devs) and `check` (headless, deterministic verdict for agents/CI).",
  )
  .version("0.1.0");

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
