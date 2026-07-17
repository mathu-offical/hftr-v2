End the current run: verify, then commit all changes with per-file messages.

**MANDATORY:** Read and follow `.cursor/skills/commit-message/SKILL.md` completely.

1. Run verify-change skill (tests + browser if applicable).
2. Curate agent-docs if behavior changed.
3. `git status --short` + `git diff --name-status` — inventory **every** file.
4. Write chunk plan (list every file per commit) before staging.
5. For each chunk: stage → HEREDOC commit with **Files changed** bullet per staged file.
6. Cross-check: staged file count = bullet count in message.
7. Report all SHAs + subjects. Working tree must be clean (except secrets/artifacts).

Never use paragraph-style commit messages. Never truncate file lists.

See `.cursor/workflows/end-of-run.md`.
