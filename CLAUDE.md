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
**v2.0.1 publicada (`eden-test-reporter-cli`); 107 verdes.**

- **`test-reporter run`** — TUI (blessed) bonita e ao vivo, para devs; comando
  default. Non-TTY/CI/`--summary`/`--json` → cai no contrato do `check`. UX
  flagship. **(M2 ✔)**
- **`test-reporter watch`** — mesma TUI, re-rodando ao salvar. **Vitest:**
  watcher nativo (testes relacionados, #19). **Jest:** `fs.watch` + re-run da
  suíte reusando o `run` 1-shot (#21). UI mostra o **último salvo** (RF-04).
  **Lock-on-save + countdown (#24):** save **trava** a lista no arquivo salvo
  (`🔒 locked: <rel>`); ao ficar verde, conta `5…4…3…2…1` (`↻ starting in N…`)
  e re-roda **tudo** automaticamente. Clique em `[ all ]`/`[ failed ]` pula
  o countdown. Lock **auto-suspende** em falhas (todas visíveis, nunca esconde
  regressão). Non-TTY → contrato do `check`. **(M3+M4 ✔ · #24 ✔)**
- **`test-reporter check`** — headless, determinístico, com **contrato de saída
  estável**. **Consumidor primário = o Claude usando como ferramenta** num loop
  agêntico (rodar → ler veredito → corrigir). **(M1 ✔)**
- **`test-reporter init`** — scaffold do config (safe-by-default, #20). **(M4)**
- **TUI v2 (blessed, mouse-only):** 3 painéis (`Summary` topo / lista no meio /
  `stderr` no fundo). Tema `auto/light/dark` + `--no-color`/`NO_COLOR`. Lista
  **agrupada por arquivo** (cabeçalho por grupo, sem repetir `:linha` por
  linha), ordenada **por (arquivo alfabético, depois `line`/`col` =
  ordem de escrita, nome como tiebreaker)** — só na TUI; `check` segue
  alfabético no contrato.
  Layout **adaptativo**: 0 falhas ⇒ `stderr` escondido, lista expande até o
  fim; ≥1 falha ⇒ split 60/40 com diff + code-frame no `stderr`.
  Interação **100% mouse**: roda **rola** a lista/stderr, **clique numa linha
  abre o teste no editor** (`ui.editor`), **chips** `[ all ]`/`[ failed ]`/
  `[ quit ]` na borda do Summary acionam comandos. **Ctrl-C** é a única tecla
  amarrada (escape de segurança).

## Stack

TypeScript · **ESM** · **Node ≥ 20** · **blessed** (TUI; `@types/blessed`) ·
**commander** (args) · **zod** (config). React/Ink **não estão na stack** (a
TUI v2 foi reescrita em blessed). **Runner plugável**: classe abstrata
`TestRunnerAdapter` + factory pelo campo `runner` do config. Adapters:
**Vitest** (`startVitest` + reporter silencioso, streaming ao vivo; `watch:true`
= **watcher nativo**) e **Jest** (`@jest/core` `runCLI`, import *lazy* / **peer
opcional**; streaming **incremental** via reporter `.cjs` brid-eado por
`globalThis`; **watch via `fs.watch`** re-rodando o `run` 1-shot, #21).
Resultados **sempre via API estruturada do runner — nunca parsear stdout** do
relatório humano. Adicionar runner = **só um novo adapter** (núcleo/contrato
intactos).

## Princípios de desenvolvimento (obrigatórios)

- **Nomes descritivos:** variáveis, funções e parâmetros devem descrever **o que
  são ou o que fazem** — nunca abreviações opacas. Exemplos: `isWin` (não `WIN`),
  `hasFailures` (não `hf`), `stripDuration` (não `sd`). Quem lê o código deve
  entender a intenção sem precisar rastrear a definição.
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
- **Determinístico:** mesma execução ⇒ mesmos bytes. **Falhas no `check`
  continuam ordenadas por (arquivo, nome)**. Caminhos relativos POSIX à raiz.
- **Exit code:** `0` tudo passou · `1` algum teste falhou · `>1` erro de
  runner/config.
- **`--json` versionado** (`schemaVersion`).
- **Mudanças TUI não regridem o contrato:** `expected`/`actual` **e
  `line`/`col` por teste** (modelo `RawTest`) + code-frame + **ordem-por-linha
  na lista** são **só da TUI**; `summary`/`json` os ignoram → bytes inalterados.
  Jest streaming só liga com sink (TUI); `check` não passa sink. Provado pelos
  e2e byte-exatos verdes.

Detalhes completos do contrato: **PRD.md §7**.

## Estrutura do código

- `src/config` — loader + zod schema/defaults (`ConfigError`); campos `runner`
  e `ui.editor` (string, default `code`) = **única fonte da escolha do editor**
  da TUI (sem `.env`/env). `defaultConfig()`/`serializeDefaultConfig()` =
  **fonte única** dos defaults (derivada do schema); o caminho "sem arquivo"
  do `loadConfig` e o `init` consomem essa fonte (DRY — nunca divergem).
- `src/core/result` — modelo normalizado + `normalize` (determinístico).
  `toPosixRelative` **exportado** (reuso na store/TUI — DRY). `Failure` tem
  `expected?`/`actual?` e `RawTest` tem `line?`/`col?` (loc. de definição de
  todo teste) **opcionais — TUI-only**; renderers do contrato os ignoram →
  bytes inalterados; sem I/O em `normalize`.
- `src/core/runner/` — abstração do runner (único lugar que conhece Vitest/Jest):
  - `adapter` — classe abstrata `TestRunnerAdapter` (`run` + `watch`) +
    `RunnerError` + `WatchHandle` (`triggerAll`/`triggerFailed`/`close`).
  - `factory` — `createRunner(config)` escolhe o adapter por `config.runner`.
  - `vitest` — `VitestAdapter` (`startVitest` → `RawRun`; `watch:true` =
    watcher nativo, emite `rerun`/`test`/`done` por ciclo). Helpers DRY
    `collectAll`/`collectionError` (compartilhados por `run` 1-shot + watch).
    **`watch` passa `vitestOptions.stdin = { isTTY: false }`** (stub
    `PassThrough`) p/ Vitest **pular** seu `registerConsoleShortcuts` —
    senão o handler de teclado dele lê o mesmo `process.stdin` que a TUI e
    parseia as escape sequences do mouse-capture do blessed como teclas
    (`w`/`p`/`h`/etc), o que dispara Watch Usage e o prompt "Input a single
    project name" no meio da execução.
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
- `src/tui/store` — **store pura** (reducer). Estado: `phase`/`tests`/`result`/
  `focusedPanel`/`listFocus`/`listOffset`/`stderrOffset`/`openRequest`/`notice`/
  `exited`/`exitCode`/`watchTrigger`/`command`/**`lockedFiles`/`countdown`**.
  Seletores puros:
  - `listStatus(s)` → `"passed"` ou `"failed"` (flip automático quando aparece
    a 1ª falha; decisão derivada de `result.failed`, nunca armazenada).
  - `effectiveLockedFiles(s)` → `lockedFiles` se `failed===0`, senão `undefined`
    (lock **auto-suspende em falhas**; raw `lockedFiles` permanece no estado e
    re-aplica quando voltar a verde — nunca esconde regressão). **#24.**
  - `lockAppliesNow(s)` → `effectiveLockedFiles(s)` **se** algum teste da
    fase atual bate no filtro; senão `undefined` (**fallthrough quando o
    filtro esvaziaria a lista** — evita "salvei e a tela ficou vazia"
    quando o arquivo salvo é source e não há teste com esse path). Usado
    pelo `buildVisibleList` e pelo label da lista.
  - `buildVisibleList(s)` → testes do status atual, ordenados por
    `(arquivo alfabético, line asc, col asc, nome)` — **ordem de escrita
    dentro do arquivo**; só na TUI. **Filtra por `lockAppliesNow(s)`**
    (lock estrito enquanto verde + matches; lista cheia quando suspenso
    ou em fallthrough).
  - `buildVisibleGroups(s)` → mesma lista agrupada por arquivo, com
    `indexInList` pra mapear seleção ↔ grupo (DRY).
  Inputs: `key` (`q`/`tab`/`up`/`down`/`pgup`/`pgdn`/`enter`/`open`/`a`/`f`)
  · `selectListIndex` (clique → escolhe linha + leva foco pra lista) ·
  `focusPanel` (clique num painel → toma scroll-focus) · `notice` (edge →
  store: resultado do spawn do editor) · `countdownStart{at,durationMs}` /
  `countdownClear` (edge → store; `at` vem do `Date.now()` da edge p/ manter
  o reducer puro) · eventos do runner (`test`/`done`/`rerun`). Em `rerun`:
  popula `lockedFiles` priorizando `input.relatedFiles` (Vitest = `_files`
  do `onWatcherRerun`, lista absoluta dos `.test.*` que vão re-rodar; Jest =
  `[trigger]`) com fallback p/ `[trigger]` quando ausente; sem nada → limpa.
  **Zera countdown** sempre. Em `key:"a"`/`"f"`: também zeram countdown
  (mesmo path do auto-fire do `wireCountdown`). `openTarget`→`absFile`
  (sempre absoluto; editor detached sem cwd). `tui/createStore` — observable.
- `src/renderers/tui` — blessed (sem React):
  - `index.ts` — `buildScreen` cria os 3 painéis e os **chips** `[ all ]`/
    `[ failed ]`/`[ quit ]` na borda do Summary; `render()` desenha summary +
    lista agrupada + stderr; **layout adaptativo** (0 falhas ⇒ `stderrBox.hide()`
    + `listBox.bottom = 0`; ≥1 ⇒ split 60/40 com `height: "60%-5"`). `renderTui`
    e `renderWatchTui` montam, ligam `wireEditor` (edge DRY: spawna `ui.editor`
    detached por `openRequest.seq` e reporta `notice` de volta) e drenam runner
    events pro store.
  - **Mouse:** *um único* `screen.on("mouse")` com hit-testing manual
    (`chips → list → stderr`) e **pareamento estrito mousedown↔mouseup**.
    Necessário porque blessed faz `(mouseDown || el).emit('click', data)` em
    todo mouseup que cair num clickable — sem pareamento, um scroll de
    trackpad cuja gesto começa sobre um chip dispara o `click` do chip
    quando o mouseup acaba na lista, rerodando tudo. Por isso **nenhum**
    elemento usa `mouse:true`/`clickable:true`; `screen.enableMouse()` é
    chamado explicitamente; wheel é roteado por posição do cursor (wheel na
    lista move o cursor, wheel no stderr rola o offset).
  - `theme.ts` — `resolvePalette` **puro** (mono se `--no-color`/`NO_COLOR`;
    `auto/light/dark`).
  - `codeframe.ts` — `codeFrame` **puro/best-effort** (nunca lança).
  - `editor.ts` — `editorCommand` **puro**; recebe `ui.editor` do config (sem
    `.env`/env). Blank → default `code`; VS Code & forks
    cursor/windsurf/codium → `-g arq:linha:col`. Testado.
  - **Edges no `index.ts`** (efeitos colaterais isolados, observam a store):
    `wireEditor` (`openRequest.seq`↑ → spawna `ui.editor` detached + `notice`).
    `wireCountdown` (**#24, só `renderWatchTui`**): subscribe inicia o
    countdown ao entrar em "done verde com lock" (`countdownStart{at,durationMs:5000}`);
    interval 100ms dispara `key:"a"` quando `Date.now()` passa do deadline
    (= mesmo path do clique em `[ all ]`). O spinTimer do `buildScreen` foi
    ampliado p/ ticar também durante o countdown (re-render do `N`).
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
  `.watch()`; `theme`, `codeframe`, `jest-watch`=`ignoredWatchPath`,
  `editor`=`editorCommand` puro; `tui-store` cobre flip Passed↔Failed,
  `buildVisibleList` (ordem por arquivo→linha→col→nome + **filtro por
  `effectiveLockedFile`**), `buildVisibleGroups` (DRY com `indexInList`),
  `selectListIndex`/`focusPanel`/`notice`, watch keys, **lock-on-save +
  countdown #24** — `rerun{trigger}` setta/limpa lock, `effectiveLockedFile`
  suspende em falhas, `countdownStart`/`countdownClear`, `rerun`/`a`/`f`
  zeram countdown) + `e2e.test.ts`; `test/fixtures/*` (Vitest + `jest-*` paridade).
- `test/init.test.ts`/`cli.test.ts` — e2e do `init` e de help/version/unknown.
- **M1–M4 + TUI v2 completos.** Loops watch (Vitest, Jest+`fs.watch`),
  streaming incremental do Jest, e o handler de mouse do blessed **não são
  unit-testáveis** (reentrância / I/O do terminal) → smoke event-level num
  dir real (streaming antes do `done` + flip ao salvar; mouse via uso real).

## Testes & build

- **Os testes do próprio CLI são escritos em Vitest + TypeScript (ESM)** — o
  mesmo runner que o CLI integra (dogfooding; sem runner extra na stack).
- **Unit:** módulos puros (normalização, formatters, config+zod, exit codes,
  **store da TUI** — flip, ordenação por linha, seleção por clique, scroll,
  watch; **sem render blessed**; dedupe de streaming `pickUnemitted` +
  `isTerminalState`). Sem spawn.
- **E2E / contrato:** `check` **e** `run` **como processo filho** contra
  *fixtures* (passa/falha/misto/config-inválida/runner-error + `jest-*`):
  stdout byte-exato, stderr, exit code. Inclui **paridade** Vitest↔Jest e
  **`run` non-TTY ≡ `check`** (mesmos bytes/exit). O render blessed em si
  **não é testado automaticamente** (a lógica vive na store pura, que é);
  smoke manual sob pty se precisar ver a TUI. **`init`** roda como processo
  filho num `tmpdir` (não inicia runner → seguro; não usa fixtures).
- ⚠️ **Nunca** chamar o núcleo de dentro de um teste Vitest — ele inicia um
  runner (`startVitest`/`runCLI`); runner-dentro-de-runner = reentrância.
  Sempre processo filho. (Por isso `runner-factory.test.ts` só **constrói** o
  adapter, nunca chama `.run()`.)
- Comandos: `npm run build` (**tsc + `copy-assets.mjs`** copia o `.cjs` p/
  `dist/`) · `npm test` (vitest run, **107 verdes**) · `npm run lint`
  (= `tsc --noEmit`). Não precisa buildar p/ testar — e2e roda via `tsx`
  (o `.cjs` resolve em `src/` via `import.meta.url`). Publicável verificado:
  `npm pack` instala e roda fora do repo (`bin`/shebang/`exports` OK).
- Determinismo: a duração (`<n>s`) é runtime; os testes e2e a **normalizam**
  antes de comparar bytes. O contrato é determinístico módulo duração.
- `line/col` = local da **definição do teste** (Vitest `includeTaskLocation`,
  Jest `testLocationInResults`), não o frame exato da assertiva — estável,
  consistente entre runners e suficiente p/ o contrato.
