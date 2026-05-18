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

`test-reporter-cli`: CLI de relatório de testes com **dois comandos e dois
públicos distintos**:

- **`test-reporter run`** — TUI (Ink) bonita e em tempo real, para devs.
  É a UX flagship. (Milestone M2.)
- **`test-reporter check`** — headless, determinístico, com **contrato de saída
  estável**. **Consumidor primário = o Claude usando como ferramenta** num loop
  agêntico (rodar → ler veredito → corrigir). (Milestone M1.)

## Stack (travada)

TypeScript · **ESM** · **Node ≥ 20** · **Vitest** via API Node (`startVitest`) +
reporter custom com streaming · **Ink** (TUI) · **commander** (args) ·
**zod** (config). Resultados vêm do reporter programático — nunca parsear stdout
do Vitest.

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

## Estrutura alvo do código

`src/core` (Vitest + store de resultados) · `src/renderers` (`summary`, `tui`) ·
`src/commands` · `src/config`. Ainda **não criada** — ver `progress.md`.

## Testes & build

- **Os testes do próprio CLI são escritos em Vitest + TypeScript (ESM)** — o
  mesmo runner que o CLI integra (dogfooding; sem runner extra na stack).
- **Unit:** módulos puros (normalização, formatters texto/JSON, config+zod,
  exit codes). Sem spawn.
- **E2E / contrato:** rodam `test-reporter check` **como processo filho**
  contra *fixtures* (`test/fixtures/`: passa / falha / misto / config inválida
  / erro de runner) e conferem stdout (snapshot byte-exato), stderr e exit code.
- ⚠️ **Nunca** chamar o núcleo (que faz `startVitest`) de dentro de um teste
  Vitest — evitar Vitest-dentro-de-Vitest (reentrância); sempre processo filho.
- Comandos (`build` / `test` / `lint`): a definir no scaffold — **atualizar
  esta seção** com os comandos reais assim que existirem.
