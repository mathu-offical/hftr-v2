---
name: pipeline-engine
description: Implements or modifies hftr-v2 deterministic pipeline — bands, levers, gates, dispatch, verification, HandoffEnvelope, recovery ladders. Enforces model-free dispatch and v1 carryover contracts. Use for packages/engine work, trading module pipeline, or verification schema changes.
---

# Pipeline & engine work

Canonical: `architecture/system-architecture.md`, `architecture/llm-pipeline.md`,
`research/v1-carryover.md`

## Before coding

1. Invoke `v1-reference` skill — read relevant v1 pipeline nodes + wiki
2. Confirm task stays **above or at** model boundary (Groq compile = last model call)
3. Read `number-handling.md` if task touches values, bands, or calc

## Package layout

```
packages/engine/
  tools/          deterministic tool matrix (model-free)
  levers/         strategic/tactical/execution registries
  bands/          bounded-range catalog (sync with v1-carryover table)
  gates/          six-gate activation, scope enforcement
  dispatch/       broker-facing task creation (model-free)
  verification/   immutable schema checks, recovery ladders
  worker/         queue handler registry
```

## Invariants checklist

- [ ] HandoffEnvelope on every cross-tier artifact
- [ ] `enforceScopeStrict` — fail-closed on unknown/out-of-range levers
- [ ] Guardrail packages immutable; only envelope weights/positions mutable
- [ ] ActionTrace append-only; verification_records append-only
- [ ] Executable states: watch | wait | order | blocked | fallback
- [ ] No LLM import or call anywhere in engine package

## Contract tests

Every stage output must have Zod schema in `packages/contracts` + vitest contract test.
Target: ≥ v1 test coverage for deterministic layer (294+ tests at M3 gate).

## Band parity

When changing `boundedRangeFamilyDefinitions` or band constants:
- Update `packages/engine` constants
- Update `research/v1-carryover.md` band table
- Sync tier-lever reference if numeric min/typical/max change

## After implementation

- Run engine package tests
- Update `architecture/llm-pipeline.md` or system-architecture if boundaries shifted
- Invoke `verify-change`
