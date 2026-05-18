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

`test-reporter-cli`: CLI de relatório de testes com **três comandos e dois
públicos distintos**:

- **`test-reporter run`** — TUI (Ink) bonita e ao vivo, para devs; comando
  default. Foca a falha no instante em que acontece (decisão #18). Non-TTY/CI/
  `--summary`/`--json` → cai no contrato do `check`. UX flagship. **(M2 ✔)**
- **`test-reporter watch`** — mesma TUI, re-rodando ao salvar via o **watcher
  nativo do Vitest** (decisão #19: testes relacionados pelo grafo); a UI foca
  a suíte do **último arquivo salvo** (RF-04); `a`=tudo `f`=só falhas. Watch é
  **Vitest-only no v1** (Jest = débito M4). Non-TTY → contrato do `check`.
  **(M3 ✔)**
- **`test-reporter check`** — headless, determinístico, com **contrato de saída
  estável**. **Consumidor primário = o Claude usando como ferramenta** num loop
  agêntico (rodar → ler veredito → corrigir). **(M1 ✔)**

## Stack

TypeScript · **ESM** · **Node ≥ 20** · **Ink** (TUI, M2/M3) · **commander**
(args) · **zod** (config). **Runner plugável** (não mais travado em Vitest):
classe abstrata `TestRunnerAdapter` + factory pelo campo `runner` do config.
Adapters no v1: **Vitest** (`startVitest` + reporter silencioso, streaming p/
store/TUI; `watch:true` = **watcher nativo**, M3) e **Jest** (`@jest/core`
`runCLI`, import *lazy* / **peer opcional**; sem watch no v1 → `RunnerError`).
Resultados **sempre via API estruturada do runner — nunca parsear stdout** do
relatório humano. Adicionar runner = **só um novo adapter** (núcleo/contrato
intactos).

## Princípios de desenvolvimento (obrigatórios)

- **TDD-lite (red → green, minimalista):** para cada comportamento, escreva
  primeiro o **teste mínimo que falha** (red); depois o **código mínimo para
  passar** (green). Nunca pular o red; não antecipar implementação além do que
  o teste atual exige. Refatorar só com o verde mantido.
- **DRY / boa extração:** nunca escrever o mesmo código duas vezes.
  Normalização de resultados, formatação (texto/JSON), caminhos relativos e
  carregamento de config vivem cada um em **um único módulo reutilizável**; os
  comandos apenas **compõem**. Duplicação aparente ⇒ extrair função/módulo.
- Consequência: `check` e os futuros `run`/`watch` compartilham o mesmo núcleo
  e o mesmo modelo de resultados — muda o *renderer*, nunca os dados.

## Invariantes que NÃO podem quebrar (contrato do `check`)

- **stdout = só o veredito.** Logs/diagnóstico vão para **stderr**. Sem ANSI em non-TTY.
- **Nunca vazio:** sucesso → `✓ PASS · …`; falha → `✗ FAIL · …` + um bloco por
  falha (`arquivo › teste` / `at arquivo:linha` / `Tipo: mensagem`).
- **Determinístico:** mesma execução ⇒ mesmos bytes. Ordenar por (arquivo,
  nome). Caminhos relativos POSIX à raiz.
- **Exit code:** `0` tudo passou · `1` algum teste falhou · `>1` erro de
  runner/config.
- **`--json` versionado** (`schemaVersion`).

Detalhes completos do contrato: **PRD.md §7**.

## Estrutura do código (M1 + M2 + M3 criados)

- `src/config` — loader + zod schema/defaults (`ConfigError`); campo `runner`.
- `src/core/result` — modelo normalizado + `normalize` (determinístico).
- `src/core/runner/` — abstração do runner (único lugar que conhece Vitest/Jest):
  - `adapter` — classe abstrata `TestRunnerAdapter` (`run` + `watch`) +
    `RunnerError` + `WatchHandle` (`triggerAll`/`triggerFailed`/`close`).
  - `factory` — `createRunner(config)` escolhe o adapter por `config.runner`.
  - `vitest` — `VitestAdapter` (`startVitest` → `RawRun`; `watch:true` =
    watcher nativo, emite `rerun`/`test`/`done` por ciclo). Helpers DRY
    `collectAll`/`collectionError` (compartilhados por `run` 1-shot + watch).
  - `jest` — `JestAdapter` (`@jest/core` `runCLI` *lazy* → `RawRun`); `watch`
    lança `RunnerError` (Vitest-only no v1; débito M4).
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
  `n`/`p`/`esc`/`q`, `done` autoritativo; **M3**: `rerun` (zera ciclo + grava
  `watchTrigger` p/ RF-04), teclas `a`/`f` → `command` (seq monotônica que a
  borda consome — mesma disciplina do `exited`). Sem React. `tui/createStore`
  — observable fininha p/ `useSyncExternalStore`.
- `src/renderers/tui` — Ink: `App.tsx` (Overview/FailureView + `useInput`;
  prop `watch` → cabeçalho `↻ saved:` + teclas `a`/`f`); `index.ts`
  `renderTui` (run, 1-shot) e **`renderWatchTui`** (watch: dirige o
  `WatchHandle` pela `command` seq da store; `q`/Ctrl-C → `close()` sem
  watcher vazado). Só TTY; erro de runner → stderr + exit > 1.
- `src/commands/check` — compõe; veredito→stdout, erros→stderr.
- `src/commands/run` — TTY → `renderTui`; headless → delega `runCheck` (DRY).
- `src/commands/watch` — TTY → `renderWatchTui`; headless → `runCheck`
  (1 execução = contrato do `check`, DRY).
- `src/cli` — commander (`run` default + `watch` + `check`;
  `--cwd/--config/--json`, `run`/`watch` têm `--summary`).
- `test/*.test.ts` unit (inclui `runner-factory` — também afirma o guard
  `jest.watch`→`RunnerError`, sem nunca chamar `.run()`/`.watch()` real) +
  `test/e2e.test.ts`; `test/fixtures/*` — `pass/fail/mixed/config-invalid/
  runner-error` (Vitest) + `jest-pass/jest-mixed` (contrato idêntico via Jest).
- M4 (polimento) ainda não criado.

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
  sob pty se precisar ver a TUI.
- ⚠️ **Nunca** chamar o núcleo de dentro de um teste Vitest — ele inicia um
  runner (`startVitest`/`runCLI`); runner-dentro-de-runner = reentrância.
  Sempre processo filho. (Por isso `runner-factory.test.ts` só **constrói** o
  adapter, nunca chama `.run()`.)
- Comandos: `npm run build` (tsc) · `npm test` (vitest run) · `npm run lint`
  (= `tsc --noEmit`). Não precisa buildar p/ testar — e2e roda via `tsx`.
- Determinismo: a duração (`<n>s`) é runtime; os testes e2e a **normalizam**
  antes de comparar bytes. O contrato é determinístico módulo duração.
- `line/col` = local da **definição do teste** (Vitest `includeTaskLocation`,
  Jest `testLocationInResults`), não o frame exato da assertiva — estável,
  consistente entre runners e suficiente p/ o contrato.
