# Verify, Commit, and Report Workflow

Standard **end-of-run** sequence. A run is incomplete until verified work is committed.

**Sources:** `.cursor/skills/verify-change/SKILL.md`, `.cursor/skills/commit-message/SKILL.md`

## Fixed order

```
implement → verify → curate docs → commit → report
```

## Steps

### 1. Verify

Follow `verify-change` skill steps 1–5 (tests, browser, doc sync). **Stop** if verification fails — fix and re-verify; do not commit broken state.

### 2. Curate

Ensure agent-docs, sprint specs, and decisions-log reflect the verified behavior (self-curation rule).

### 3. Commit

If `git status` shows uncommitted changes from this run:

1. Follow `commit-message` skill
2. Split unrelated domains into separate commits (contracts → db → engine → web)
3. Bundle code with owning `agent-docs/` in the same commit
4. Structured body with **Verification** section citing what just passed
5. Never stage `.env`, `.env.local`, `node_modules/`, `.next/`

### 4. Report

Tell the user:

- What was built and verified (how)
- Commit SHA(s) and subject line(s)
- What remains uncommitted (if anything) and why
- Suggested next steps / open OQ-n

### 5. Push (optional)

`git push origin HEAD` **only** when the user explicitly asks.

## Skip conditions

| Condition | Commit? |
|-----------|---------|
| Verification passed + run changes exist | **Yes — required** |
| No file changes in run | No |
| Verification failed | No — fix first |
| Only secrets/build artifacts dirty | No — leave unstaged |

## IronBee only

Browser verification via IronBee DevTools — not Cursor built-in browser.

## Milestone gates

Before claiming gate G0–G6 passed: verification + commit + gate review in `decisions-log.md`.
