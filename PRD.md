# PRD — test-reporter-cli

> Documento vivo (v1.3). 🟢 decidido · 🟡 em aberto · 🔵 proposta minha sujeita a validação.
> **M1–M4 verdes + UX v1.1 (100 testes); pacote publicável.** Runner plugável
> (Vitest/Jest, ambos com watch); TUI `run`/`watch` ao vivo (tema, árvore de
> suítes, **lista de testes rolável + abrir no editor**, diff/code-frame);
> `check` headless determinístico; `init`.

## 1. Visão geral

`test-reporter run` é **o comando principal e a cara do produto**: uma **TUI
caprichada e em tempo real** onde o dev curte ver os testes aparecendo e
"passando" ao vivo (auto-foco na suíte que falha, watch). Em paralelo,
`test-reporter check` é um **comando headless** com **saída enxuta e estável**
que serve o **Claude como ferramenta** num loop agêntico (rodar → ler veredito →
corrigir). O Claude não usa a TUI; humanos podem usar `check` para testar.

## 2. Problema

A saída padrão dos test runners é verbosa, colorida e instável — desagradável
para o dev acompanhar e inviável para um agente parsear de forma confiável.
Falta (a) uma experiência ao vivo agradável e (b) um veredito conciso,
determinístico e acionável.

## 3. Usuários

- **Dev (UX flagship):** usa `test-reporter run` — TUI bonita, ao vivo.
- **Claude (consumo como ferramenta):** usa `test-reporter check` (non-TTY),
  saída enxuta estável. Consumidor primário do *contrato* de saída.

## 4. Requisitos funcionais

| ID | Requisito | Origem | M | Observações |
|----|-----------|--------|---|-------------|
| RF-01 | Rodar os testes e exibir o(s) erro(s) no CLI | nec. 1 | M1/M2 | headless: causa+local; TUI: diff + stack + code frame |
| RF-02 | Exibir quantidade de testes que passaram (e total / falhas) | nec. 2 | M1/M2 | Contadores ao vivo na TUI |
| RF-03 | Trocar a tela automaticamente para a suíte que falhar | nec. 3 | M2 | Regra p/ múltiplas falhas 🟡 (decidir em M2) |
| RF-04 | Modo **Watch**: focar a suíte do último arquivo salvo, ao vivo | nec. 4 | M3 ✔ | 🟢 watcher nativo do Vitest (relacionados) + foco no salvo — decisão #19 |
| RF-05 | Modo **Standard**: mostrar todos os testes, mesmo sem falha | nec. 4 | M2 | Resumo navegável |
| RF-06 | Saída enxuta estável no stdout (substitui gravar arquivo) | nec. 5 (rev.) | M1 | 🟢 lista + causa + local; contrato na seção 7 |
| RF-07 | `test-reporter-config.json` para configurar o reporter | nec. 5 | M1 | Schema na seção 8 |
| RF-08 | `test-reporter check`: roda e aponta, agregado, todos os erros do app | nec. 6 | M1 | 🟢 comando dedicado, separado do `run` |
| RF-09 | `run` (TTY): render em **tempo real, estética caprichada** (deleite do dev) | msg usuário | M2 | UX flagship; prioridade alta |

## 5. Requisitos não-funcionais (contrato p/ ferramenta) 🔵

- **Sem ANSI/cor em non-TTY**; cor/animação só na TUI (TTY).
- **Nunca saída vazia**: sucesso e falha sempre produzem um veredito explícito.
- **Determinístico**: mesmo resultado ⇒ mesma saída byte-a-byte. Falhas
  ordenadas por (arquivo, nome). Caminhos **relativos POSIX** à raiz.
- **stdout limpo**: só o veredito no stdout; logs/diagnóstico no stderr.
- **Exit code**: `0` tudo passou · `1` algum teste falhou · `>1` erro de
  runner/config. O agente decide sem parsear.
- **Contrato versionado** (`schemaVersion` no `--json`).
- Resultados via **API estruturada do runner** (Vitest/Jest), **nunca** parsing
  de stdout do relatório humano.
- Distribuição npm (`bin`), shebang `#!/usr/bin/env node`, build TS→JS.

## 6. Arquitetura

- **Linguagem:** 🟢 TypeScript.  **Módulos:** 🟢 **ESM**.  **Node:** 🟢 **≥ 20
  LTS**. *(propostas 🔵 confirmadas — implementadas e publicáveis.)*
- **Runner:** 🟢 **plugável** — classe abstrata `TestRunnerAdapter` + factory
  escolhida pelo campo `runner` do config. **Adapter Vitest** (`startVitest` +
  reporter silencioso, streaming p/ store/TUI) **e adapter Jest** (`@jest/core`
  `runCLI`, import *lazy* / peer opcional) no v1. O adapter só produz `RawRun`;
  normalize/renderers/exit são **runner-agnósticos** (novo runner = novo adapter).
- **UI:** 🟢 Ink (tema `auto/light/dark` + `--no-color`/`NO_COLOR`; árvore de
  suítes navegável; detalhe da falha com diff + code-frame — TUI-only, contrato
  do `check` intacto).  **Watch:** 🟢 **Vitest = watcher nativo** (decisão #19,
  testes relacionados pelo grafo); **Jest = `fs.watch` + re-run da suíte
  inteira** reusando o `run` 1-shot (decisão #21). A TUI foca a suíte do
  último salvo (RF-04) em ambos.
- **Args:** 🟢 `commander`.  **Config:** 🟢 `zod`. **Streaming:** Vitest ao
  vivo via reporter; **Jest incremental** via reporter `.cjs` (bridge
  in-process por `globalThis`; decisão #21) — `done` final sempre do resultado
  agregado autoritativo, contrato inalterado.
- **Camadas:** núcleo (adapter do runner + store) compartilhado; *renderers* plugáveis:
  `tui` (Ink, ao vivo) e `summary` (texto estável / `--json`).

## 7. Contrato da saída — RF-06/RF-08 (`check`) 🟢

**Texto (padrão headless / `--summary`).** Status line **sempre** presente,
com token explícito `PASS`/`FAIL`:

```
<✓ PASS | ✗ FAIL> · <P> passed · <F> failed · <S> skipped · <dur>s
                              (em falha: linha em branco + 1 bloco por falha)
FAIL <arquivo> › <nome completo do teste>
  at <arquivo>:<linha>[:<col>]
  <TipoErro>: <primeira linha da mensagem>
```

- **Sucesso = afirmação explícita, nunca vazio:** exatamente a status line,
  ex. `✓ PASS · 146 passed · 0 failed · 1 skipped · 4.2s`. Exit `0`.
- **Falha:** status line `✗ FAIL · …` + 1 bloco por falha (arquivo + local +
  causa) e **nada mais no stdout** — sem logs, sem ruído. Exit `1`.
- Ordenado por (arquivo, nome). Caminhos relativos POSIX. Sem cor (non-TTY).
- **Runner-agnóstico:** mesmo contrato byte-a-byte (módulo duração) seja Vitest
  ou Jest a executar — o runner é detalhe de implementação do adapter.
- Acima de `summary.maxFailures`: imprime N e `… +<k> more (use --json)`.

**`test-reporter check --json`:**

```json
{ "schemaVersion": 1, "status": "fail", "ok": false, "passed": 142,
  "failed": 3, "skipped": 1, "total": 146, "durationMs": 4234,
  "failures": [ { "file": "src/auth/login.test.ts", "line": 42, "col": 7,
    "suite": "auth/login", "test": "rejects expired token",
    "errorType": "AssertionError", "error": "expected 401 to be 200" } ] }
```

Em sucesso: `"status": "pass"`, `"ok": true`, `"failed": 0`, `"failures": []`.

## 8. `test-reporter-config.json` — schema proposto 🔵

```json
{
  "runner": "vitest",
  "include": ["src/**/*.test.ts"],
  "defaultMode": "standard",
  "watch": { "followLastSaved": true },
  "summary": { "detail": "cause", "maxFailures": 50 },
  "ui": { "autoFocusFailures": true, "theme": "auto", "editor": "code" }
}
```

(`runner`: `"vitest"` | `"jest"`, default `"vitest"`. Novos runners = novo
adapter, sem mudar schema/contrato. `ui.editor`: comando do editor para
"abrir teste" na TUI, default `"code"` — **única fonte da escolha do editor**,
sem `.env`/`$EDITOR`/`$VISUAL`.)

## 9. Comandos / UX 🟢

- **`test-reporter check`** — entrypoint do agente/CI: headless, varre tudo 1x,
  veredito explícito (seção 7), `--json`, exit code (seção 5). **(M1)**
- **`test-reporter run`** — comando principal (default). TTY → TUI ao vivo
  (RF-09): testes streamando, contadores ao vivo, **auto-foco na falha no
  instante em que acontece** (RF-03, decisão #18); `n`/`p` cicla falhas
  (ordem arquivo→nome), `esc` volta ao overview, `q` sai. Non-TTY / CI /
  `--summary` / `--json` → **cai exatamente no contrato do `check`**. **(M2 ✔)**
- **`test-reporter watch`** — modo watch (RF-04), TUI ao vivo. **Vitest:**
  watcher nativo (testes relacionados pelo grafo). **Jest:** `fs.watch` +
  re-run da suíte (decisão #21). Cada ciclo zera os contadores e a UI foca a
  suíte do **último arquivo salvo** (`↻ saved: …`); `a` re-roda tudo, `f` só
  as falhas, `n`/`p`/`esc`/`s` como no `run`, `q`/Ctrl-C encerra limpo.
  Non-TTY / CI / `--summary` / `--json` → 1 execução = contrato do `check`.
  **(M3 ✔ · Jest watch M4 ✔)**
- **Teclas/UX comuns (M4 + UX v1.1 + #23):** `s` = **árvore de suítes** navegável
  por teclado (`↑`/`↓`, `enter` abre suíte com falha). Ao **terminar** a
  execução, a **lista de testes rolável é a tela padrão** e é **100% mouse**:
  roda **rola**, **clique abre o teste no editor** em arquivo:linha, hover
  sublinha a linha; arquivo+suíte em **negrito branco**; **sem navegação por
  teclado na lista** (decisão #23, que reverte o teclado da #22). O detalhe da
  falha mostra **diff + code-frame** e `o` abre no editor; `--no-color`/
  `NO_COLOR` e `ui.theme` (`auto/light/dark`) — tudo **TUI-only**, o contrato
  do `check` segue ANSI-free e byte-idêntico.
- **`test-reporter init`** — gera `test-reporter-config.json` com os defaults
  documentados (§8), schema-válido. **Safe-by-default**: recusa sobrescrever
  um arquivo existente sem `--force` (exit 1 + stderr acionável); stdout =
  confirmação para humano (não é o contrato do `check`). **(M4 ✔)**
- Flags globais: `--config`, `--filter`, `--mode standard|watch`, `--json`.

## 10. Decisões

**Resolvidas 🟢**

1. Vitest *(revisto em #17: runner plugável)*. 2. TypeScript. 3. Ink. 4. RF-06 = comando, não arquivo.
5. Consumidor primário do contrato: Claude. 6. Saída base: lista compacta.
7. Disparo headless: non-TTY + `--summary`. 8. Detalhe: lista + causa + local.
9. RF-08: comando dedicado separado do `run`. 10. `run` = principal, TUI ao vivo.
11. Nome do comando RF-08: `check`.
12. **`check` nunca é vazio: sucesso = `✓ PASS …` explícito; falha = `✗ FAIL …`
    + só os blocos de erro, nada mais no stdout.**
17. **Runner plugável — revisa a decisão #1 (2026-05-18).** O runner deixa de
    ser fixo em Vitest: vira `TestRunnerAdapter` (classe abstrata) + factory
    escolhida pelo campo `runner` do `test-reporter-config.json`. Adapters
    **Vitest** e **Jest** entregues no v1; `check` produz o **mesmo contrato
    byte-a-byte (módulo duração)** independente do runner. *Motivo:* rodar
    projetos Jest (ou outro runner futuro) sem tocar núcleo/normalize/contrato —
    **novo runner = só um novo adapter**. *Implicações:* Jest é **peer
    opcional** (import *lazy*; `runner:"jest"` sem Jest instalado → `RunnerError`,
    exit > 1, sem falso PASS); invariante "sem parsing de stdout" generalizado
    para "via API estruturada do runner".
18. **RF-03 — regra de múltiplas falhas (2026-05-18, escolha do usuário).**
    A TUI usa **foco na falha no instante em que ela acontece**
    (*last-failed-wins*): a próxima falha rouba o foco. `n`/`p` cicla as
    falhas na ordem determinística (arquivo→nome, = ordem do `check`); `esc`
    volta ao overview ao vivo; `q` sai. *Motivo:* máximo "ao vivo"/drama p/ o
    dev. *Implicação:* lógica de seleção isolada em store **pura** (sem render),
    coberta por testes; o renderer Ink só desenha o estado.
19. **RF-04 — estratégia de re-execução do watch (2026-05-18, escolha do
    usuário) — resolve a decisão #14.** O `watch` usa o **watcher nativo do
    Vitest**: ao salvar, re-roda os **testes relacionados** pelo grafo de
    módulos (não só o arquivo, não a suíte inteira); a UI foca a suíte do
    **último arquivo salvo** (RF-04) e o ciclo zera os contadores; a decisão
    #18 (last-failed-wins) re-aplica a cada ciclo. *Motivo:* rápido E pega
    quebra cross-file; é o watcher que o PRD §6 já propunha e o que o dev de
    Vitest já espera — "usar a API do runner, não reinventar". *Implicações:*
    watch é **Vitest-only no v1** (Jest precisa de streaming incremental →
    débito M4, decisão #17); seam `TestRunnerAdapter.watch` → `WatchHandle`
    (`triggerAll`/`triggerFailed`/`close`); lógica de ciclo isolada na store
    **pura** (testada); o loop watch+Ink é verificado por pty-smoke.
20. **`init` safe-by-default (2026-05-18, M4).** `test-reporter init` **não
    sobrescreve** um `test-reporter-config.json` existente: sem `--force` →
    recusa com exit 1 + stderr acionável (config do usuário nunca é destruída
    silenciosamente); `--force` regrava os defaults. *Motivo:* convenção segura
    de CLI (não-destrutiva por padrão); o conteúdo escrito é
    `serializeDefaultConfig()` — **fonte única** derivada do zod, então o
    arquivo gerado **sempre passa no schema** e nunca diverge do caminho "sem
    config" do `loadConfig`. *Implicação:* `init` é humano (stdout =
    confirmação), fora do contrato determinístico do `check`.
21. **Watch + streaming do Jest (2026-05-18, M4) — fecha o débito da #17.**
    (a) **Streaming incremental do Jest:** reporter CommonJS
    (`jest-stream-reporter.cjs`) passado ao `runCLI` por caminho absoluto;
    como roda no mesmo processo (`runInBand`), faz bridge de cada test-case
    via um slot em `globalThis` que o `JestAdapter` seta antes e limpa depois.
    O `done` final continua vindo do **resultado agregado autoritativo** →
    contrato do `check` byte-inalterado (sink ausente em `check` = caminho
    antigo intacto; reconciliação por `pickUnemitted`). (b) **Jest watch:**
    Jest não tem API de watcher nativa estável como o Vitest, então dirigimos
    nós: `fs.watch` (recursivo; *fallback* não-recursivo no Linux) debounced
    re-roda **a suíte inteira** via o `run` 1-shot (DRY — mesmo streaming,
    mesmo veredito). Mais grosso que o grafo do Vitest, porém confiável e
    determinístico; runs não se sobrepõem; `close()` sem vazamento. *Motivo:*
    "habilita watch p/ Jest" sem acoplar internals frágeis do Jest.
    *Implicação:* watch deixa de ser Vitest-only; o loop não é unit-testável
    (reentrância) → verificado por **smoke event-level** num dir real
    (streaming antes do `done` + flip de veredito ao salvar).
22. **Lista de testes rolável + abrir no editor (2026-05-19, UX v1.1).** Nova
    view `tests`: lista **plana, rolável e navegável por teclado** de todos os
    testes (ordem determinística arquivo→nome, igual ao `check`), linhas mais
    "encorpadas"/espaçadas, com `arquivo:linha:col` visível (que VS Code/iTerm
    já tornam clicável de graça). Selecionar + `enter`/`o` **abre o teste no
    editor** na linha certa. *Decisão de mecanismo (escolha do usuário):*
    teclado + abrir via o editor de `ui.editor` no config (fallback `code -g`),
    **não** captura de clique de mouse do terminal — confiável em qualquer terminal e
    fiel ao design do Ink (mouse tracking = frágil, fora de escopo). *Como:*
    `RawTest` ganha `line?`/`col?` (toda execução, via `includeTaskLocation`/
    `testLocationInResults`) — **TUI-only**, os renderers do contrato ignoram
    (e2e byte-exato segue verde). Scroll/seleção/`openRequest` na **store
    pura** (seq monotônica, mesma disciplina do `command`/`exited`; testado);
    `editorCommand(editor)` **puro** (testado); o spawn é o edge fino
    best-effort. *Feedback (refino 2026-05-19):* o edge **reporta de volta**
    via `notice` na store (`» opening <abs>` → `» opened in <cmd>` ou erro
    acionável "set ui.editor") — nada de spawn silencioso. O caminho entregue
    ao editor é **sempre absoluto** (`absFile` = `resolve`; o editor roda
    detached sem cwd controlado) e o `notice` mostra o **caminho real
    absoluto** (display relativo ao `--cwd` confundia: parecia faltar a pasta).
    *Editor no config (2026-05-19, escolha do usuário):* a escolha do editor
    **pertence ao `test-reporter-config.json`** — campo `ui.editor` (string,
    default `code`; `cursor`/`windsurf`/`codium` tratados como VS Code →
    `-g arquivo:linha:col`). **Removido** o suporte a `.env`/`$EDITOR`/
    `$VISUAL` (e os puros `parseDotenv`/`resolveEditorEnv`): config faz mais
    sentido que env espalhado, é a fonte única já validada por zod e
    versionada. `editorCommand` agora recebe a string do config; `wireEditor`
    recebe `config.ui.editor`. Sem `.env` no projeto. Testado; sem dep nova.
23. **Lista mouse-first — reverte o mecanismo da #22 (2026-05-21, escolha do
    usuário).** O usuário pediu o **oposto** da #22: a lista de testes não fica
    mais atrás de um toggle (`l`) nem é navegada por teclado. Agora, ao
    **terminar** a execução, a **lista rolável agrupada é a tela padrão** e a
    interação com os testes é **100% mouse**: a **roda rola** (`scroll` →
    `clampOffset`), o **clique abre o teste no editor** em arquivo:linha
    (`openAt`), o hover **sublinha** a linha; **arquivo + suíte** ficam em
    **negrito branco** (palette `heading`, só dark/auto; light/`--no-color` caem
    p/ negrito sem cor) p/ localização rápida. *Removidos* da lista: `listFocus`,
    a tecla `l`, `↑`/`↓`/`PgUp`/`PgDn` e `enter`/`o` (abrir = clique).
    *Mantidos por teclado:* `q`, `s`, `esc`, `n`/`p`, `a`/`f` (watch) e o `o` no
    detalhe da falha — a #18 (last-failed-wins) segue intacta. *Como:* store
    pura ganha inputs `scroll`/`openAt` + `clampOffset`; `App.tsx` roteia
    **Overview (stream) ao rodar** → **TestList (mouse) ao terminar**; `useMouse`
    (SGR) → `scroll`/`openAt`/hover; `LIST_TOP_ROW` **fixo** mapeia clique→linha
    (cabeçalho de altura fixa). *Por que a #22 dizia "sem mouse":* na época o
    mouse tracking foi julgado frágil/fora do Ink — a infra SGR já existe e
    funciona no terminal do usuário, então a restrição caiu. *Risco aceito:*
    terminal sem suporte a mouse fica sem rolagem (sem fallback de teclado, a
    pedido). Contrato do `check` **byte-inalterado** (tudo TUI-only); **96
    testes verdes**.

**Propostas — confirmadas 🟢 (implementadas)**

- ESM + Node ≥ 20 LTS; `commander` p/ args; `zod` p/ config. *(pacote
  publicável: `npm pack` instala e roda fora do repo — verificado.)*

**Em aberto — resolvidas 🟢**

13. ~~RF-03: regra de múltiplas falhas~~ → **resolvida em #18**.
14. ~~RF-04: watch~~ → **resolvida em #19/#21** (Vitest grafo nativo; Jest
    `fs.watch` + re-run da suíte).
15. **Monorepo / múltiplos projetos → FORA do v1** (decidido M4). Um projeto/
    `cwd` por execução; multi-projeto = pós-v1 (sem mudança de núcleo/contrato
    prevista — provável orquestração externa).
16. **Coverage → FORA do v1** (decidido M4). O produto é veredito + UX ao vivo;
    coverage é responsabilidade do runner. Reavaliar pós-v1 se houver demanda.

## 11. Fora de escopo (v1) 🟢

Coverage (#16), monorepo multi-projeto (#15), dashboard web, histórico entre
rodadas — **decididos fora do v1** (ver §10 #15/#16). Sem mudança de
núcleo/contrato prevista para nenhum deles.

## 12. Roadmap

- **M1 (núcleo p/ o agente) — implementado e verde:** `test-reporter check` +
  contrato (seção 7) + config (RF-07) + RF-01/02 + **runner plugável (adapters
  Vitest e Jest)**. Testável pelo Claude.
- **M2 (UX flagship) — implementado e verde:** `test-reporter run` TUI ao vivo
  (RF-09/03/05, decisão #18); non-TTY → contrato do `check` (paridade testada).
- **M3 (watch) — implementado e verde:** `test-reporter watch` TUI ao vivo
  com watcher **nativo do Vitest** (decisão #19/#14: testes relacionados +
  foco no último salvo, RF-04); non-TTY → contrato do `check` (paridade
  testada).
- **M4 (polimento & release) — implementado e verde (82 testes):** `init`
  (safe-by-default, #20); `ui.theme` + `--no-color`/`NO_COLOR`; `--help`/
  `--version` por comando (+ guarda de comando desconhecido; versão = fonte
  única do `package.json`); **streaming incremental no Jest + Jest watch**
  (#21); árvore de suítes navegável (`s`); diff/code-frame no detalhe da
  falha; **pacote publicável** (`src/index.ts` como API; `bin`/shebang/
  `exports`/`files`; `npm pack` instala e roda fora do repo — verificado);
  README (incl. como o Claude chama `check`); decisões 🟡 #15/#16 resolvidas
  (fora do v1). Contrato do `check` **byte-inalterado** em todo o M4.
- **UX v1.1 — implementado e verde:** lista de testes rolável + abrir no editor
  (decisão #22). `RawTest.line/col` TUI-only; store pura + `editorCommand` puro
  testados; spawn = edge best-effort. Contrato do `check` **byte-inalterado**.
- **#23 — lista mouse-first (96 testes):** a #22 foi **revertida** do "teclado +
  sem mouse" para **100% mouse**: a lista rolável vira a **tela padrão** ao
  terminar (sem toggle `l`), roda **rola** (`scroll`), **clique abre no editor**
  (`openAt`), arquivo+suíte em **negrito branco** (palette `heading`); removidos
  `listFocus`/`l`/setas/PgUp-PgDn. Store pura (`scroll`/`openAt`/`clampOffset`)
  testada; contrato do `check` **byte-inalterado** (e2e verde).
