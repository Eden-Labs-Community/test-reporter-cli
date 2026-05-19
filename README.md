# test-reporter-cli

A test reporter with **two faces**:

- **`test-reporter run`** / **`watch`** — a pretty, live Ink **TUI for devs**:
  tests stream in, counters update live, the screen jumps to a failure the
  instant it happens, and `watch` re-runs on save.
- **`test-reporter check`** — a **headless, deterministic, agent-friendly
  verdict**: a single stable line (plus one block per failure) on stdout,
  diagnostics on stderr, exit code you can branch on. Built for **Claude /
  CI** in a run → read verdict → fix loop.

Same core, same result model — only the renderer changes. Runner is
**pluggable**: Vitest (default) or Jest, chosen by config. The output contract
is **byte-identical regardless of runner** (modulo duration).

## Install

```bash
npm i -D eden-test-reporter-cli
# or run ad hoc:
npx test-reporter check
```

Requires **Node ≥ 20**. Vitest ships as a dependency; **Jest is an optional
peer** — install it only if you set `"runner": "jest"`.

## Commands

| Command | For | Behavior |
|---|---|---|
| `test-reporter run` *(default)* | devs | Live TUI on a TTY. Non-TTY / CI / `--summary` / `--json` → the exact `check` contract. |
| `test-reporter watch` | devs | Live TUI that re-runs on save. Vitest: native module-graph watcher (related tests). Jest: full-suite re-run on change. Non-TTY → one `check` run. |
| `test-reporter check` | agents / CI | One headless run, deterministic verdict, stable exit code. |
| `test-reporter init` | setup | Writes a documented `test-reporter-config.json`. Refuses to overwrite without `--force`. |

Flags: `--cwd <dir>`, `--config <path>`, `--json`, `--summary` (run/watch),
`--no-color` (run/watch), `--force` (init). `--help`/`--version` per command.

### TUI keys

`n`/`p` cycle failures · `esc` overview · `s` toggle the navigable suite tree
(`↑`/`↓` move, `enter` opens a failing suite) · `a` re-run all, `f` only
failed (watch) · `q` / Ctrl-C quit. The failure view shows the assertion diff
and a source code frame when the runner provides them.

## Output contract (`check`) — the stable bit

stdout is **only the verdict**. Logs/diagnostics go to **stderr**. No ANSI when
non-TTY. Deterministic: same run ⇒ same bytes (modulo the `<dur>s` runtime).
Failures sorted by (file, name); POSIX-relative paths.

**Pass** (exit `0`):

```
✓ PASS · 146 passed · 0 failed · 1 skipped · 4.2s
```

**Fail** (exit `1`) — status line, blank line, then one block per failure:

```
✗ FAIL · 142 passed · 1 failed · 0 skipped · 3.1s

FAIL src/auth/login.test.ts › auth > rejects expired token
  at src/auth/login.test.ts:42:7
  AssertionError: expected 401 to be 200
```

**Runner/config error** → exit `> 1`, empty stdout, actionable stderr (never a
false PASS).

### `--json` (versioned)

```json
{ "schemaVersion": 1, "status": "fail", "ok": false, "passed": 142,
  "failed": 1, "skipped": 0, "total": 143, "durationMs": 3100,
  "failures": [ { "file": "src/auth/login.test.ts", "line": 42, "col": 7,
    "suite": "auth", "test": "rejects expired token",
    "errorType": "AssertionError", "error": "expected 401 to be 200" } ] }
```

`--json` lists **all** failures (ignores `summary.maxFailures`). Pass →
`"status":"pass"`, `"ok":true`, `"failures":[]`.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | all tests passed |
| `1` | at least one test failed |
| `> 1` | runner/config error (decide without parsing) |

## For Claude / agents

Use **`check`** — never the TUI. It is the contract consumer it was built for.

1. Run `test-reporter check` (add `--json` for structured parsing).
2. Branch on the **exit code first**: `0` done · `1` tests failed, read the
   blocks/`failures[]` · `> 1` fix the runner/config, the suite did not run.
3. Each failure block gives `file › test`, `at file:line:col`, and
   `ErrorType: message` — enough to locate and fix without parsing logs.
4. stdout is *only* the verdict and is deterministic, so diffing two runs is
   meaningful. Loop: run → read verdict → fix → repeat.

```bash
test-reporter check --json   # exit 0/1/>1, single JSON object on stdout
```

## Configuration

`test-reporter-config.json` in the project root (or `--config <path>`).
`test-reporter init` scaffolds it with these documented defaults:

```json
{
  "runner": "vitest",
  "include": ["src/**/*.test.ts"],
  "defaultMode": "standard",
  "watch": { "followLastSaved": true },
  "summary": { "detail": "cause", "maxFailures": 50 },
  "ui": { "autoFocusFailures": true, "theme": "auto" }
}
```

`runner`: `"vitest"` | `"jest"`. `summary.detail`: `"cause"` | `"list"`.
`ui.theme`: `"auto"` | `"light"` | `"dark"` (TUI only; `NO_COLOR` and
`--no-color` are honored). Unknown/invalid config → exit `> 1` with an
actionable message.

## Programmatic API

```ts
import { runCheck, loadConfig, formatJson, normalize } from "eden-test-reporter-cli";
```

The library surface is the headless core (run a suite, normalize, format like
`check`). The live TUI is CLI-only.

## License

ISC
