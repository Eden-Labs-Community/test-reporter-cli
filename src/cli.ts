#!/usr/bin/env node
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { Command } from "commander";

import { runCheck } from "./commands/check.js";
import { runInit } from "./commands/init.js";
import { runRun } from "./commands/run.js";
import { runWatch } from "./commands/watch.js";

// Single source of truth for the version: the package manifest.
const pkg = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

// `run` is the default command, so commander would otherwise route a typo'd
// command (e.g. `test-reporter frobnicate`) to `run` and exit 0 silently.
// None of our commands take positional operands, so a bare non-option first
// token that isn't a known command is unambiguously a mistake — fail loud.
const COMMANDS = new Set(["run", "watch", "check", "init"]);
const first = process.argv[2];
if (first && !first.startsWith("-") && !COMMANDS.has(first)) {
  process.stderr.write(
    `error: unknown command '${first}'. Run \`test-reporter --help\` for the command list.\n`,
  );
  process.exit(2);
}

const program = new Command();

program
  .name("test-reporter")
  .description(
    "Test reporter CLI — `run` (pretty live TUI for devs) and `check` (headless, deterministic verdict for agents/CI).",
  )
  .version(pkg.version);

program
  .command("run", { isDefault: true })
  .description(
    "Flagship: live TUI on a TTY; falls back to the `check` verdict when headless (CI/pipe/--summary/--json).",
  )
  .option("--cwd <dir>", "project directory", process.cwd())
  .option("--config <path>", "path to test-reporter-config.json")
  .option("--json", "headless: emit the stable, versioned JSON contract")
  .option("--summary", "force the headless text verdict even on a TTY")
  .option("--no-color", "disable ANSI color in the live TUI")
  .action(
    async (opts: {
      cwd: string;
      config?: string;
      json?: boolean;
      summary?: boolean;
      color?: boolean;
    }) => {
      const code = await runRun({
        cwd: resolve(opts.cwd),
        configPath: opts.config,
        json: Boolean(opts.json),
        summary: Boolean(opts.summary),
        noColor: opts.color === false,
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
  .option("--no-color", "disable ANSI color in the live TUI")
  .action(
    async (opts: {
      cwd: string;
      config?: string;
      json?: boolean;
      summary?: boolean;
      color?: boolean;
    }) => {
      const code = await runWatch({
        cwd: resolve(opts.cwd),
        configPath: opts.config,
        json: Boolean(opts.json),
        summary: Boolean(opts.summary),
        noColor: opts.color === false,
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

program
  .command("init")
  .description(
    "Scaffold a test-reporter-config.json with documented defaults (refuses to overwrite without --force).",
  )
  .option("--cwd <dir>", "project directory", process.cwd())
  .option("--force", "overwrite an existing config file")
  .action((opts: { cwd: string; force?: boolean }) => {
    process.exit(
      runInit({ cwd: resolve(opts.cwd), force: Boolean(opts.force) }),
    );
  });

program.parseAsync(process.argv);
