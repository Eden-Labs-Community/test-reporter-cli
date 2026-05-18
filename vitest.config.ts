import { defineConfig } from "vitest/config";

// Tests for the CLI itself. Unit tests cover pure modules; e2e tests spawn the
// built/`tsx` CLI as a CHILD PROCESS against fixtures — never call the core
// (which boots Vitest) from within a Vitest worker (reentrancy). See CLAUDE.md.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Fixture projects under test/fixtures are run by the CLI, not by us.
    exclude: ["node_modules", "dist", "test/fixtures/**"],
  },
});
