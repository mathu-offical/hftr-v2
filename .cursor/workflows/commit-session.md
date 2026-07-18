# Commit Session Workflow

Commit phase for **every session** and **every verified update** (D-134). Prefer
`.cursor/workflows/end-of-run.md` for the full verify → curate → commit sequence.

**Sources:** `.cursor/rules/git-commits.mdc`, `.cursor/skills/commit-message/SKILL.md`

## Required

1. Read `commit-message` skill fully
2. Inventory every dirty file
3. Chunk plan with files listed
4. Per-file bullets in each commit body
5. Bullet count = staged file count
6. Report all SHAs

Do not wait for the user to ask. Never paragraph-only messages. Never truncate file lists.
