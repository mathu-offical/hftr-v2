Zero-trust verification pass for recent hftr-v2 changes.

**Sources:** `.cursor/skills/verify-change/SKILL.md`, `.cursor/workflows/verify-and-ship.md`

1. Identify what changed in this session (code, UI, API, docs claims)
2. Run relevant tests (typecheck, vitest, lint)
3. For UI-observable changes: verify in IronBee DevTools browser (interact, not just screenshot)
4. Check console for errors
5. Fix failures and re-verify
6. Update agent-docs if verification exposed drift
7. Report verification status — explicit about anything still unverified
