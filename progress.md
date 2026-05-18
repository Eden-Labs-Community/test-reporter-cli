# Progress — test-reporter-cli

> Estado do projeto. **Atualizar ao fim de cada task** (ver CLAUDE.md).
> Última atualização: **2026-05-18**.

## Status atual

**M1 + M2 + M3 implementados e verdes; runner plugável.** `check` headless +
**`run` TUI Ink ao vivo** (default; decisão #18) + **`watch` TUI** (watcher
**nativo do Vitest** — decisão #19/#14: testes relacionados; UI foca a suíte
do último arquivo salvo, RF-04; `a`=tudo `f`=só falhas). Non-TTY/`--summary`/
`--json` em `run`/`watch` → contrato do `check` (paridade testada). Runner por
adapter+factory (`config.runner`): **Vitest e Jest** (watch é Vitest-only no
v1 → débito M4). **60 testes** verdes (unit incl. store pura/streaming +
e2e incl. paridades `run`≡`check` e `watch`≡`check`), lint+build limpos.
Watch verificado fim-a-fim por diagnóstico event-level (path real) + pty-smoke
(render/RF-04). Próximo: **M4** (polimento + débitos herdados).

## Milestones

- [x] **M1** — núcleo p/ o agente: `test-reporter check` + contrato (PRD §7) +
  config (RF-07) + RF-01/02.
- [x] **M2** — `test-reporter run`: TUI Ink ao vivo (RF-09/03/05, decisão #18);
  non-TTY → contrato do `check`. *(débitos de polimento → M4; ver SUCCESS.)*
- [x] **M3** — `test-reporter watch`: TUI ao vivo, watcher **nativo do Vitest**
  (decisão #19/#14), foco no último salvo (RF-04), `a`/`f`/`q`; non-TTY →
  contrato do `check`. *(Vitest-only no v1 → débito M4; ver SUCCESS.)*
- [ ] **M4** — polimento (`init`, temas, publicação npm) + débitos herdados.

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
- [x] **M3 — `watch`** (TDD-lite; decisão #19/#14 = watcher nativo do Vitest):
  - `core/events`: `RunEvent` ganha `rerun` (com `trigger`). Store pura:
    caso `rerun` (zera ciclo + `watchTrigger` p/ RF-04) + teclas `a`/`f`
    (→ `command` seq monotônica que a borda consome) — 3 testes red→green.
  - `TestRunnerAdapter.watch` + `WatchHandle` (`triggerAll`/`triggerFailed`/
    `close`); `JestAdapter.watch` → `RunnerError` (Vitest-only v1; testado).
  - `VitestAdapter.watch`: `startVitest(watch:true)` + `StreamReporter`
    watch-aware (reset dedupe + `rerun`/`done` por ciclo); helpers DRY
    `collectAll`/`collectionError` (refactor do `run` 1-shot **byte-idêntico**,
    e2e contrato intacto). `core/run` ganha facade `watchTests`.
  - `commands/watch` (TTY→`renderWatchTui`, headless→`runCheck`); `cli` `watch`;
    `App.tsx` (prop `watch`: `↻ saved:` + `a`/`f`); `renderWatchTui`
    (dirige `WatchHandle` pela `command` seq; `q`/Ctrl-C → `close()`).
  - Testes: `runner-factory` (+guard `jest.watch`), `tui-store` (+3),
    e2e `watch`≡`check` (Vitest+Jest, exit codes, runner-error). **60 verdes**.
  - Verificação do loop watch+Vitest (não unit-testável — reentrância): pty
    smoke confirmou render+streaming+`↻ saved:`+reset; **diagnóstico
    event-level** (path real, sem Ink) confirmou o veredito do ciclo:
    save → `RERUN{trigger}` → testes re-executam o código novo →
    `DONE{failed:0}` (flip p/ verde ao vivo, RF-04 correto).

## Próximo — M4 (ver SUCCESS_CRITERIA.md › M4)

- [ ] `test-reporter init` gera `test-reporter-config.json` válido (zod).
- [ ] `ui.theme` (auto/claro/escuro) + flag explícita `--no-color`.
- [ ] **Débitos herdados:** streaming **incremental no Jest** (hoje batch;
  habilita `watch` p/ Jest); **árvore de suítes** navegável; **diff/code-frame**
  rico no detalhe da falha.
- [ ] Publicável: `bin`/shebang/`exports`/`files`, `npm pack` instalável,
  `npx test-reporter` fora do repo; `README` (incl. como o Claude chama `check`).
- [ ] Resolver/registrar fora-de-escopo as decisões 🟡 restantes do PRD §10
  (#15 monorepo, #16 coverage).

## Critérios de sucesso

Definição de pronto do app inteiro:
**[SUCCESS_CRITERIA.md](SUCCESS_CRITERIA.md)** — fonte única; aqui só o estado.
Status: **Globais + M1 + M2 + M3 marcados ✓** (M2/M3 com débitos de
polimento explícitos → M4); **M4 pendente**.

## Pendências conhecidas / dívidas

- **Git (corrigido 2026-05-18):** É repo git em `master` com **4 commits**
  (init · M1 `check` · runner plugável/Jest · M2 TUI `run`) — a nota antiga
  "sem commit / não é repo git" estava **errada** (env de início de sessão
  reportou mal). Padrão = **1 commit por milestone**; **M3 está no working
  tree, não commitado** (commit só quando o usuário pedir).
- **Jest = peer dependency opcional** (`peerDependenciesMeta.jest.optional`);
  está em devDependencies só p/ os fixtures/e2e. `@jest/core` é import *lazy*:
  `runner:"jest"` sem Jest instalado → `RunnerError` (exit > 1, sem falso PASS)
  — mesmo caminho dos demais erros de runner, coberto por design.
- `npm audit`: 5 vulnerabilidades *moderate* transitivas (cadeia esbuild/vite
  via vitest) — sem fix não-breaking; reavaliar no M4.
- `line/col` da falha = **local da definição do teste** (`includeTaskLocation`/
  `testLocationInResults`), não o frame da assertiva — determinístico e
  suficiente p/ o contrato; revisitar se precisar do ponto da assertiva.
- **Débitos M2/M3 → M4:** streaming **incremental no Jest** (hoje batch no
  `done`; **habilita `watch` p/ Jest** — hoje `watch` é Vitest-only,
  `jest.watch`→`RunnerError`); **árvore de suítes** navegável no resumo;
  **diff/code-frame** rico no detalhe; flag **`--no-color`** (hoje só
  `NO_COLOR` via Ink/chalk). O loop watch+Ink/Vitest **não é unit-testável**
  (reentrância): a lógica vive na store pura (testada) + e2e de paridade;
  o loop é verificado por **pty-smoke** (render/RF-04) + **diagnóstico
  event-level** (veredito do ciclo num path real).
- **Nota de teste (macOS, custou investigação):** **não** smoke-testar
  `watch` com o alvo sob `os.tmpdir()` — em macOS é `/var/folders/…` →
  symlink p/ `/private/var/…`; o chokidar do Vite detecta a mudança num
  path e invalida o grafo no path resolvido ⇒ rerun roda **código stale**
  (falso "veredito não atualiza"). **Não é bug do produto** (projetos reais
  não vivem em tmpdir symlinkado); usar `realpath`/dir não-symlinkada nos
  testes manuais de watch. Ver memória `vitest-watch-tmpdir-symlink`.

## Decisões em aberto — ver PRD §10

- ✅ RF-03 (múltiplas falhas) → **resolvida: PRD #18** (last-failed-wins).
- ✅ RF-04 watch (estratégia) → **resolvida: PRD #19** (= resolve #14;
  watcher nativo do Vitest, testes relacionados, foco no salvo).
- 🟡 #15 monorepo / #16 coverage → provável fora do v1 (decidir/registrar M4).

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
- **2026-05-18 (M3 — `watch`):** decisão #14 do usuário → PRD **#19** (watcher
  nativo do Vitest = testes relacionados; foco no último salvo, RF-04).
  TDD-lite: store pura `rerun`/`a`/`f` (3) + guard `jest.watch`→`RunnerError`
  (1) + e2e `watch`≡`check` Vitest/Jest (4) = **60 verdes**. Seam
  `TestRunnerAdapter.watch`+`WatchHandle`; `VitestAdapter.watch`
  (`startVitest(watch:true)`+`StreamReporter` por ciclo); helpers DRY
  `collectAll`/`collectionError` (refactor do `run` byte-idêntico, contrato
  intacto); facade `watchTests`; `commands/watch`+`cli`; `App` prop `watch`
  (`↻ saved:`+`a`/`f`) + `renderWatchTui`. Loop watch (não unit-testável):
  pty-smoke (render/RF-04) + diagnóstico event-level confirmaram o flip de
  veredito ao salvar num path real. **Investigação:** "veredito stale" era
  artefato do `os.tmpdir()` symlinkado no harness (macOS `/var`→`/private/var`
  vs invalidação do Vite), **não** bug do produto — registrado. Git: descoberto
  que já há 4 commits em `master` (nota antiga "sem commit" estava errada).
  PRD v1.0 / CLAUDE / SUCCESS / memória atualizados.
