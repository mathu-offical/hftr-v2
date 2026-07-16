---
name: v1-reference
description: Looks up hftr v1 read-only sources to port contracts, bands, guardrails, pipeline concepts, and wiki knowledge into v2. Use when implementing engine, pipeline, verification, bands/levers, compliance, or any v1 carryover work.
---

# v1 reference lookup (read-only)

v1 root: `/Users/matt-mobile/MATT/web_dev/hftr/` — **never edit**.

## Lookup table

| Need | Primary v1 path |
|------|-----------------|
| Type contracts | `packages/contracts/src/` |
| Pipeline implementation | `apps/hftr-web/src/lib/pipeline/` |
| Band numeric constants | `apps/hftr-web/src/lib/pipeline/nodes/bands.ts` |
| Lever registries | `apps/hftr-web/src/lib/pipeline/nodes/levers.ts` |
| Dispatch/verification | `apps/hftr-web/src/lib/pipeline/nodes/dispatch*.ts`, `verify*.ts` |
| Wiki: dispatch | `agent-docs/wiki/deterministic-dispatch.md` |
| Wiki: compile tier | `agent-docs/wiki/execution-agent-compile.md` |
| Wiki: guardrails | `agent-docs/wiki/guardrails.md` |
| Wiki: activation gates | `agent-docs/wiki/activation-validation.md` |
| Wiki: tier levers | `agent-docs/wiki/tier-lever-model.md` |
| Band reference doc | `agent-docs/research/tier-lever-and-bounded-range-reference.md` |
| Tool catalog | `agent-docs/research/academic-quant-tool-catalog.md`, `seeded-strategy-catalog.json` |
| Compliance | `agent-docs/research/compliance-and-policy-operating-baseline.md` |
| DevSpecs audit | `DevSpecs/1-general.audit.md` |

## Port rules

1. Read v2 mapping first: `agent-docs/research/v1-carryover.md`
2. Port **contracts + catalogs + invariants** into `packages/contracts` and `packages/engine`
3. Do **not** copy v1 React components, stale DB types, or stub broker/LLM layers
4. Rename concepts per v2 domain model (broker workspace → company; module graph)
5. Record what was ported/renamed in v1-carryover.md

## v1 → v2 stage mapping

| v1 stage | v2 owner |
|----------|----------|
| research_topic | Research modules (Claude) |
| trend / lead | Trend modules |
| tree (tactical) | Trading module (Mistral) |
| compile | Trading module (Groq) — last model stage |
| dispatch/verify | Deterministic core per trading module |
| loop_refine | Analyzer + training feedback |

## After porting

- Add contract tests in v2 matching v1 schema expectations
- Update v1-carryover.md status column
- Log deviations as D-nnn if intentional
