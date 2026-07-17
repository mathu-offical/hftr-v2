---
name: implement-milestone
description: Implements a focused slice of the hftr-v2 master build plan with minimal scope, package-boundary respect, and mandatory verification. Use when building features, scaffolding packages, or continuing M0-M6 milestones.
---

# Implement milestone slice

## 1. Align scope

- Read `agent-docs/plans/master-build-plan.md` — identify active milestone (M0–M6)
- Read active sprint spec (`m0-sprint-spec.md` or `m1-sprint-spec.md`)
- Pick **smallest spec-satisfying slice** — one deliverable or sub-deliverable

## 2. Plan (brief)

If the slice spans independent packages or domains, invoke `parallel-orchestration` skill and
delegate via Task tool (`model: "composer-2.5"`, never Grok). Parent verifies and merges.

Create mental/written checklist:
- [ ] Contracts/schemas (`packages/contracts`)
- [ ] DB migration if needed (`packages/db`)
- [ ] Engine/adapters/llm if pipeline touch
- [ ] API route + ownership scoping (`apps/web`)
- [ ] UI if user-visible (`apps/web`, follow ui-ux-standards rule)
- [ ] Tests (contract tests for schemas; Playwright if flow in ui-spec §7)
- [ ] agent-docs update (same change)

## 3. Implement

- Follow monorepo boundaries (`architecture-monorepo` rule)
- Respect safety invariants — especially model boundary and ValueRef handling
- Match tech decisions (TD-nn); log new TD if substituting stack
- Minimize diff scope — no unrelated refactors

## 4. Verify (mandatory)

Invoke `verify-change` skill before claiming done.

## 5. Curate

Update sprint spec progress + owning agent-docs. Log blockers as OQ-n.

## 6. Commit (mandatory — invoke skill)

After verification passes:

1. **Read** `.cursor/skills/commit-message/SKILL.md` (do not improvise)
2. Inventory all dirty files; publish chunk plan (every file assigned)
3. Commit each chunk with **Files changed** bullet per staged file
4. Report every SHA + subject; leave no verified work uncommitted
5. Push only if user explicitly asks

See `.cursor/workflows/end-of-run.md`.

## Milestone gate checklist (before claiming gate passed)

- [ ] Deliverables in master-build-plan.md met for that milestone
- [ ] Tests green for affected packages
- [ ] Browser-verified flows listed in gate description
- [ ] agent-docs updated; gate review logged in decisions-log.md
