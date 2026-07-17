Zero-trust verification, then commit verified changes.

**Sources:** `.cursor/skills/verify-change/SKILL.md`, `.cursor/workflows/verify-and-ship.md`

1. Run full verification (tests, browser if UI, console check)
2. Fix failures and re-verify until clean
3. Sync agent-docs with verified behavior
4. **Commit** all run changes via `commit-message` skill (structured Conventional Commit)
5. Report: verification summary + commit SHA(s)
6. Push only if user explicitly asks

A run is not complete with uncommitted verified work.
