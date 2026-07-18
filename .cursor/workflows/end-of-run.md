# End-of-Run / End-of-Session Workflow

**Mandatory after every session and after every verified update (D-134).**
Do not end a turn with uncommitted verified work. Do not wait for the user to ask to commit.

## Sequence

```
implement / update → verify → curate docs → INVOKE commit-message skill → report
```

Applies to:
- Full implementation sessions
- Smaller verified updates (API, UI, docs, rules, skills)
- Parallel-subagent merges after parent verification
- Experiment / curation / secrets-audit sessions that changed files

## Step 1 — Verify

`.cursor/skills/verify-change/SKILL.md` steps 1–5 (+ §5b secrets if credentials-adjacent).
Stop if failed. For key/enqueue/settings/LLM/adapter changes, also run
`.cursor/workflows/secrets-hygiene-audit.md`.

Docs-only / `.cursor/`-only with no behavior claims: skip runtime verify; still commit.

## Step 2 — Curate

Sync agent-docs, sprint specs, decisions-log with verified behavior.
Secrets protocol changes → update `ops/security-audit.md` + decisions-log (D-074).

## Step 3 — Commit (non-optional)

1. **Read** `.cursor/skills/commit-message/SKILL.md` from disk (do not skip)
2. Run Step 1 inventory: `git status --short` + `git diff --name-status`
3. Write **chunk plan** listing every file per commit (in response)
4. For each chunk: per-file bullets → HEREDOC commit → verify file count matches
5. Repeat until working tree clean

## Step 4 — Report

- Every commit SHA + subject
- Per-commit file counts
- Verification summary
- Unstaged paths (if any) + reason

## Step 5 — Push

Only if user explicitly asked.

## Failure modes

| Symptom | Fix |
|---------|-----|
| Paragraph commit message | Rewrite with Files changed per file |
| Subject >72 chars with no body | Split: short subject + full HEREDOC body |
| Fewer bullets than staged files | Add missing per-file bullets |
| One giant commit for unrelated domains | Split and recommit |
| Ended session without committing | Violation — run this workflow now |
| Waited for user to ask before committing | Violation (D-134) — commit after verify |
