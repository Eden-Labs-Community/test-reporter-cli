# Progress — test-reporter-cli

> Estado do projeto. **Atualizar ao fim de cada task** (ver CLAUDE.md).
> Última atualização: **2026-05-18**.

## Status atual

Fase: **pré-implementação (spec)**. M1 com especificação completa no PRD (v0.7).
**Nada de código implementado ainda.**

## Milestones

- [ ] **M1** — núcleo p/ o agente: `test-reporter check` + contrato de saída
  (PRD §7) + config (RF-07) + RF-01/02. *(spec completa, aguardando início)*
- [ ] **M2** — `test-reporter run`: TUI Ink ao vivo (RF-09/03/05).
- [ ] **M3** — `test-reporter watch` (RF-04).
- [ ] **M4** — polimento (`init`, temas, publicação npm).

## Feito

- [x] `npm init` → `package.json` (eden-test-reporter-cli v1.0.0).
- [x] `git init -b master` + remote `origin`
  (Eden-Labs-Community/test-reporter-cli). **Sem commits ainda.**
- [x] `.gitignore`.
- [x] `PRD.md` evoluído até **v0.7** (M1 spec completa).
- [x] `CLAUDE.md` + `progress.md` criados.

## Próximo — plano do M1

- [ ] **Scaffold:** `package.json` → `"type": "module"` (hoje está
  `"commonjs"`), `tsconfig` (ESM/NodeNext), deps (`vitest`, `ink`, `react`,
  `commander`, `zod`), `bin: test-reporter`, estrutura `src/`.
- [ ] **core:** `startVitest` + reporter custom → store de resultados normalizado.
- [ ] **renderer `summary`:** texto (PRD §7) + `--json` + exit codes + stdout limpo.
- [ ] **comando `check`** + carregar/validar `test-reporter-config.json` (zod).
- [ ] **testes do próprio CLI:** sucesso, falha, `--json`, determinismo, exit codes.

## Critérios de sucesso

Definição de pronto do **app inteiro** (M1–M4 + critérios globais):
**[SUCCESS_CRITERIA.md](SUCCESS_CRITERIA.md)** — fonte única dos critérios
verificáveis. Aqui (progress.md) fica só o **estado**; lá, o que define "pronto".

## Pendências conhecidas / dívidas

- `package.json` (de `npm init -y`) está `"type": "commonjs"` → trocar para
  `"module"` no scaffold (stack é ESM).
- Sem commit git ainda; branch `master` só materializa após o 1º commit.

## Decisões em aberto (não bloqueiam M1) — ver PRD §10

- RF-03 regra de múltiplas falhas (M2) · RF-04 comportamento do watch (M3) ·
  monorepo / coverage (provável fora do v1).

## Log de sessões

- **2026-05-18:** init npm/git + remote + .gitignore; PRD evoluído v0.1→v0.7
  (stack TS/Vitest/Ink, modelo de dois comandos, contrato do `check`, regra
  "`check` nunca é vazio"); memória do projeto registrada; `CLAUDE.md` e
  `progress.md` criados; **critérios de sucesso do M1 (DoD)** escritos no
  progress.md; princípios **TDD-lite** e **DRY** adicionados ao CLAUDE.md.
  M1 com spec + DoD completos. Decisão: testes do próprio CLI em **Vitest +
  TS/ESM** (unit + e2e via processo filho contra fixtures); criado
  **SUCCESS_CRITERIA.md** (DoD do app inteiro, M1–M4) e o DoD do M1 movido
  do progress.md para lá (DRY). Aguardando go para implementar.
