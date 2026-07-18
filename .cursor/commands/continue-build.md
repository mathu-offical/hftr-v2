Continue hftr-v2 build against the master plan.

**Sources:** `.cursor/skills/implement-milestone/SKILL.md`, `.cursor/workflows/implement-milestone-slice.md`, `agent-docs/plans/master-build-plan.md`

1. Run session-start workflow (`.cursor/workflows/session-start.md`)
2. Identify active milestone and next incomplete sprint deliverable
3. Create focused todo list for smallest spec-satisfying slice
4. Implement following architecture, safety, and UI rules
5. Run end-of-run workflow (`.cursor/workflows/end-of-run.md`): verify → curate → **invoke commit-message skill**
6. Commit with per-file `Files changed` bullets; chunk unrelated domains (D-134 — do not wait to be asked)
7. Report: built, verified, every SHA + subject, what's next

If porting v1 pipeline/contracts: invoke `.cursor/skills/v1-reference/SKILL.md` first.
If touching engine/dispatch/verification: invoke `.cursor/skills/pipeline-engine/SKILL.md`.
