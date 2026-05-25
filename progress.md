# Progress — test-reporter-cli

> Estado do projeto. **Atualizar ao fim de cada task** (ver CLAUDE.md).
> Última atualização: **2026-05-25**.

## Status atual

**M1–M4 verdes — v1 FINALIZADO + UX v1.1 + #23 + #24; pacote publicável.**
`check` headless determinístico (consumidor primário = Claude) + **`run`/
`watch` TUI blessed ao vivo** (decisão #18; tema `auto/light/dark` +
`--no-color`/`NO_COLOR`; lista de testes mouse-first como tela padrão —
roda rola, clique abre no editor (`ui.editor`), arquivo+suíte em negrito
branco (#23); detalhe da falha com diff+code-frame — tudo TUI-only) +
**`init`** (safe-by-default, #20). **Watch:** Vitest = watcher nativo (#19);
Jest = `fs.watch` + re-run da suíte (#21); **#24 lock-on-save + countdown 5s**
trava a lista no arquivo salvo (`🔒 locked: <rel>`), conta `5…4…3…2…1`
(`↻ starting in N…`) ao ficar verde e re-roda tudo automaticamente; `[ all ]`
pula; lock auto-suspende em falhas (`effectiveLockedFile` puro). **Runner
plugável** (Vitest/Jest) com **streaming incremental no Jest** via reporter
`.cjs` (bridge `globalThis`; `done` final = agregado autoritativo → contrato
intacto). Non-TTY/`--summary`/`--json` → contrato do `check` (paridade
testada). **107 testes verdes** (98 + 6 do #24 + 3 do fix `relatedFiles`/fallthrough), lint+build limpos.
**PUBLICADO no npm: `eden-test-reporter-cli@1.0.0`** (tag `latest`, registry
público). Decisões 🟡 #15/#16 resolvidas (fora do v1). Próximo: smoke
manual da TUI em TTY real (lock + countdown).

## Milestones

- [x] **M1** — núcleo p/ o agente: `test-reporter check` + contrato (PRD §7) +
  config (RF-07) + RF-01/02.
- [x] **M2** — `test-reporter run`: TUI Ink ao vivo (RF-09/03/05, decisão #18);
  non-TTY → contrato do `check`. *(débitos de polimento → M4; ver SUCCESS.)*
- [x] **M3** — `test-reporter watch`: TUI ao vivo, watcher **nativo do Vitest**
  (decisão #19/#14), foco no último salvo (RF-04), `a`/`f`/`q`; non-TTY →
  contrato do `check`. *(Vitest-only no v1 → débito M4; ver SUCCESS.)*
- [x] **M4** — polimento & release: `init`, `ui.theme`/`--no-color`, help/
  version por comando, **streaming incremental + watch p/ Jest (#21)**, árvore
  de suítes, diff/code-frame, pacote publicável (`src/index.ts`), README,
  decisões 🟡 resolvidas. *(contrato do `check` byte-inalterado.)*

## Feito

- [x] Docs base: `PRD.md` (v0.7), `CLAUDE.md`, `progress.md`, `SUCCESS_CRITERIA.md`.
- [x] `git init -b master` + remote `origin`. **4 commits** (init · M1 ·
  runner plugável · M2); **M3 ainda no working tree** — ver Pendências › Git.
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

- [x] **M4 — `test-reporter init`** (TDD-lite; decisão #20 = safe-by-default):
  - `config`: `defaultConfig()` + `serializeDefaultConfig()` — **fonte única**
    dos defaults (derivada do zod); o caminho "sem arquivo" do `loadConfig`
    passou a reusar `defaultConfig()` (DRY, byte-idêntico).
  - `commands/init` (`runInit`): escreve `test-reporter-config.json` com os
    defaults documentados; **recusa sobrescrever sem `--force`** (exit 1 +
    stderr acionável); stdout = confirmação (humano, fora do contrato do
    `check`). `cli` ganha `init` (`--cwd`/`--force`).
  - Testes: `test/init.test.ts` (2 unit fonte-única + 3 e2e). **65 verdes**.
- [x] **M4 — restante (TDD-lite, red→green por item; `check` byte-inalterado):**
  - **`--no-color`/`ui.theme`:** `theme.ts` `resolvePalette` puro (mono se
    `--no-color`/`NO_COLOR`; `auto/light/dark`) fiado por `App`/renderers/cli.
    `test/theme.test.ts` (4).
  - **help/version:** versão = fonte única (`createRequire('../package.json')`);
    guarda pré-parse "unknown command" → exit 2 (default `run` engolia typo).
    `test/cli.test.ts` (4 e2e).
  - **diff/code-frame:** `codeframe.ts` puro/best-effort (`test/codeframe`, 3);
    `RawTestError`/`Failure` ganham `expected?`/`actual?` (Vitest popula; Jest
    não — sem parse de texto); só `FailureView` renderiza. Renderers do
    contrato ignoram → e2e byte-exato segue verde.
  - **árvore de suítes:** store `buildSuiteTree` + view `suites` + `treeFocus`
    (`s`/`up`/`down`/`enter`); `SuitesView` no `App`. `tui-store` (+4).
  - **Jest streaming+watch (#21):** reporter `jest-stream-reporter.cjs` (bridge
    `globalThis`, mesmo processo) → streaming incremental; `JestAdapter.watch`
    via `fs.watch` debounced re-rodando o `run` 1-shot; `ignoredWatchPath`
    puro (`test/jest-watch`, 3). `runner-factory` perdeu o guard (Jest agora
    suporta watch; só seleção). **Verificado por smoke event-level** num dir
    real: `test:*` antes do `done` (streaming) + save → `rerun` → `done`
    com veredito flipado (watch).
  - **publicável:** `src/index.ts` (API headless); `build` copia o `.cjs`
    (`scripts/copy-assets.mjs`); shebang/`bin`/`exports` OK. **`npm pack`
    instalado em dir fora do repo** rodando `--version`/`init`/`check`
    (pass/fail/`--json`/exit codes) + `import` da API — verificado.
  - **README.md** (uso, contrato §7, exit codes, config, seção "For Claude/
    agents"); decisões 🟡 **#15 monorepo / #16 coverage → fora do v1**
    (PRD §10/§11). **82 verdes**, lint+build limpos.

## Próximo

**Nada pendente para o v1 — LANÇADO.** `eden-test-reporter-cli@1.0.0` no npm
(tag `latest`, https://www.npmjs.com/package/eden-test-reporter-cli). Pós-v1
possível: monorepo (#15), coverage (#16), declarações `.d.ts` p/ a API;
bumps de versão conforme novas mudanças.

**Pendente desta sessão:** **smoke manual da TUI em TTY real** (#24): salvar
arquivo → ver `🔒 locked: <rel>` no Summary + filtro na lista → consertar
falha e ver lock re-aplicar → ver countdown `5→1` no Summary → clicar
`[ all ]` para pular antes de zerar (e confirmar que dispara `triggerAll`).
Renderer blessed não é auto-testado; a store pura coberta cobre a lógica.

## Critérios de sucesso

Definição de pronto do app inteiro:
**[SUCCESS_CRITERIA.md](SUCCESS_CRITERIA.md)** — fonte única; aqui só o estado.
Status: **Globais + M1–M4 ✓ — v1 FINALIZADO + UX v1.1 (#22) + #23 + #24 ✓.**
`npm test` = **107 verdes**; pacote instala e roda fora do repo (verificado).

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
  via vitest) — sem fix não-breaking; reavaliar pós-v1 / no bump do Vitest.
- **API sem `.d.ts`:** `declaration:false` (consistente; produto principal =
  CLI). `exports`/`main` resolvem em runtime; tipos p/ consumidores = pós-v1.
- `line/col` da falha = **local da definição do teste** (`includeTaskLocation`/
  `testLocationInResults`), não o frame da assertiva — determinístico e
  suficiente p/ o contrato; revisitar se precisar do ponto da assertiva.
- **Débitos M2/M3 — TODOS resolvidos no M4:** streaming incremental no Jest
  (#21), `watch` p/ Jest (#21), árvore de suítes (`s`), diff/code-frame,
  `--no-color` explícita. Os loops watch (Vitest+Ink; Jest+`fs.watch`) e o
  streaming incremental do Jest **não são unit-testáveis** (reentrância) →
  store pura testada + e2e de paridade + **smoke event-level** num dir real.
- **Jest watch = suíte inteira** (não o grafo de relacionados como o Vitest):
  tradeoff consciente do #21 (Jest não tem watcher nativo estável); confiável
  e determinístico. Refinar p/ "só arquivos afetados" = possível pós-v1.
- **Nota de teste (macOS, custou investigação):** **não** smoke-testar
  `watch` com o alvo sob `os.tmpdir()` — em macOS é `/var/folders/…` →
  symlink p/ `/private/var/…`; o chokidar do Vite detecta a mudança num
  path e invalida o grafo no path resolvido ⇒ rerun roda **código stale**
  (falso "veredito não atualiza"). **Não é bug do produto** (projetos reais
  não vivem em tmpdir symlinkado); usar `realpath`/dir não-symlinkada nos
  testes manuais de watch. Ver memória `vitest-watch-tmpdir-symlink`.
  *(Jest watch usa `fs.watch` + re-run completo, sem grafo Vite persistente
  → não sofre o mesmo trap; ainda assim o smoke do #21 usou `realpathSync`.)*

## Decisões — todas resolvidas (ver PRD §10)

- ✅ RF-03 → **#18** (last-failed-wins). ✅ RF-04 → **#19** (Vitest grafo) /
  **#21** (Jest `fs.watch`). ✅ `init` → **#20** (safe-by-default).
- ✅ **#15 monorepo / #16 coverage → FORA do v1** (decidido/registrado M4,
  PRD §10/§11). Nenhuma decisão 🟡 pendente.

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
- **2026-05-18 (M4 — `init`):** decisão **#20** (init safe-by-default: recusa
  clobber sem `--force`). TDD-lite red→green: `test/init.test.ts` (5 testes —
  RED confirmado, 5/5). `config` ganhou `defaultConfig`/`serializeDefaultConfig`
  como **fonte única** dos defaults (ENOENT do `loadConfig` refatorado p/
  reusá-la, DRY); `commands/init`+`cli`. **65 verdes**, lint limpo, contrato
  do `check` intacto (regressão da suíte cheia OK). PRD v1.1 / CLAUDE /
  SUCCESS atualizados. Próximo M4: `--no-color`/`ui.theme`.
- **2026-05-18 (M4 — restante, fechado num push):** a pedido do usuário, todos
  os itens M4 restantes em sequência, TDD-lite red→green por item, `npm test`
  cheio verde nos boundaries de risco de contrato. Entregue: `theme.ts`
  (`--no-color`/`ui.theme`, 4 testes); help/version por comando + versão
  fonte-única + guarda "unknown command" (4 e2e); `codeframe.ts` + `expected/
  actual` no modelo → diff/code-frame **só TUI** (3 testes; renderers do
  contrato ignoram → e2e byte-exato verde); árvore de suítes na store pura
  (`buildSuiteTree`/`suites`/`treeFocus`, +4); **decisão #21** — streaming
  incremental do Jest via reporter `.cjs` (bridge `globalThis`) + `JestAdapter.
  watch` por `fs.watch` reusando o `run` 1-shot (`ignoredWatchPath` puro, 3;
  `runner-factory` perdeu o guard); `src/index.ts` (API) + `copy-assets.mjs` no
  build → **`npm pack` instalado e rodando fora do repo** (verificado:
  `--version`/`init`/`check` pass/fail/`--json`/exit + `import` da API);
  `README.md`; decisões 🟡 **#15/#16 → fora do v1**. Jest streaming+watch
  (não unit-testável) **verificado por smoke event-level** num dir real
  (`realpathSync`): `test:*` antes do `done` + save→`rerun`→`done` flipado.
  **82 verdes**, lint+build limpos. PRD v1.2 / CLAUDE / SUCCESS atualizados.
  **v1 FINALIZADO** (release npm só quando o usuário pedir).
- **2026-05-19 (UX v1.1 — lista rolável + abrir no editor, #22):** a pedido
  do usuário; mecanismo escolhido por ele = **teclado + editor** (não clique
  de mouse). TDD-lite red→green: store (`tui-store` +6: `buildTestList`,
  view `tests`, `l`/`↑↓`/`PgUp`/`PgDn`/scroll `windowAround`, `open`/`enter`
  → `openRequest` seq) + `editor.test.ts` (+4, `editorCommand` puro). Modelo:
  `RawTest.line/col` (toda execução; Vitest `task.location`, Jest
  `a.location`) **TUI-only**. Render: `TestsView` (linhas espaçadas/maiores,
  `arquivo:linha:col` clicável no VS Code/iTerm); `wireEditor` edge DRY
  (spawn best-effort) em `run`+`watch`. **92 verdes**, lint+build limpos,
  dist compila (`editor.js`+`.cjs`). **Contrato do `check` byte-inalterado**
  (e2e). *Transparência:* 3 e2e quebraram por a fixture
  `test/fixtures/mixed/src/feature.test.ts` ter ficado `test.skip("is
  broken")` da brincadeira anterior do `watch` — **revertido** p/
  `test("is broken")` (estado correto asserido pela suíte), não regressão do
  código novo. PRD v1.3 (decisão #22) / CLAUDE / SUCCESS / memória atualizados.
- **2026-05-19 (refino #22 — feedback + caminho absoluto):** usuário relatou
  "Enter não abre". Diagnóstico (probe event-level): `RawTest.file` já era
  **absoluto** e o `code -g` recebia o caminho certo — o que confundia era
  (a) **sem feedback** do spawn e (b) o `notice` exibia caminho **relativo ao
  `--cwd`** (`src/…`, parecia faltar `playground/`). Fix TDD-lite: `notice` na
  store (input `{type:"notice"}`, +1 teste) — edge reporta `opening <abs>` →
  `opened in <cmd>`/erro acionável; `openTarget`→`absFile` garante **caminho
  absoluto** ao editor; `notice` mostra o caminho real. **93 verdes**,
  lint+build OK. Causa de uso provável: faltou `l` (Enter na Overview é
  no-op; playground com `auth`/`cart` skipados = 0 falhas → fica na Overview).
- **2026-05-19 (refino #22 — suporte a `.env`):** usuário pôs `EDITOR` no
  `.env`; Node não carrega `.env` sozinho. TDD-lite: `parseDotenv` (parser
  mínimo próprio, **sem dep nova**) + `resolveEditorEnv` (precedência **env
  real > `.env` > default `code`**) puros/testados; `wireEditor` lê `.env` do
  `--cwd` e do dir de lançamento (best-effort, por press → pega edição ao
  vivo). VS Code forks (`cursor`/`windsurf`/`codium`/`vscodium`) tratados
  como VS Code (`-g arq:linha:col`). Probe end-to-end confirmou
  `.env EDITOR=cursor` → `cursor -g <abs>:6:3`. **100 verdes**, lint+build
  OK. PRD #22 / CLAUDE / SUCCESS / progress / memória reconciliados (contagem
  → 100).
- **2026-05-19 (refino #22 — editor no config, escolha do usuário):** usuário
  pediu para a escolha do editor **pertencer ao `test-reporter-config.json`**,
  não ao `.env`/env. Schema zod ganha `ui.editor` (string, default `code`) —
  fonte única (init/`serializeDefaultConfig` herdam). `editorCommand` agora
  recebe a string do config (não mais `env`); **removidos** `parseDotenv`,
  `resolveEditorEnv`, `dotenvEditorEnv` e a leitura de `.env`; `wireEditor`
  recebe `config.ui.editor`; `notice` de erro aponta "set ui.editor". `.env`
  do projeto **apagado**; criado `test-reporter-config.json` com os defaults.
  `editor.test.ts` enxuto (só `editorCommand`, string); defaults literais
  (config/init) ganham `editor:"code"`. Docs (PRD §8/#22, README, CLAUDE,
  SUCCESS) reconciliados. **94 verdes** (−6 = testes `.env`/env removidos),
  lint+build limpos.
- **2026-05-19 (release npm v1.0.0):** usuário pediu publicar no npm
  (ignorando o playground — já fora por `files:["dist"]`). Pré-voo: `build`
  OK, **94 verdes**, `npm pack --dry-run` = 51 arquivos (só `dist/`+README+
  `package.json`, 35.5 kB; playground confirmado fora), nome livre no
  registry. Escolhas do usuário: **registry npm público** + **bump p/
  1.0.0** (`npm version major` → package.json 1.0.0 + commit + tag git
  `v1.0.0`; `dist/` é gitignored, árvore limpa). Bloqueio: token do CLI
  expirado (`whoami` 401; npm mascara como `E404` no `PUT` do publish) — o
  publish não chegou a pedir OTP. Usuário re-autenticou e publicou ele
  mesmo (OTP interativo no terminal dele). Verificado ao vivo: `npm view`
  → `version=1.0.0`, `dist-tags.latest=1.0.0`, 51 arquivos / 139292 B
  (bate exato com o dry-run). Pacote:
  https://www.npmjs.com/package/eden-test-reporter-cli (`npm i
  eden-test-reporter-cli`). progress/SUCCESS atualizados (CLAUDE/PRD sem
  mudança — release não é arquitetura nem decisão de produto).
- **2026-05-25 (#24 — fix lock filter: `relatedFiles` + fallthrough):**
  smoke do user revelou bug: salvar um arquivo source mantinha a lista
  vazia, pq `lockedFile === trigger` (source path) nunca batia com
  `t.file` (arquivos `.test.*`). Fix: `RunEvent.rerun` ganha
  `relatedFiles?: string[]`; `VitestAdapter.onWatcherRerun` passa o
  próprio `_files` (caminhos `.test.*` do grafo do Vitest);
  `JestAdapter.cycle` passa `[trigger]` (Jest re-roda tudo, então só
  ajuda quando trigger é teste). Store: `lockedFile` → `lockedFiles[]`;
  novo seletor `lockAppliesNow(s)` faz **fallthrough p/ mostrar tudo
  quando o filtro esvaziaria a lista** (raw `lockedFiles` permanece p/
  o indicador `🔒 locked: …` no Summary). `buildVisibleList` filtra por
  `lockAppliesNow`. Label da lista vira `Passed · 3 files (N)` em
  multi-file. `wireCountdown` agora checa `lockedFiles?.length > 0`.
  +3 testes (`relatedFiles` populando, fallback p/ `[trigger]`,
  fallthrough). **107 verdes**, lint+build limpos. Contrato do `check`
  **byte-inalterado** (e2e watch/run/check verdes).
- **2026-05-25 (#24 — watch lock-on-save + countdown):** pedido do usuário
  (4 itens): salvar trava lista no arquivo · ao ficar verde, countdown 5s
  re-roda tudo · save com tudo verde também dispara o ciclo · `[ all ]` pula.
  Perguntas alinhadas via AskUserQuestion (lock suspende em falhas; countdown
  no Summary 3ª linha; save novo cancela+re-trava; indicador `🔒 locked: …`
  + label `Passed · <rel>`). TDD-lite red→green: 6 testes novos em
  `tui-store.test.ts` (rerun setta/limpa `lockedFile`, filtro `buildVisibleList`,
  suspensão em falhas, `countdownStart`/`countdownClear`, `rerun`/`a`/`f`
  zeram countdown). Store ganha `lockedFile`/`countdown` + inputs
  `countdownStart`/`countdownClear` + seletor exportado `effectiveLockedFile`;
  `buildVisibleList` filtra por ele; `rerun` setta lock + zera countdown;
  `key:"a"/"f"` zeram countdown (mesmo path do auto-fire). Renderer: 3ª linha
  do Summary dispatcha countdown → lock → trigger → idle; label da lista vira
  `Passed · <rel> (N)` quando lock efetivo; spinTimer tica também durante
  countdown (re-render do `N`). Edge `wireCountdown` (só `renderWatchTui`):
  subscribe inicia ao verde, interval 100ms dispara `key:"a"` ao expirar
  (mesmo path do clique). **104 verdes**, lint+build limpos. Contrato do
  `check` **byte-inalterado** (lock/countdown são TUI-only; renderers do
  contrato ignoram). PRD v1.4 (#24) / CLAUDE / SUCCESS / progress.md
  atualizados. **Pendente:** smoke manual da TUI em TTY real.
- **2026-05-21 (#23 — lista de testes mouse-first; reverte o teclado da #22):**
  usuário pediu o **oposto** da #22 — sem o modo `l`, sem navegação/seleção de
  teste por teclado; **100% mouse**. Decisões confirmadas (via perguntas):
  (1) **clique abre no editor** (qualquer teste); (2) **stream ao rodar, lista
  ao terminar**; (3) **remover** todo o teclado da lista (sem fallback de
  setas). TDD-lite: reescrita do bloco `tui-store` (`scroll`/`openAt`/
  `clampOffset` + suíte verde→overview; removidos `l`/setas/PgUp-PgDn/
  `listFocus`) + teste de `heading` no tema. Store: `View` perde `tests`;
  inputs `scroll`/`openAt`; `clampOffset` puro; `requestOpenTarget` DRY;
  `enter` de suíte verde → overview rolado ao header. Renderer: `App.tsx`
  roteia **Overview (stream)** ao rodar → **TestList (mouse)** ao terminar;
  `useMouse`→`scroll`/`openAt`/hover; `LIST_TOP_ROW` **fixo** mapeia
  clique→linha; arquivo+suíte em **negrito branco** (palette `heading`);
  `mouse.ts` = roda dispara 1× (delta ±3). **96 verdes**, lint+build limpos.
  **Contrato do `check` byte-inalterado** (e2e). PRD #23 / CLAUDE / SUCCESS /
  progress reconciliados. **Pendente:** smoke manual da TUI em TTY real (rolar,
  clicar p/ abrir, hover, negrito-branco, mapa clique→linha) — render Ink não
  é auto-testado.
