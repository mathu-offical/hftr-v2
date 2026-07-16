# Session Start Workflow

Load context before any substantial hftr-v2 work.

## Steps

1. Read `.cursor/skills/session-start/SKILL.md` and follow its checklist
2. Read `agent-docs/plans/master-build-plan.md` — note active milestone
3. Read active sprint spec (`m0-sprint-spec.md` or `m1-sprint-spec.md`)
4. Read owning agent-docs for the task area
5. Scan `dev-intent/decisions-log.md` for recent decisions and open OQ-n
6. If v1 carryover involved: read `research/v1-carryover.md` + `.cursor/skills/v1-reference/SKILL.md`

## Output

Brief statement of: active milestone, docs read, safety constraints relevant to task, any open OQ-n.

Then proceed to implementation or invoke `implement-milestone-slice` workflow.
