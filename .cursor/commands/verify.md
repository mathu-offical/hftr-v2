Zero-trust verification, then **immediately** commit via commit-message skill.

**Sources:** `.cursor/skills/verify-change/SKILL.md`, `.cursor/workflows/end-of-run.md`
**Policy:** D-134 — commit after every verified update; do not wait to be asked.

1. Run full verification (tests, browser if UI, console).
2. Fix failures; re-verify until clean.
3. Sync agent-docs with verified behavior.
4. **Read** `.cursor/skills/commit-message/SKILL.md` — inventory files, chunk plan,
   per-file `Files changed` bullets, HEREDOC commits.
5. Report verification + every commit SHA/subject.
6. Push only if user asks.

A verified update is not complete with uncommitted work or paragraph-style commits.
