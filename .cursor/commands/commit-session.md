Create a detailed hftr-v2 git commit for verified session changes.

**When:** End of every implementation run after verification passes, or on demand.

**Sources:** `.cursor/rules/git-commits.mdc`, `.cursor/skills/commit-message/SKILL.md`, `.cursor/workflows/commit-session.md`

1. Confirm verification already passed this run (do not commit failed work).
2. Read `.cursor/skills/commit-message/SKILL.md` and follow it completely.
3. Run `git status` and `git diff` — split unrelated domains into separate commits.
4. Bundle code with owning `agent-docs/` updates (self-curation contract).
5. Write Conventional Commit subject (≤72 chars) plus structured body with Verification section citing checks that passed.
6. Commit via HEREDOC. Never stage `.env`, `.env.local`, or build artifacts.
7. Show `git log -1` and `git show --stat HEAD`. Report SHA(s) to user.

Push only if the user also asked to push.
