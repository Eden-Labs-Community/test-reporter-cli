# CLAUDE.md

Orientação para o Claude. **Leia este arquivo primeiro** para se localizar rápido.

## Ordem de leitura

1. **CLAUDE.md** (este) — orientação rápida + decisões de arquitetura atuais.
2. **progress.md** — estado atual: o que está feito, em andamento e o próximo.
3. **PRD.md** — fonte da verdade do produto + histórico completo de decisões.
4. **SUCCESS_CRITERIA.md** — definição de pronto do app inteiro (M1–M4 + globais).

## ⚠️ Protocolo obrigatório ao FIM DE CADA TASK

Antes de considerar uma task concluída, **atualize**:

- **progress.md** → salvar o estado (feito / próximo / pendências / log da sessão).
- **CLAUDE.md** (este) → manter as **decisões de arquitetura coerentes com o
  estado atual** do projeto (se algo arquitetural mudou, reflita aqui).
- **PRD.md** → só quando uma **decisão de produto** mudar.
- **SUCCESS_CRITERIA.md** → quando um critério de aceite/escopo mudar ou for
  concluído (marcar o item).

Regra mental: `progress.md = estado` · `CLAUDE.md = arquitetura/orientação` ·
`PRD.md = produto/decisões` · `SUCCESS_CRITERIA.md = definição de pronto`.
Esses quatro devem sempre refletir a realidade atual.

## O que é o projeto

`test-reporter-cli`: CLI de relatório de testes — **`run`/`watch`/`check`**
(+ `init`) e **dois públicos distintos** (dev na TUI · Claude no `check`).
**M1–M4 verdes (82 testes); pacote publicável.**

- **`test-reporter run`** — TUI (Ink) bonita e ao vivo, para devs; comando
  default. Foca a falha no instante em que acontece (decisão #18). Non-TTY/CI/
  `--summary`/`--json` → cai no contrato do `check`. UX flagship. **(M2 ✔)**
- **`test-reporter watch`** — mesma TUI, re-rodando ao salvar. **Vitest:**
  watcher nativo (testes relacionados, #19). **Jest:** `fs.watch` + re-run da
  suíte reusando o `run` 1-shot (#21). UI foca a suíte do **último salvo**
  (RF-04); `a`=tudo `f`=só falhas. Non-TTY → contrato do `check`. **(M3+M4 ✔)**
- **`test-reporter check`** — headless, determinístico, com **contrato de saída
  estável**. **Consumidor primário = o Claude usando como ferramenta** num loop
  agêntico (rodar → ler veredito → corrigir). **(M1 ✔)**
- **`test-reporter init`** — scaffold do config (safe-by-default, #20). **(M4)**
- **TUI (M4):** tema `auto/light/dark` + `--no-color`/`NO_COLOR`; tecla `s` =
  árvore de suítes navegável; detalhe da falha com diff + code-frame. Tudo
  **TUI-only** — `check` segue ANSI-free e byte-idêntico.

## Stack

TypeScript · **ESM** · **Node ≥ 20** · **Ink** (TUI) · **commander** (args) ·
**zod** (config). **Runner plugável**: classe abstrata `TestRunnerAdapter` +
factory pelo campo `runner` do config. Adapters: **Vitest** (`startVitest` +
reporter silencioso, streaming ao vivo; `watch:true` = **watcher nativo**) e
**Jest** (`@jest/core` `runCLI`, import *lazy* / **peer opcional**; streaming
**incremental** via reporter `.cjs` brid-eado por `globalThis`; **watch via
`fs.watch`** re-rodando o `run` 1-shot, #21). Resultados **sempre via API
estruturada do runner — nunca parsear stdout** do relatório humano. Adicionar
runner = **só um novo adapter** (núcleo/contrato intactos).

## Princípios de desenvolvimento (obrigatórios)

- **TDD-lite (red → green, minimalista):** para cada comportamento, escreva
  primeiro o **teste mínimo que falha** (red); depois o **código mínimo para
  passar** (green). Nunca pular o red; não antecipar implementação além do que
  o teste atual exige. Refatorar só com o verde mantido.
- **DRY / boa extração:** nunca escrever o mesmo código duas vezes.
  Normalização de resultados, formatação (texto/JSON), caminhos relativos e
  carregamento de config vivem cada um em **um único módulo reutilizável**; os
  comandos apenas **compõem**. Duplicação aparente ⇒ extrair função/módulo.
- Consequência: `check`, `run` e `watch` compartilham o mesmo núcleo e o
  mesmo modelo de resultados — muda o *renderer*, nunca os dados.

## Invariantes que NÃO podem quebrar (contrato do `check`)

- **stdout = só o veredito.** Logs/diagnóstico vão para **stderr**. Sem ANSI em non-TTY.
- **Nunca vazio:** sucesso → `✓ PASS · …`; falha → `✗ FAIL · …` + um bloco por
  falha (`arquivo › teste` / `at arquivo:linha` / `Tipo: mensagem`).
- **Determinístico:** mesma execução ⇒ mesmos bytes. Ordenar por (arquivo,
  nome). Caminhos relativos POSIX à raiz.
- **Exit code:** `0` tudo passou · `1` algum teste falhou · `>1` erro de
  runner/config.
- **`--json` versionado** (`schemaVersion`).
- **M4 não regride o contrato:** `expected`/`actual` (modelo) e o code-frame
  são **só da TUI**; `summary`/`json` os ignoram → bytes inalterados. Jest
  streaming só liga com sink (TUI); `check` não passa sink. Provado pelos
  e2e byte-exatos verdes.

Detalhes completos do contrato: **PRD.md §7**.

## Estrutura do código (M1–M4)

- `src/config` — loader + zod schema/defaults (`ConfigError`); campo `runner`.
  `defaultConfig()`/`serializeDefaultConfig()` = **fonte única** dos defaults
  (derivada do schema); o caminho "sem arquivo" do `loadConfig` e o `init`
  consomem essa fonte (DRY — nunca divergem).
- `src/core/result` — modelo normalizado + `normalize` (determinístico).
  `toPosixRelative` **exportado** (reuso na store/TUI — DRY). `Failure` tem
  `expected?`/`actual?` **opcionais** (TUI-only; renderers do contrato os
  ignoram → bytes inalterados; sem I/O em `normalize`).
- `src/core/runner/` — abstração do runner (único lugar que conhece Vitest/Jest):
  - `adapter` — classe abstrata `TestRunnerAdapter` (`run` + `watch`) +
    `RunnerError` + `WatchHandle` (`triggerAll`/`triggerFailed`/`close`).
  - `factory` — `createRunner(config)` escolhe o adapter por `config.runner`.
  - `vitest` — `VitestAdapter` (`startVitest` → `RawRun`; `watch:true` =
    watcher nativo, emite `rerun`/`test`/`done` por ciclo). Helpers DRY
    `collectAll`/`collectionError` (compartilhados por `run` 1-shot + watch).
  - `jest` — `JestAdapter` (`@jest/core` `runCLI` *lazy* → `RawRun`).
    **Streaming incremental:** com sink, passa `reporters:[[REPORTER_PATH,{}]]`
    (`jest-stream-reporter.cjs`) + slot `globalThis` (mesmo processo,
    `runInBand`); `toRawTest` é o **único mapeador** (DRY batch+stream);
    reconcilia via `pickUnemitted`; `done` final = agregado autoritativo
    (sem sink em `check` → caminho antigo, contrato intacto). **`watch`:**
    `fs.watch` (recursivo; fallback Linux) debounced re-roda o `run` 1-shot;
    `ignoredWatchPath` **puro/exportado** (testado); loop não unit-testável.
  - `jest-stream-reporter.cjs` — reporter CommonJS (Jest `require`-eia por
    caminho); só faz bridge do test-case p/ o slot `globalThis`. Copiado p/
    `dist/` por `scripts/copy-assets.mjs` no build (tsc não copia non-TS).
- `src/core/run` — **facade**: `runTests(cwd,config,onEvent?)` +
  `watchTests(cwd,config,onEvent)`; re-exporta `RunnerError` e o tipo
  `WatchHandle`. `onEvent` opcional no `run` = streaming p/ TUI; sem ele =
  silencioso (`check` inalterado). O resto do CLI nunca sabe qual runner rodou.
- `src/core/events` — `RunEvent` (`test`/`done`/**`rerun`** — watch, com
  `trigger`) + `pickUnemitted` (dedupe de streaming, runner-agnóstico).
- `src/core/exit` — exit code do resultado (0/1) + `RUNNER_ERROR_EXIT` (2).
- `src/renderers/summary` — texto PRD §7; `failureBlock` **exportado** (reuso
  na TUI — DRY).
- `src/renderers/json` — contrato JSON versionado (`schemaVersion`).
- `src/tui/store` — **store pura** (reducer): decisão #18 (last-failed-wins),
  `n`/`p`/`esc`/`q`, `done` autoritativo; `rerun` (zera ciclo + `watchTrigger`
  RF-04), `a`/`f` → `command` (seq monotônica). **M4:** view `suites` +
  `buildSuiteTree` (selector puro, ordenado por arquivo→suíte) + `treeFocus`;
  `s` alterna, `up`/`down` navegam (clamp), `enter` salta p/ a 1ª falha da
  suíte. Sem React. `tui/createStore` — observable p/ `useSyncExternalStore`.
- `src/renderers/tui` — Ink: `App.tsx` (Overview/FailureView/**SuitesView** +
  `useInput`; prop `watch`; prop `palette`); `theme.ts` (`resolvePalette`
  **puro** — `auto/light/dark`, `--no-color`/`NO_COLOR` → mono); `codeframe.ts`
  (`codeFrame` **puro/best-effort**, 1 read sync, nunca lança); `index.ts`
  `renderTui`/`renderWatchTui` (resolvem palette via `config.ui.theme`+
  `--no-color`; `close()` sem watcher vazado). Só TTY; erro → stderr + exit>1.
- `src/commands/check` — compõe; veredito→stdout, erros→stderr.
- `src/commands/run` — TTY → `renderTui`; headless → delega `runCheck` (DRY).
- `src/commands/watch` — TTY → `renderWatchTui`; headless → `runCheck`
  (1 execução = contrato do `check`, DRY).
- `src/commands/init` — `runInit` (síncrono): escreve `serializeDefaultConfig()`
  no cwd; **safe-by-default** — recusa clobber sem `--force` (exit 1 + stderr
  acionável); stdout = confirmação humana (fora do contrato do `check`).
- `src/index.ts` — **API programática** (`main`/`exports`): núcleo headless
  (`runCheck`/`loadConfig`/`normalize`/`formatText`/`formatJson`/tipos…). TUI
  é CLI-only, fora da API.
- `src/cli` — commander (`run` default + `watch` + `check` + `init`;
  `--cwd/--config/--json`, `run`/`watch`: `--summary`+`--no-color`, `init`:
  `--force`). Versão = **fonte única** (`createRequire('../package.json')`).
  Guarda pré-parse: 1º token non-option fora de `{run,watch,check,init}` →
  "unknown command" + exit 2 (senão o default `run` engoliria o typo).
- `scripts/copy-assets.mjs` — copia o `.cjs` p/ `dist/` no `build`.
- `test/*.test.ts` unit (`runner-factory` = só seleção, **nunca** `.run()`/
  `.watch()`; `theme`, `codeframe`, `jest-watch`=`ignoredWatchPath` puro) +
  `e2e.test.ts`; `test/fixtures/*` (Vitest + `jest-*` paridade).
- `test/init.test.ts`/`cli.test.ts` — e2e do `init` e de help/version/unknown.
- **M1–M4 completos.** Loops watch (Vitest+Ink, Jest+`fs.watch`) e streaming
  incremental do Jest **não são unit-testáveis** (reentrância) → smoke
  event-level num dir real (streaming antes do `done` + flip ao salvar).

## Testes & build

- **Os testes do próprio CLI são escritos em Vitest + TypeScript (ESM)** — o
  mesmo runner que o CLI integra (dogfooding; sem runner extra na stack).
- **Unit:** módulos puros (normalização, formatters, config+zod, exit codes,
  **store da TUI** — contadores/decisão #18/nav, **sem render Ink**; dedupe de
  streaming `pickUnemitted` + `isTerminalState`). Sem spawn.
- **E2E / contrato:** `check` **e** `run` **como processo filho** contra
  *fixtures* (passa/falha/misto/config-inválida/runner-error + `jest-*`):
  stdout byte-exato, stderr, exit code. Inclui **paridade** Vitest↔Jest e
  **`run` non-TTY ≡ `check`** (mesmos bytes/exit). O render Ink em si **não é
  testado automaticamente** (a lógica vive na store pura, que é); smoke manual
  sob pty se precisar ver a TUI. **`init`** roda como processo filho num
  `tmpdir` (não inicia runner → seguro; não usa fixtures).
- ⚠️ **Nunca** chamar o núcleo de dentro de um teste Vitest — ele inicia um
  runner (`startVitest`/`runCLI`); runner-dentro-de-runner = reentrância.
  Sempre processo filho. (Por isso `runner-factory.test.ts` só **constrói** o
  adapter, nunca chama `.run()`.)
- Comandos: `npm run build` (**tsc + `copy-assets.mjs`** copia o `.cjs` p/
  `dist/`) · `npm test` (vitest run, **82 verdes**) · `npm run lint`
  (= `tsc --noEmit`). Não precisa buildar p/ testar — e2e roda via `tsx`
  (o `.cjs` resolve em `src/` via `import.meta.url`). Publicável verificado:
  `npm pack` instala e roda fora do repo (`bin`/shebang/`exports` OK).
- Determinismo: a duração (`<n>s`) é runtime; os testes e2e a **normalizam**
  antes de comparar bytes. O contrato é determinístico módulo duração.
- `line/col` = local da **definição do teste** (Vitest `includeTaskLocation`,
  Jest `testLocationInResults`), não o frame exato da assertiva — estável,
  consistente entre runners e suficiente p/ o contrato.
