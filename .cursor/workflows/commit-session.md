# Commit Session Workflow

**End-of-run git capture** — run after verification passes. Standard closing step for every
implementation run with uncommitted changes.

**Sources:** `.cursor/rules/git-commits.mdc`, `.cursor/skills/commit-message/SKILL.md`,
`.cursor/workflows/verify-and-ship.md`

## When to run

- **Automatically** at end of every implementation run once verification passes
- On demand via `/commit-session`
- After `/continue-build` completes its verify step

Do **not** commit before verification passes or when verification failed.

## Steps

### 1. Confirm prerequisites

- [ ] Verification passed (tests and/or browser as applicable)
- [ ] agent-docs synced with verified behavior
- [ ] `git status` shows committable changes (not only secrets/artifacts)

### 2. Read commit skill

Follow `.cursor/skills/commit-message/SKILL.md` steps 1–7.

### 3. Split multi-domain diffs

If `git status` spans unrelated packages, create separate commits in dependency order.

### 4. Bundle self-curation

Code + owning `agent-docs/` in the **same commit** unless an earlier commit this run already covered the docs.

### 5. Commit with HEREDOC

Structured body: Context → Why → What changed → Connections → Verification → Next steps.
The **Verification** section must reflect checks that already passed this run.

### 6. Report

Return to user: commit SHA(s), subject(s), file count, anything left uncommitted and why.

### 7. Push (user-request only)

```bash
git push origin HEAD
```

Only when the user explicitly asks.
