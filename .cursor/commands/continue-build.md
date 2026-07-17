Continue hftr-v2 build against the master plan.

**Sources:** `.cursor/skills/implement-milestone/SKILL.md`, `.cursor/workflows/implement-milestone-slice.md`, `agent-docs/plans/master-build-plan.md`

1. Run session-start workflow (`.cursor/workflows/session-start.md`)
2. Identify active milestone and next incomplete sprint deliverable
3. Create focused todo list for smallest spec-satisfying slice
4. Implement following architecture, safety, and UI rules
5. Run verify-and-ship workflow (`.cursor/workflows/verify-and-ship.md`) — verify, curate, **commit**
6. Report: what was built, what was verified, commit SHA(s), what's next

If porting v1 pipeline/contracts: invoke `.cursor/skills/v1-reference/SKILL.md` first.
If touching engine/dispatch/verification: invoke `.cursor/skills/pipeline-engine/SKILL.md`.
