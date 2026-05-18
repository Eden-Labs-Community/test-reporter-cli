# PRD — test-reporter-cli

> Documento vivo (v1.0). 🟢 decidido · 🟡 em aberto · 🔵 proposta minha sujeita a validação.
> **M1 + M2 + M3 implementados e verdes; runner plugável (Vitest/Jest); TUI `run` ao vivo + `watch` (watcher nativo do Vitest, foco no arquivo salvo).**

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

- **Linguagem:** 🟢 TypeScript.  **Módulos:** 🔵 **ESM** (Vitest 3 e Ink são
  ESM-first).  **Node:** 🔵 **≥ 20 LTS**.
- **Runner:** 🟢 **plugável** — classe abstrata `TestRunnerAdapter` + factory
  escolhida pelo campo `runner` do config. **Adapter Vitest** (`startVitest` +
  reporter silencioso, streaming p/ store/TUI) **e adapter Jest** (`@jest/core`
  `runCLI`, import *lazy* / peer opcional) no v1. O adapter só produz `RawRun`;
  normalize/renderers/exit são **runner-agnósticos** (novo runner = novo adapter).
- **UI:** 🟢 Ink.  **Watch:** 🟢 **watcher nativo do Vitest** (decisão #19):
  re-roda os testes relacionados ao arquivo salvo pelo grafo de módulos
  (rápido + pega quebra cross-file); a TUI foca a suíte do último salvo
  (RF-04). Watch é **Vitest-only no v1** (Jest = débito M4, ver decisão #17).
- **Args:** 🔵 `commander`.  **Config:** 🔵 `zod`.
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
  "ui": { "autoFocusFailures": true, "theme": "auto" }
}
```

(`runner`: `"vitest"` | `"jest"`, default `"vitest"`. Novos runners = novo
adapter, sem mudar schema/contrato.)

## 9. Comandos / UX 🔵

- **`test-reporter check`** — entrypoint do agente/CI: headless, varre tudo 1x,
  veredito explícito (seção 7), `--json`, exit code (seção 5). **(M1)**
- **`test-reporter run`** — comando principal (default). TTY → TUI ao vivo
  (RF-09): testes streamando, contadores ao vivo, **auto-foco na falha no
  instante em que acontece** (RF-03, decisão #18); `n`/`p` cicla falhas
  (ordem arquivo→nome), `esc` volta ao overview, `q` sai. Non-TTY / CI /
  `--summary` / `--json` → **cai exatamente no contrato do `check`**. **(M2 ✔)**
- **`test-reporter watch`** — modo watch (RF-04), TUI ao vivo. Watcher nativo
  do Vitest re-roda os testes relacionados ao salvar; cada ciclo zera os
  contadores e a UI foca a suíte do **último arquivo salvo** (cabeçalho
  `↻ saved: …`); `a` re-roda tudo, `f` só as falhas, `n`/`p`/`esc` como no
  `run` (decisão #18), `q`/Ctrl-C encerra limpo (sem watcher vazado).
  Non-TTY / CI / `--summary` / `--json` → 1 execução = contrato do `check`.
  **(M3 ✔)**
- `test-reporter init` — gera `test-reporter-config.json`. **(M4)**
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

**Propostas a confirmar 🔵**

- ESM + Node ≥ 20 LTS; `commander` p/ args; `zod` p/ config.

**Em aberto 🟡 (não bloqueiam M1)**

13. ~~RF-03: regra de múltiplas falhas~~ → **resolvida em #18**.
14. ~~RF-04: em watch, rodar só o arquivo salvo ou rodar tudo e focar~~ →
    **resolvida em #19** (watcher nativo do Vitest = testes relacionados).
15. Monorepo / múltiplos projetos? (provável fora do v1)
16. Coverage no escopo? (provável fora do v1)

## 11. Fora de escopo (v1) 🔵

Coverage, monorepo multi-projeto, dashboard web, histórico entre rodadas.

## 12. Roadmap

- **M1 (núcleo p/ o agente) — implementado e verde:** `test-reporter check` +
  contrato (seção 7) + config (RF-07) + RF-01/02 + **runner plugável (adapters
  Vitest e Jest)**. Testável pelo Claude.
- **M2 (UX flagship) — implementado e verde:** `test-reporter run` TUI ao vivo
  (RF-09/03/05, decisão #18); non-TTY → contrato do `check` (paridade testada).
- **M3 (watch) — implementado e verde:** `test-reporter watch` TUI ao vivo
  com watcher **nativo do Vitest** (decisão #19/#14: testes relacionados +
  foco no último salvo, RF-04); non-TTY → contrato do `check` (paridade
  testada). Watch é Vitest-only no v1 (Jest → débito M4, decisão #17).
- **M4:** polimento (`init`, temas, distribuição npm) + débitos herdados
  (streaming incremental no Jest, árvore de suítes, diff/code-frame,
  `--no-color`).
