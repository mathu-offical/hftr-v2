---
name: v1-reference
description: Looks up hftr v1 read-only sources to port contracts, bands, guardrails, pipeline concepts, and wiki knowledge into v2. Use when implementing engine, pipeline, verification, bands/levers, compliance, or any v1 carryover work.
---

# v1 reference lookup (vendored snapshot, read-only)

All v1 reference material is **vendored inside this repo** — the external v1 workspace is
never a dependency. Snapshot root: `agent-docs/research/v1-reference/` (never edit; see its
README). Seed catalogs: `packages/db/src/seed/catalogs/` (editable canonical copies).

## Lookup table (paths relative to repo root)

| Need | Path |
|------|------|
| Type contracts | `agent-docs/research/v1-reference/code/contracts/` |
| Pipeline implementation | `agent-docs/research/v1-reference/code/pipeline-nodes/` |
| Band numeric constants | `agent-docs/research/v1-reference/code/pipeline-nodes/bands.ts` |
| Lever registries | `agent-docs/research/v1-reference/code/pipeline-nodes/levers.ts` |
| Wiki: dispatch | `agent-docs/research/v1-reference/wiki/deterministic-dispatch.md` |
| Wiki: compile tier | `agent-docs/research/v1-reference/wiki/execution-agent-compile.md` |
| Wiki: guardrails | `agent-docs/research/v1-reference/wiki/guardrails.md` |
| Wiki: activation gates | `agent-docs/research/v1-reference/wiki/activation-validation.md` |
| Wiki: tier levers | `agent-docs/research/v1-reference/wiki/tier-lever-model.md` |
| Band reference doc | `agent-docs/research/v1-reference/tier-lever-and-bounded-range-reference.md` |
| Tool catalog | `agent-docs/research/v1-reference/academic-quant-tool-catalog.md`, `packages/db/src/seed/catalogs/seeded-strategy-catalog.json` |
| Compliance | `agent-docs/research/v1-reference/compliance-and-policy-operating-baseline.md` |
| DevSpecs audit | `agent-docs/research/v1-reference/1-general.audit.md` |

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
