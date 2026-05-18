# Progress — test-reporter-cli

> Estado do projeto. **Atualizar ao fim de cada task** (ver CLAUDE.md).
> Última atualização: **2026-05-18**.

## Status atual

**M1 implementado e verde.** `test-reporter check` funcional: contrato de saída
(texto + `--json`), config (zod), exit codes 0/1/>1, **29 testes** passando
(unit + e2e), build limpo. Próximo: **M2** (TUI `run`).

## Milestones

- [x] **M1** — núcleo p/ o agente: `test-reporter check` + contrato (PRD §7) +
  config (RF-07) + RF-01/02.
- [ ] **M2** — `test-reporter run`: TUI Ink ao vivo (RF-09/03/05).
- [ ] **M3** — `test-reporter watch` (RF-04).
- [ ] **M4** — polimento (`init`, temas, publicação npm).

## Feito

- [x] Docs base: `PRD.md` (v0.7), `CLAUDE.md`, `progress.md`, `SUCCESS_CRITERIA.md`.
- [x] `git init -b master` + remote `origin`. **Sem commits ainda.**
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

## Próximo — M2 (ver SUCCESS_CRITERIA.md › M2)

- [ ] Renderer `tui` (Ink) reusando núcleo/modelo do M1 (DRY).
- [ ] Streaming + contadores ao vivo (RF-09/02).
- [ ] Auto-foco na suíte que falha (RF-03) — **resolver decisão #13 do PRD**
  (regra de múltiplas falhas) junto.
- [ ] `test-reporter run`: TTY → TUI; non-TTY → headless (= `check`).

## Critérios de sucesso

Definição de pronto do app inteiro:
**[SUCCESS_CRITERIA.md](SUCCESS_CRITERIA.md)** — fonte única; aqui só o estado.
Status: **Globais + M1 marcados ✓**; M2–M4 pendentes.

## Pendências conhecidas / dívidas

- Sem commit git ainda; `master` só materializa após o 1º commit.
- `npm audit`: 5 vulnerabilidades *moderate* transitivas (cadeia esbuild/vite
  via vitest) — sem fix não-breaking; reavaliar no M4.
- `line/col` da falha = **local da definição do teste** (`includeTaskLocation`),
  não o frame exato da assertiva — determinístico e suficiente p/ o contrato;
  revisitar se precisar do ponto da assertiva.

## Decisões em aberto (não bloqueiam M1) — ver PRD §10

- RF-03 regra de múltiplas falhas (resolver em M2) · RF-04 watch (M3) ·
  monorepo / coverage (provável fora do v1).

## Log de sessões

- **2026-05-18 (spec):** init npm/git; PRD v0.1→v0.7; memória; `CLAUDE.md`,
  `progress.md`, `SUCCESS_CRITERIA.md`; princípios TDD-lite/DRY; decisão de
  testes (Vitest+TS/ESM, e2e por processo filho).
- **2026-05-18 (M1):** M1 implementado em TDD-lite — scaffold ESM, config(zod),
  modelo+normalize, formatters texto/JSON, exit codes, núcleo
  `startVitest`+reporter silencioso, `check`+CLI, 5 fixtures, 29 testes verdes.
  Gap corrigido: `summary.detail` (list/cause) agora aplicado. Docs +
  SUCCESS_CRITERIA atualizados (Globais + M1 ✓).
