# End-of-Run Workflow

**Mandatory closing sequence for every implementation turn.** Do not end a turn with
uncommitted verified work. Do not end without invoking `commit-message` skill.

## Sequence

```
implement → verify → curate docs → INVOKE commit-message skill → report
```

## Step 1 — Verify

`.cursor/skills/verify-change/SKILL.md` steps 1–5. Stop if failed.

## Step 2 — Curate

Sync agent-docs, sprint specs, decisions-log with verified behavior.

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
| Ended turn without committing | Violation — run this workflow |
