# PRD — test-reporter-cli

> Documento vivo (v0.7). 🟢 decidido · 🟡 em aberto · 🔵 proposta minha sujeita a validação.
> **M1 com especificação completa — pronto para implementar.**

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
| RF-04 | Modo **Watch**: focar a suíte do último arquivo salvo, ao vivo | nec. 4 | M3 | Rodar só o arquivo ou tudo e focar 🟡 (decidir em M3) |
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
- Resultados via **reporter programático do Vitest** (sem parsing de stdout).
- Distribuição npm (`bin`), shebang `#!/usr/bin/env node`, build TS→JS.

## 6. Arquitetura

- **Linguagem:** 🟢 TypeScript.  **Módulos:** 🔵 **ESM** (Vitest 3 e Ink são
  ESM-first).  **Node:** 🔵 **≥ 20 LTS**.
- **Runner:** 🟢 Vitest via API Node (`startVitest`) + reporter custom com
  streaming p/ store em memória (alimenta TUI ao vivo e resumo final).
- **UI:** 🟢 Ink.  **Watch:** 🔵 watcher nativo do Vitest.
- **Args:** 🔵 `commander`.  **Config:** 🔵 `zod`.
- **Camadas:** núcleo (Vitest + store) compartilhado; *renderers* plugáveis:
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
  "include": ["src/**/*.test.ts"],
  "defaultMode": "standard",
  "watch": { "followLastSaved": true },
  "summary": { "detail": "cause", "maxFailures": 50 },
  "ui": { "autoFocusFailures": true, "theme": "auto" }
}
```

(`framework` fixo em Vitest no v1.)

## 9. Comandos / UX 🔵

- **`test-reporter check`** — entrypoint do agente/CI: headless, varre tudo 1x,
  veredito explícito (seção 7), `--json`, exit code (seção 5). **(M1)**
- **`test-reporter run`** — comando principal. TTY → TUI caprichada ao vivo
  (RF-09): suites/testes streamando, verdes ao vivo, contadores ao vivo,
  auto-foco na suíte que falha (RF-03). `--summary`/`--json` força headless. **(M2)**
- `test-reporter watch` — modo watch (RF-04), TUI ao vivo. **(M3)**
- `test-reporter init` — gera `test-reporter-config.json`. **(M4)**
- Flags globais: `--config`, `--filter`, `--mode standard|watch`, `--json`.

## 10. Decisões

**Resolvidas 🟢**

1. Vitest. 2. TypeScript. 3. Ink. 4. RF-06 = comando, não arquivo.
5. Consumidor primário do contrato: Claude. 6. Saída base: lista compacta.
7. Disparo headless: non-TTY + `--summary`. 8. Detalhe: lista + causa + local.
9. RF-08: comando dedicado separado do `run`. 10. `run` = principal, TUI ao vivo.
11. Nome do comando RF-08: `check`.
12. **`check` nunca é vazio: sucesso = `✓ PASS …` explícito; falha = `✗ FAIL …`
    + só os blocos de erro, nada mais no stdout.**

**Propostas a confirmar 🔵**

- ESM + Node ≥ 20 LTS; `commander` p/ args; `zod` p/ config.

**Em aberto 🟡 (não bloqueiam M1)**

13. RF-03: regra quando múltiplas suites falham (decidir em M2).
14. RF-04: em watch, rodar só o arquivo salvo ou rodar tudo e focar (M3).
15. Monorepo / múltiplos projetos? (provável fora do v1)
16. Coverage no escopo? (provável fora do v1)

## 11. Fora de escopo (v1) 🔵

Coverage, monorepo multi-projeto, dashboard web, histórico entre rodadas.

## 12. Roadmap

- **M1 (núcleo p/ o agente) — spec completa:** `test-reporter check` + contrato
  da saída (seção 7) + config (RF-07) + RF-01/02. Já testável pelo Claude.
- **M2 (UX flagship):** `test-reporter run` TUI caprichada ao vivo (RF-09/03/05).
- **M3:** `watch` (RF-04).
- **M4:** polimento (`init`, temas, distribuição npm).
