import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { z } from "zod";

/** Thrown for any user-facing config problem (missing/invalid file or schema). */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const ConfigSchema = z
  .object({
    include: z.array(z.string()).default(["src/**/*.test.ts"]),
    defaultMode: z.enum(["standard", "watch"]).default("standard"),
    watch: z
      .object({ followLastSaved: z.boolean().default(true) })
      .default({}),
    summary: z
      .object({
        detail: z.enum(["list", "cause"]).default("cause"),
        maxFailures: z.number().int().positive().default(50),
      })
      .default({}),
    ui: z
      .object({
        autoFocusFailures: z.boolean().default(true),
        theme: z.enum(["auto", "light", "dark"]).default("auto"),
      })
      .default({}),
  })
  .strip();

export type Config = z.infer<typeof ConfigSchema>;

const CONFIG_FILENAME = "test-reporter-config.json";

/**
 * Load and validate the reporter config.
 * - no explicit path and no file → documented defaults
 * - explicit path missing → ConfigError
 * - bad JSON or schema-invalid → actionable ConfigError
 */
export function loadConfig(cwd: string, explicitPath?: string): Config {
  const path = explicitPath
    ? isAbsolute(explicitPath)
      ? explicitPath
      : join(cwd, explicitPath)
    : join(cwd, CONFIG_FILENAME);

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      if (explicitPath) throw new ConfigError(`Config file not found: ${path}`);
      return ConfigSchema.parse({});
    }
    throw new ConfigError(
      `Could not read config ${path}: ${(err as Error).message}`,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`Invalid JSON in ${path}: ${(err as Error).message}`);
  }

  const result = ConfigSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`Invalid config in ${path}:\n${issues}`);
  }
  return result.data;
}
