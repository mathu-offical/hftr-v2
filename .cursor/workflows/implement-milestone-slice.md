# Implement Milestone Slice Workflow

Spec-driven implementation loop for hftr-v2 master plan.

## 1. Session start

Follow `session-start.md` workflow.

## 2. Pick slice

From active sprint spec, choose the **smallest** incomplete deliverable that moves the gate forward.

## 3. Research (if needed)

- v1 carryover: `v1-reference` skill
- External APIs/libs: Context7 MCP or official docs → log in `tech-decisions.md`
- UI patterns: `ui-ux/ui-spec.md`

## 4. Plan todos

If deliverables split across independent tracks, decompose for parallel sub-agents first
(`.cursor/rules/parallel-subagents.mdc`). All sub-agents: `composer-2.5`; never Grok.

Example:
- [ ] Zod contract in `packages/contracts`
- [ ] Drizzle migration + scoping helper
- [ ] Engine/API implementation
- [ ] UI surface (if applicable)
- [ ] Contract/unit tests
- [ ] agent-docs update

## 5. Implement

Follow rules: `architecture-monorepo`, `typescript-standards`, `hftr-safety-invariants`,
`number-handling` (if applicable), `ui-ux-standards` (if UI).

## 6. Verify, commit, report

Follow `verify-and-ship.md` workflow:

1. Verify (tests + browser)
2. Curate agent-docs
3. **Commit** verified changes (`commit-message` skill)
4. Report SHA(s), verification summary, what's next

A run is incomplete with uncommitted verified work.

## 7. Curate

Update sprint spec + owning agent-docs. Log decisions/blockers.

## 8. Continue or gate

- More slice work? Return to step 2
- Milestone complete? Run gate checklist in `implement-milestone` skill → log in decisions-log
