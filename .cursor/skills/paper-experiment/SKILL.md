---
name: paper-experiment
description: Runs hftr-v2 paper-only experimentation cohorts with preflight, provenance audit, intent-alignment scoring, triage, and doc curation. Use for experiment-shaped tasks, multi-company paper runs, or via /paper-experiment command.
---

# Paper experiment run

Canonical protocol: `agent-docs/research/paper-experimentation-protocol.md`
Scoring rubric: `agent-docs/testing/intent-alignment-scoring.md`

## 1. Scenario brief

Before any dispatch:

- [ ] Read `agent-docs/research/paper-experimentation-protocol.md` — cohort scope, success criteria, stop conditions
- [ ] Record experiment ID, companies/modules in scope, hypothesis, and declared intent vectors
- [ ] Confirm active milestone allows paper dispatch (`plans/master-build-plan.md`)
- [ ] Invoke `session-start` if context is stale

## 2. Paper-only preflight

**Fail-closed** — abort if any check fails:

- [ ] Company mode is `paper` (not live, not mixed)
- [ ] No live broker adapter or live credentials on the dispatch path
- [ ] Live gate is not bypassed; live master switch disabled or blocked with text-first reason
- [ ] Paper seed / holding fund topology present where required
- [ ] LLM budgets and admission limits configured for experiment tier

See `hftr-safety-invariants.mdc` §Paper experiment runs.

## 3. Run cohort

Execute the experiment per protocol:

- [ ] Dispatch paper trades / pipeline runs for each company in cohort
- [ ] Capture action traces, verification records, and ledger deltas
- [ ] For **multi-company** cohorts: use `parallel-orchestration` skill — **composer-2.5** sub-agents only, one track per company after shared preflight; parent merges traces and runs audits once

## 4. Provenance audit

Close-out checks on number authority (see `number-handling.mdc` §Experiment close-out):

- [ ] **feedClass honesty** — market/runtime feeds labeled correctly; no paper feed masquerading as live entitlement
- [ ] **ValueRef lineage** — every financial value in traces traces to adapter, ledger, clock, or calculator source; no model-emitted numbers
- [ ] Leak lint clean on model outputs for the run window
- [ ] Math module lineage graph consistent with trace inspector

## 5. Intent-alignment audit

Invoke `.cursor/skills/intent-alignment-audit/SKILL.md`:

- [ ] Score declared vs observed vectors per `agent-docs/testing/intent-alignment-scoring.md`
- [ ] Hard fail on immutable cap violations (guardrails, verification schemas, scope envelopes)

## 6. Triage

- [ ] Classify outcomes: pass / partial / fail / blocked — with text-first reasons
- [ ] Log surprises as OQ-n or D-nnn in `dev-intent/decisions-log.md` when protocol intent is unclear
- [ ] File follow-ups in sprint spec or master plan if gates block next cohort

## 7. Curate docs

- [ ] Update `agent-docs/research/paper-experimentation-protocol.md` if protocol drifted
- [ ] Update `agent-docs/testing/` docs if scoring or fixtures changed
- [ ] Invoke `agent-docs-curate` for broader drift

## 8. End of run

Fixed closing sequence:

1. `verify-change` — include §Paper experiment verification
2. Curate agent-docs (step 7)
3. **Invoke `commit-message` skill** — per-file bodies, chunked commits
4. Prefer `.cursor/workflows/end-of-run.md` or `/end-run`

Do **not** push unless the user explicitly requests it.
