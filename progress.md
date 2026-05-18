# Progress — test-reporter-cli

> Estado do projeto. **Atualizar ao fim de cada task** (ver CLAUDE.md).
> Última atualização: **2026-05-18**.

## Status atual

**M1 + M2 implementados e verdes; runner plugável.** `check` headless +
**`run` TUI Ink ao vivo** (default; foca a falha no instante — decisão #18;
non-TTY/`--summary`/`--json` → contrato do `check`, paridade testada).
Runner por adapter+factory (`config.runner`): **Vitest e Jest**.
**52 testes** verdes (unit incl. store pura/streaming + e2e incl. paridades),
lint+build limpos. Próximo: **M3** (`watch`).

## Milestones

- [x] **M1** — núcleo p/ o agente: `test-reporter check` + contrato (PRD §7) +
  config (RF-07) + RF-01/02.
- [x] **M2** — `test-reporter run`: TUI Ink ao vivo (RF-09/03/05, decisão #18);
  non-TTY → contrato do `check`. *(débitos de polimento → M4; ver SUCCESS.)*
- [ ] **M3** — `test-reporter watch` (RF-04).
- [ ] **M4** — polimento (`init`, temas, publicação npm).

## Feito

- [x] Docs base: `PRD.md` (v0.7), `CLAUDE.md`, `progress.md`, `SUCCESS_CRITERIA.md`.
- [x] `git init -b master` + remote `origin`. **Sem commits ainda.**
- [x] **M1** (TDD-lite, red→green por módulo):
  - Scaffold ESM (`type:module`, `bin: test-reporter`, tsconfig strict/NodeNext,
    scripts build/test/lint).
  - `src/config` (zod + defaults + `--config`); `src/core/result`
    (modelo + `normalize` determinístico); `src/core/run` (`startVitest` +
    reporter silencioso + `RunnerError`); `src/core/exit`;
    `src/renderers/summary` (texto; `detail` list/cause; `maxFailures`);
    `src/renderers/json` (contrato versionado); `src/commands/check`;
    `src/cli` (commander; `--cwd/--config/--json`).
  - Fixtures: pass / fail / mixed / config-invalid / runner-error.
  - 29 testes verdes (config, normalize, summary-text, json-exit, e2e via
    processo filho).
- [x] **Runner plugável** (revisão da decisão #1 do PRD → #17):
  - `src/core/runner/`: `adapter` (classe abstrata `TestRunnerAdapter` +
    `RunnerError`), `factory` (`createRunner` por `config.runner`),
    `vitest` (refactor do antigo `runVitest`), `jest` (`@jest/core` *lazy*).
  - `src/core/run` virou facade (`runTests`); `config.runner` (zod, default
    vitest); `check` inalterado (só compõe via factory).
  - Fixtures `jest-pass`/`jest-mixed` + `runner-factory.test.ts` + e2e de
    **paridade**: **36 testes verdes**, lint limpo.
- [x] **M2 — TUI `run`** (TDD-lite; decisão #18 = last-failed-wins):
  - `src/core/events` (`RunEvent` + `pickUnemitted`); sink opcional em
    `TestRunnerAdapter.run`/`runTests`; **Vitest streama ao vivo**
    (`onInit`/`onTaskUpdate`), **Jest batch** no `done`; `check` intacto.
  - `src/tui/store` (reducer **puro**: contadores, decisão #18, `n`/`p`/`esc`/
    `q`, `done`) + `tui/createStore`; `failureBlock` exportado (DRY).
  - `src/renderers/tui` (Ink `App.tsx` + `renderTui`); `src/commands/run`
    (TTY→TUI, headless→`runCheck`); `cli` `run` default + `--summary`.
  - Testes: `tui-store` (8, incl. auto-foco + contadores), `streaming` (4),
    e2e `run`≡`check` (Vitest+Jest, exit codes). **52 verdes**; smoke real
    sob pty confirmou render+streaming+salto na falha.

## Próximo — M3 (ver SUCCESS_CRITERIA.md › M3)

- [ ] `test-reporter watch`: watcher nativo do Vitest, re-roda ao salvar.
- [ ] Foca a suíte do **último arquivo salvo** ao vivo (RF-04).
- [ ] **Resolver decisão #14 do PRD** (rodar só o arquivo vs tudo e focar).
- [ ] Reusa núcleo/store/renderer de M1/M2 (DRY); encerra limpo (sem vazar
  watcher). *(p/ Jest, watch depende do streaming incremental — débito M4.)*

## Critérios de sucesso

Definição de pronto do app inteiro:
**[SUCCESS_CRITERIA.md](SUCCESS_CRITERIA.md)** — fonte única; aqui só o estado.
Status: **Globais + M1 + M2 marcados ✓** (M2 com débitos de polimento
explícitos → M4); M3–M4 pendentes.

## Pendências conhecidas / dívidas

- Sem commit git ainda; `master` só materializa após o 1º commit. *(o ambiente
  atual reporta "não é repo git" — confirmar `git init` antes do 1º commit.)*
- **Jest = peer dependency opcional** (`peerDependenciesMeta.jest.optional`);
  está em devDependencies só p/ os fixtures/e2e. `@jest/core` é import *lazy*:
  `runner:"jest"` sem Jest instalado → `RunnerError` (exit > 1, sem falso PASS)
  — mesmo caminho dos demais erros de runner, coberto por design.
- `npm audit`: 5 vulnerabilidades *moderate* transitivas (cadeia esbuild/vite
  via vitest) — sem fix não-breaking; reavaliar no M4.
- `line/col` da falha = **local da definição do teste** (`includeTaskLocation`/
  `testLocationInResults`), não o frame da assertiva — determinístico e
  suficiente p/ o contrato; revisitar se precisar do ponto da assertiva.
- **Débitos M2 → M4:** streaming **incremental no Jest** (hoje batch no `done`);
  **árvore de suítes** navegável no resumo; **diff/code-frame** rico no detalhe;
  flag **`--no-color`** (hoje só `NO_COLOR` via Ink/chalk). O render Ink não é
  testado automaticamente (lógica na store pura, testada; smoke manual sob pty).

## Decisões em aberto — ver PRD §10

- ✅ RF-03 (múltiplas falhas) → **resolvida: PRD #18** (last-failed-wins).
- RF-04 watch → decisão #14 (M3) · monorepo / coverage (provável fora do v1).

## Log de sessões

- **2026-05-18 (spec):** init npm/git; PRD v0.1→v0.7; memória; `CLAUDE.md`,
  `progress.md`, `SUCCESS_CRITERIA.md`; princípios TDD-lite/DRY; decisão de
  testes (Vitest+TS/ESM, e2e por processo filho).
- **2026-05-18 (M1):** M1 implementado em TDD-lite — scaffold ESM, config(zod),
  modelo+normalize, formatters texto/JSON, exit codes, núcleo
  `startVitest`+reporter silencioso, `check`+CLI, 5 fixtures, 29 testes verdes.
  Gap corrigido: `summary.detail` (list/cause) agora aplicado. Docs +
  SUCCESS_CRITERIA atualizados (Globais + M1 ✓).
- **2026-05-18 (runner plugável):** revisada a decisão #1 do PRD (→ #17).
  TDD-lite red→green: `config.runner` (zod); `TestRunnerAdapter` (classe
  abstrata) + `createRunner` factory; `VitestAdapter` (extração do `runVitest`,
  refactor puro) + `JestAdapter` (`@jest/core` `runCLI`, *lazy*, peer opcional);
  `core/run` vira facade `runTests`. Fixtures `jest-pass/jest-mixed`, teste de
  factory e e2e de paridade Vitest↔Jest. **36 testes verdes**, lint limpo.
- **2026-05-18 (M2 — TUI `run`):** decisão #13 do usuário → PRD **#18**
  (last-failed-wins). TDD-lite: store pura (8 testes) + dedupe streaming
  (`pickUnemitted`/`isTerminalState`, 4). `RunEvent` + sink opcional no adapter
  (Vitest ao vivo via `onInit`/`onTaskUpdate`; Jest batch); Ink `App.tsx` +
  `renderTui`; `commands/run` (headless→`runCheck`, DRY); `run` default no CLI;
  `tsconfig` `jsx:react-jsx`; deps `ink`/`react`(+types). e2e `run`≡`check`
  (Vitest+Jest, exit codes). **52 verdes**, lint+build limpos; smoke sob pty
  confirmou streaming+salto na falha. PRD v0.9 / CLAUDE / SUCCESS / memória
  atualizados; débitos de polimento registrados em M4.
  PRD v0.8 / CLAUDE / SUCCESS_CRITERIA / memória atualizados.
