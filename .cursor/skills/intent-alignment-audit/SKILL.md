---
name: intent-alignment-audit
description: Scores declared vs observed intent vectors for paper experiment close-out. Hard fails on immutable cap violations. Use during paper-experiment runs or when auditing cohort outcomes against protocol.
---

# Intent-alignment audit

Canonical rubric: `agent-docs/testing/intent-alignment-scoring.md`
Protocol context: `agent-docs/research/paper-experimentation-protocol.md`

## 1. Load declared vectors

From the scenario brief and company/module config:

- [ ] Declared strategy intent, risk posture, and module topology
- [ ] Declared lever positions and bounded-range envelopes (weights/positions only — schemas immutable)
- [ ] Declared feed classes and broker mode (`paper` only for experiment runs)

## 2. Collect observed vectors

From traces, verification records, and ledger:

- [ ] Actual dispatch outcomes (fills, blocks, fallbacks) with text-first status
- [ ] Observed lever resolutions and gate results
- [ ] Observed feed classes and adapter paths used at runtime
- [ ] ValueRef lineage samples for key financial readouts

## 3. Score alignment

Per `agent-docs/testing/intent-alignment-scoring.md`:

| Dimension | Compare |
|-----------|---------|
| Topology | Declared modules/links vs canvas + dispatch graph |
| Risk / guardrails | Declared envelopes vs verification outcomes |
| Execution posture | Declared watch/wait/order vs trace states |
| Data honesty | Declared feedClass vs runtime source metadata |
| Mode | Declared `paper` vs observed adapter + credentials |

Record per-dimension score and overall cohort verdict.

## 4. Immutable cap check (hard fail)

**Stop and fail the audit** if any violation:

- [ ] Guardrail package or verification schema mutated at runtime
- [ ] Lever outside declared envelope without fail-closed block
- [ ] Unknown or out-of-scope lever accepted (`enforceScopeStrict` bypass)
- [ ] Live adapter or live credentials on experiment dispatch path
- [ ] Model output became authoritative number or schedule (D-008, D-009)

Violations are **not** triaged as partial pass — report as fail with trace IDs.

## 5. Report

Summarize for parent run or user:

- Scores per dimension + overall
- Hard-fail violations (if any) with evidence pointers
- OQ-n candidates for ambiguous rubric gaps

Typically invoked from `paper-experiment` skill step 5; can run standalone on historical traces.
