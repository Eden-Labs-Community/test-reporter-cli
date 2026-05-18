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

---

## Globais (cross-cutting — valem em qualquer milestone)

- [x] **ESM**, **Node ≥ 20**, TS `strict`; `npm run build` sem erro de tipo.
- [x] **DRY:** um único núcleo + modelo de resultados; `check`/`run`/`watch`
  só trocam o *renderer*, nunca duplicam lógica (normalização, formatters,
  caminhos, config cada um em módulo único). *(M1: núcleo pronto p/ M2 reusar.)*
- [x] **TDD-lite:** todo comportamento nasceu de um teste que falhou primeiro.
- [x] Invariantes do contrato do `check` (ver M1) **nunca** regridem. *(cobertos por testes)*
- [x] Resultados sempre via reporter programático do Vitest (zero parsing de stdout).
- [x] PRD/CLAUDE/progress/este doc refletem a realidade ao fim de cada task.

## M1 — núcleo p/ o agente (`test-reporter check`)

> Cada item é verificável e vira um teste (red → green). M1 só fecha com **todos** marcados.

**Scaffold**
- [x] `package.json` ESM (`"type": "module"`), `bin.test-reporter` → entry
  buildada; scripts `build`/`test`/`lint`; `npx test-reporter --help` funciona.
- [x] TS `strict` + ESM/NodeNext; `npm run build` sem erros de tipo.

**Núcleo (Vitest)**
- [x] Roda a suíte Vitest do projeto-alvo via API Node (`startVitest`) +
  reporter custom → modelo de resultados normalizado (suites, testes, status,
  duração, falha: `file/line/col/errorType/message`). **Zero** parsing de stdout.
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
  documentados; `include` / `summary.detail` / `summary.maxFailures` respeitados.

**Qualidade (TDD-lite + DRY)**
- [x] Cada critério acima coberto por teste do próprio CLI, escrito **red→green**;
  fixtures: projeto que passa, que falha, misto, config inválida (+ runner-error).
- [x] Sem lógica duplicada: normalização, formatação texto/JSON, relativização
  e config cada um em módulo único; `check` apenas compõe.
- [x] `npm test` verde (29); asserções determinísticas dos contratos texto e JSON.

## M2 — `test-reporter run` (TUI flagship — RF-09/03/05/01/02)

- [ ] TTY → abre TUI Ink; non-TTY → cai para a saída headless (= `check`).
- [ ] Resultados **streamam ao vivo**: cada teste aparece e muda de estado
  (pendente → verde/vermelho) em tempo real conforme o reporter emite;
  contadores ao vivo (RF-02/RF-09).
- [ ] Tela de **resumo**: total de suites, passou/falhou/skipped, lista
  navegável por teclado, duração (RF-05).
- [ ] **Auto-foco na falha (RF-03):** ao falhar uma suíte, a UI troca para a
  tela de detalhe dela — testes que falharam, diff de assertiva, stack limpa e
  code frame (RF-01).
- [ ] **Decisão #13 do PRD resolvida e implementada** (regra de múltiplas
  falhas: qual focar / como ciclar).
- [ ] Navegação fluida: `n`/`p` entre falhas, `Enter` abre item, `Esc`/`q`
  volta/sai; TUI não trava durante execução.
- [ ] Estética caprichada só em TTY; degrade limpo em non-TTY/CI; respeita
  `NO_COLOR`/`--no-color`.
- [ ] **DRY:** reusa núcleo + modelo do M1; só o renderer `tui` é novo.
- [ ] Testes (unit, sem render real): estado/seleção/navegação; pelo menos um
  de "auto-foco em falha" e um de "contadores ao vivo" via eventos simulados.

## M3 — `test-reporter watch` (RF-04)

- [ ] Usa o watcher nativo do Vitest; re-roda ao salvar.
- [ ] Ao salvar um arquivo de teste, a UI **foca a suíte daquele arquivo**
  (último salvo) e mostra a execução ao vivo (RF-04).
- [ ] **Decisão #14 do PRD resolvida e implementada** (rodar só o arquivo
  salvo vs rodar tudo e focar).
- [ ] Teclas: `a` re-roda tudo, `f` só falhas, `q` sai; estado de watch
  visível no cabeçalho.
- [ ] Ctrl-C / `q` encerra limpo — sem watcher/processo vazado.
- [ ] **DRY:** reusa núcleo/modelo/renderer de M1/M2.
- [ ] Testes: "qual suíte focar dado o último arquivo salvo" e lógica de
  re-execução cobertas por unidade.

## M4 — polimento & release

- [ ] `test-reporter init` gera um `test-reporter-config.json` válido (passa no
  zod) com defaults documentados.
- [ ] `ui.theme` (auto/claro/escuro), `NO_COLOR` e `--no-color` respeitados.
- [ ] `--help`/`--version` completos por comando; mensagens de erro acionáveis.
- [ ] **Publicável:** `bin` + shebang corretos, `exports`/`files`, build limpo;
  `npm pack` instalável; `npx test-reporter` funciona **fora** do repo.
- [ ] `README` com uso (incl. **como o Claude deve chamar `check`**) e o
  contrato de saída.
- [ ] Todas as decisões 🟡 do PRD §10 resolvidas **ou** explicitamente fora de
  escopo (registrado no PRD).
