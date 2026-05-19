# SUCCESS_CRITERIA.md

> **Definição de pronto do app inteiro.** Fonte única dos critérios de aceite,
> de M1 a M4 + critérios globais. `PRD.md` define *o que/por quê*; este doc
> define *quando está pronto*; `progress.md` rastreia o *estado*.
>
> Regras: cada item é **verificável** e, quando aplicável, vira teste
> (red → green). Marcar `[x]` só quando comprovado por teste/execução. Manter
> coerente com o PRD (atualizar ao mudar escopo ou concluir item).

## ✅ App finalizado quando

Todos os critérios **Globais + M1 + M2 + M3 + M4** marcados · `npm test` verde ·
pacote instala e roda fora do repo · PRD/CLAUDE/progress/este doc coerentes.

> **STATUS: ✅ FINALIZADO (v1).** Globais + M1–M4 todos marcados; `npm test`
> = **82 verdes**; `npm pack` instalado e rodando fora do repo (verificado);
> os 4 docs coerentes. Decisões 🟡 #15/#16 resolvidas (fora do v1).

---

## Globais (cross-cutting — valem em qualquer milestone)

- [x] **ESM**, **Node ≥ 20**, TS `strict`; `npm run build` sem erro de tipo.
- [x] **DRY:** um único núcleo + modelo de resultados; `check`/`run`/`watch`
  só trocam o *renderer*, nunca duplicam lógica (normalização, formatters,
  caminhos, config cada um em módulo único). *(M1: núcleo pronto p/ M2 reusar.)*
- [x] **TDD-lite:** todo comportamento nasceu de um teste que falhou primeiro.
- [x] Invariantes do contrato do `check` (ver M1) **nunca** regridem. *(cobertos por testes)*
- [x] Resultados sempre via **API estruturada do runner** (Vitest/Jest), zero
  parsing de stdout do relatório humano.
- [x] **Runner plugável & agnóstico:** `TestRunnerAdapter` (classe abstrata) +
  factory por `config.runner`; adapters Vitest e Jest; `check` produz contrato
  **byte-idêntico (módulo duração)** seja qual for o runner; núcleo/normalize/
  renderers/exit não conhecem o runner. *(prova: e2e de paridade Vitest↔Jest.)*
- [x] PRD/CLAUDE/progress/este doc refletem a realidade ao fim de cada task.

## M1 — núcleo p/ o agente (`test-reporter check`)

> Cada item é verificável e vira um teste (red → green). M1 só fecha com **todos** marcados.

**Scaffold**
- [x] `package.json` ESM (`"type": "module"`), `bin.test-reporter` → entry
  buildada; scripts `build`/`test`/`lint`; `npx test-reporter --help` funciona.
- [x] TS `strict` + ESM/NodeNext; `npm run build` sem erros de tipo.

**Núcleo (runner)**
- [x] Roda a suíte do projeto-alvo via o **adapter do runner configurado**
  (Vitest `startVitest` / Jest `runCLI`) → modelo de resultados normalizado
  (suites, testes, status, duração, falha: `file/line/col/errorType/message`).
  **Zero** parsing de stdout.
- [x] Modelo determinístico: falhas ordenadas por (arquivo, nome); caminhos
  relativos POSIX à raiz.

**Contrato `check` — texto (PRD §7)**
- [x] Tudo passa → stdout = exatamente
  `✓ PASS · <P> passed · 0 failed · <S> skipped · <dur>s`; exit `0`; nunca vazio.
- [x] ≥1 falha → `✗ FAIL · …` + linha em branco + 1 bloco por falha
  (`FAIL arquivo › nome` / `  at arquivo:linha[:col]` / `  Tipo: 1ª linha`);
  exit `1`; **nada mais** no stdout.
- [x] Mesma execução ⇒ stdout **byte-idêntico** *(módulo `duração`, que é
  runtime — normalizada nos testes e2e; contrato determinístico módulo duração)*.
- [x] Sem ANSI em non-TTY; logs/diagnóstico só no stderr.
- [x] Acima de `summary.maxFailures`: N blocos + `… +<k> more (use --json)`.
- [x] Erro de runner/config → exit `>1` + erro claro no stderr (nunca PASS falso).

**Contrato `check --json`**
- [x] 1 objeto JSON válido: `schemaVersion, status, ok, passed, failed,
  skipped, total, durationMs, failures[]`; sucesso → `status:"pass", ok:true,
  failures:[]`; lista **todas** as falhas (ignora `maxFailures`); mesmos exit codes.

**Config (RF-07)**
- [x] Carrega `test-reporter-config.json` do cwd ou `--config <path>`, valida
  com zod; inválida → exit `>1` + erro acionável; ausente → defaults
  documentados; `runner` (vitest|jest, default vitest) / `include` /
  `summary.detail` / `summary.maxFailures` respeitados.

**Qualidade (TDD-lite + DRY)**
- [x] Cada critério acima coberto por teste do próprio CLI, escrito **red→green**;
  fixtures: projeto que passa, que falha, misto, config inválida (+ runner-error).
- [x] Sem lógica duplicada: normalização, formatação texto/JSON, relativização
  e config cada um em módulo único; `check` apenas compõe.
- [x] `npm test` verde (36); asserções determinísticas dos contratos texto e
  JSON, **inclusive paridade Vitest↔Jest**.

## M2 — `test-reporter run` (TUI flagship — RF-09/03/05/01/02)

- [x] TTY → abre TUI Ink; non-TTY/`--summary`/`--json` → cai para a saída
  headless (= `check`). *(paridade `run`≡`check` testada em e2e.)*
- [x] Resultados **streamam ao vivo** (Vitest): teste aparece e muda de estado
  em tempo real; contadores ao vivo (RF-02/RF-09). *(smoke sob pty comprovou
  `✓0→✓1` + nome streamando.)* ⚠️ **Jest = batch no `done`** (sem liveness
  incremental) — débito v1 (→ M4); resultado/contrato final inalterado.
- [x] **Auto-foco na falha (RF-03):** ao falhar, a UI troca p/ o detalhe
  (teste, `at arquivo:linha:col`, `Tipo: causa`). *(decisão #18; smoke
  comprovou o salto ao vivo.)* ⚠️ *diff de assertiva / code-frame* rico =
  polimento futuro (→ M4); hoje mostra causa+local (= contrato `check`).
- [x] **Decisão de múltiplas falhas resolvida e implementada** — PRD **#18**
  (last-failed-wins; `n`/`p` cicla arquivo→nome; `esc` overview).
- [x] Navegação: `n`/`p` entre falhas, `esc` volta, `q`/Ctrl-C sai; a TUI não
  trava durante a execução (run async, store reativa). *(nota: abre via `n`,
  não `Enter` — coerente com a decisão #18.)*
- [x] Estética só em TTY; degrade limpo em non-TTY/CI; **`NO_COLOR`** honrado
  (via Ink/chalk). ⚠️ flag **`--no-color`** explícita = M4.
- [x] **DRY:** reusa núcleo/modelo/`normalize`/`failureBlock` do M1; só
  store+renderer `tui` são novos; `check` intacto (contrato não regrediu).
- [x] Testes (unit, sem render real): estado/seleção/navegação; **auto-foco em
  falha** e **contadores ao vivo** via eventos simulados (`tui-store.test.ts`);
  dedupe de streaming (`streaming.test.ts`).
- [x] **Tela de resumo dedicada** (árvore de suites navegável, `enter` abre
  suíte): entregue no M4 — `s` abre a árvore (`buildSuiteTree` puro, ordenado),
  `↑`/`↓` navegam, `enter` salta p/ a 1ª falha da suíte. *(store pura testada
  em `tui-store.test.ts`.)*

## M3 — `test-reporter watch` (RF-04)

- [x] Usa o **watcher nativo do Vitest**; re-roda ao salvar (decisão #19).
  *(diagnóstico event-level num path real: save → `RERUN{trigger}` →
  re-execução do código novo → `DONE` com o veredito atualizado.)*
- [x] Ao salvar, a UI **foca a suíte do último arquivo salvo** (cabeçalho
  `↻ saved: …`) e mostra a execução ao vivo; contadores zeram por ciclo;
  decisão #18 re-aplica (RF-04). *(store pura testada; pty-smoke confirmou.)*
- [x] **Decisão #14 do PRD resolvida e implementada** → **#19** (watcher
  nativo = testes **relacionados** pelo grafo; nem só-o-arquivo nem tudo).
- [x] Teclas: `a` re-roda tudo, `f` só falhas, `q`/Ctrl-C sai; estado de
  watch no cabeçalho. *(`a`/`f` → `command` seq na store, testada; o handle
  é dirigido por `renderWatchTui`.)*
- [x] Ctrl-C / `q` encerra limpo — `WatchHandle.close()` (`vitest.close()`)
  no fim do `renderWatchTui`, sem watcher/processo vazado.
- [x] **DRY:** reusa núcleo/modelo/store/`App`/`failureBlock` de M1/M2;
  helpers `collectAll`/`collectionError` compartilham coleta com o `run`
  1-shot (refactor byte-idêntico, contrato `check` intacto). *(M3 entregou
  watch Vitest-only; **Jest watch resolvido no M4** — decisão #21.)*
- [x] Testes (unit, sem render real): ciclo `rerun` (reset + `watchTrigger`
  RF-04) e teclas `a`/`f` na store; e2e `watch`≡`check` (Vitest+Jest, exit
  codes, runner-error). O loop watch+Ink não é unit-testável (reentrância) →
  pty-smoke + diagnóstico event-level.

## M4 — polimento & release

- [x] `test-reporter init` gera um `test-reporter-config.json` válido (passa no
  zod) com defaults documentados. *(fonte única `defaultConfig`/
  `serializeDefaultConfig` derivada do schema; safe-by-default — recusa
  sobrescrever sem `--force`, decisão #20; `test/init.test.ts` red→green.)*
- [x] `ui.theme` (auto/claro/escuro), `NO_COLOR` e `--no-color` respeitados.
  *(`resolvePalette` puro — `test/theme.test.ts`; fiado por `App`/renderers;
  contrato headless segue ANSI-free.)*
- [x] `--help`/`--version` completos por comando; mensagens de erro acionáveis.
  *(versão = fonte única do `package.json`; guarda de comando desconhecido →
  exit 2; `test/cli.test.ts`.)*
- [x] **Débitos herdados de M2/M3:** streaming **incremental no Jest** via
  reporter `.cjs` (bridge `globalThis`) — **`watch` p/ Jest habilitado**
  (`fs.watch` + re-run, #21); **árvore de suítes navegável** (`s`);
  **diff/code-frame** no detalhe; **`--no-color`** explícita. *(contrato do
  `check` byte-inalterado; smoke event-level confirmou streaming+flip.)*
- [x] **Publicável:** `bin`+shebang OK, `exports`/`files`, `src/index.ts` como
  API, build copia o `.cjs`; **`npm pack` instalado fora do repo** rodando
  `--version`/`init`/`check` (pass/fail/`--json`) — verificado.
- [x] `README` com uso de todos os comandos, o contrato de saída e seção
  **"For Claude / agents"** (exit-code-first, loop run→ler→corrigir).
- [x] Decisões 🟡 do PRD §10 resolvidas: **#15 monorepo** e **#16 coverage**
  → **fora do v1** (registrado §10/§11); #21 fecha o débito de watch do Jest.
