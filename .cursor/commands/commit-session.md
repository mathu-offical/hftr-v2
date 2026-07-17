Create detailed, chunked git commits for all verified session changes.

**MANDATORY:** Read `.cursor/skills/commit-message/SKILL.md` and follow every step.
Do not invent a short paragraph message.

1. Confirm verification passed (or run verify first).
2. `git status --short` + `git diff --name-status` — inventory **every** dirty file.
3. Write chunk plan: list every file under each planned commit (in your response).
4. For each chunk: stage only those files → HEREDOC with sections Context, Why,
   **Files changed** (one bullet per staged file: path + what + why), Connections,
   Verification, Next steps.
5. Cross-check: number of Files changed bullets == `git diff --cached --name-only | wc -l`.
6. Repeat until clean. Show `git log --oneline -N` for all new commits.

Forbidden: truncated subjects-as-bodies, "various files", fewer bullets than files.

Push only if user asked. See `.cursor/workflows/end-of-run.md`.
