# Verify and Ship Workflow

Zero-trust verification before marking any task complete.

## Steps

1. Read `.cursor/skills/verify-change/SKILL.md`
2. Run affected package tests (typecheck, vitest, lint when scaffold exists)
3. For UI changes: IronBee DevTools browser verification (navigate → interact → snapshot → console)
4. Fix any failures; re-verify until clean
5. Update agent-docs if verification revealed drift
6. Report verification summary to user

## Skip conditions

Browser/runtime verification may be skipped only when change has **zero observable runtime effect**.

## IronBee only

Do not use Cursor built-in browser or plugin-browse for hftr-v2 verification.

## Milestone gates

Before claiming a gate passed (G0–G6): complete gate checklist in `implement-milestone` skill
and log review in `dev-intent/decisions-log.md`.
