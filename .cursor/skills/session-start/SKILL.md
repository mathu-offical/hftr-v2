---
name: session-start
description: Loads hftr-v2 context at the start of any substantial build task. Reads agent-docs, identifies active milestone, checks safety invariants and v1 carryover needs. Use when starting implementation, continuing a milestone, or when context may be stale.
---

# hftr-v2 session start

Run at the beginning of every substantial task (implementation, architecture, UI feature).

## Checklist

```
- [ ] Read agent-docs/README.md
- [ ] Read active sprint spec (plans/m0-sprint-spec.md or m1-sprint-spec.md)
- [ ] Read owning doc for task area (product, ui-ux, architecture/*)
- [ ] Scan dev-intent/decisions-log.md for recent D-nnn / open OQ-n
- [ ] If porting from v1: read research/v1-carryover.md + invoke v1-reference skill
- [ ] Confirm safety invariants still apply to this task (hftr-safety-invariants rule)
- [ ] If multi-package/domain: plan parallel sub-agents (`parallel-orchestration` skill, composer-2.5 only)
```

## Milestone alignment

Check `plans/master-build-plan.md` for current gate (M0–M6). Scope work to the active
milestone unless user explicitly requests otherwise. Do not skip gates.

## v1 lookup trigger

If task touches pipeline, bands, guardrails, verification, or contracts → read v1 paths
listed in `agent-sources.mdc` before designing new types.

## End of session

Fixed closing sequence: **verify → curate → INVOKE commit-message skill → report**.

- [ ] Invoke `verify-change` skill — tests + browser as applicable
- [ ] Update agent-docs (self-curation rule)
- [ ] **Read** `.cursor/skills/commit-message/SKILL.md` and follow every step
- [ ] Chunk plan with every dirty file listed; per-file bullets in each commit body
- [ ] Report SHA(s) + subjects; working tree clean (push only if user asks)
- [ ] Prefer `/end-run` or `.cursor/workflows/end-of-run.md`
