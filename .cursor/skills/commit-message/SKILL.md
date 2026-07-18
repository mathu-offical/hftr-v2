---
name: commit-message
description: MANDATORY after every hftr-v2 session and after every verified update. Analyzes every dirty file via git diff, plans logical commit chunks, writes per-file Conventional Commit bodies. Invoke when verification passes, when ending a turn with dirty files, via /commit-session or /end-run.
---

# hftr-v2 commit messages (every session + every verified update)

Rule: `.cursor/rules/git-commits.mdc` | Decision: **D-134**

> **You MUST read and follow this entire skill** after every verified update and before
> ending any session/turn that modified files. Uncommitted verified work = incomplete session.
> Do **not** wait for the user to ask — workspace policy requires the commit.

## Step 0 — Gate

| Condition | Action |
|-----------|--------|
| `git status` clean | Done — report no commit needed |
| Verification failed | Fix first — do not commit broken state |
| Only secrets/artifacts dirty | Leave unstaged — report why |
| Verified code/docs dirty | **Continue steps 1–8 immediately** |
| Docs/rules-only dirty (no runtime claims) | Continue steps 1–8 (tests may be skipped with reason) |

## Step 1 — Inventory every changed file

```bash
cd /Users/matt-mobile/MATT/web_dev/hftr-v2
git status --short
git diff --name-status
git diff --stat
git log --oneline -5
```

For **each** path in the output, note:
- Status: `M` `A` `D` `R`
- Package/domain: contracts | db | engine | api | web | cursor | agent-docs | …
- One-line: what changed in **this file specifically**

If >15 files, still list all in chunk plan; read `git diff path` for any file you cannot explain.

## Step 2 — Plan chunks (write before staging)

Produce an explicit chunk plan in your response **before** any `git add`:

```text
PLANNED COMMITS:
1. feat(db): migration + schema — [file1, file2, file3]
2. feat(api): routes — [file4, file5]
3. feat(panels): UI — [file6, file7, file8]
```

Chunk rules:
- One logical intent per commit; dependency order (contracts → db → engine → api → web)
- Never mix unrelated domains (db + canvas UI = two commits)
- Code + owning agent-docs = same commit when same intent

## Step 3 — Per-chunk: analyze files

For each chunk, before staging:

```bash
git diff --name-status -- path1 path2 ...
git diff --stat -- path1 path2 ...
```

For each file in the chunk, draft a **Files changed** bullet:

```text
- apps/web/components/panels/BottomPanel.tsx: added watchlist fetch via SWR,
  module scope filter, create form — bottom panel CRUD per ui-spec
```

**Requirements per bullet:**
- Full repo-relative path (required)
- What changed: component, function, table, route, rule (specific)
- Why: ties to user intent, spec, or architecture (required)
- No vague words: "updated", "improved", "enhanced", "refactored" alone

## Step 4 — Choose type, scope, subject

Subject ≤ **72 chars**. Imperative. One scope per commit.

| Bad subject | Good subject |
|-------------|--------------|
| Enhance project documentation and configuration… | `chore(cursor): add per-file commit body standards` |
| Update data model and system architecture… | `feat(db): add watchlist_items for bottom panel` |
| fix bug | `fix(queue): recover expired job leases before claim` |

## Step 5 — Write full body (never truncate)

Every commit uses **all six sections** in order:

1. **Context** — user request, milestone (M0–M6), gate
2. **Why** — product/safety/architecture rationale
3. **Files changed** — **one bullet per staged file** (see Step 3)
4. **Connections** — agent-docs paths, D-nnn, sprint spec refs
5. **Verification** — exact commands + pass/fail for this chunk
6. **Next steps** — follow-ups or `none`

**Cross-check:** count staged files (`git diff --cached --name-only | wc -l`) must equal
bullet count under `Files changed`. Mismatch = fix message before committing.

## Step 6 — Pre-commit checks

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Docs-only `.cursor/` or `agent-docs/` chunks: state skip reason in Verification.

## Step 7 — Stage and commit (HEREDOC only)

```bash
git add path/to/file1 path/to/file2
git commit -m "$(cat <<'EOF'
<type>(<scope>): <subject under 72 chars>

Context
- ...

Why
- ...

Files changed
- path/file1: what — why
- path/file2: what — why

Connections
- agent-docs: ...
- decisions: ...
- plans: ...

Verification
- ...

Next steps
- ...

EOF
)"
```

Repeat for **each chunk** until `git status` is clean (except forbidden paths).

## Step 8 — Verify and report

```bash
git log -n <chunk-count> --oneline
git show --stat HEAD   # per chunk if needed
```

Report to user:
- Each SHA + subject
- File count per commit
- Confirmation working tree clean
- Anything left unstaged and why

## Anti-patterns (reject and rewrite)

```text
FORBIDDEN  Single-line paragraph commit body
FORBIDDEN  Subject >72 chars used as entire message
FORBIDDEN  "What changed: various files in apps/web"
FORBIDDEN  "Updated documentation and components"
FORBIDDEN  Files changed with 2 bullets for 8 staged files
REQUIRED   N bullets under Files changed for N staged files
```

## Multi-commit session order

1. `chore(config)` / `chore(cursor)` — tooling, gitignore
2. `refactor(contracts)` / `feat(contracts)`
3. `feat(db)` — schema + migration together
4. `feat(engine)` / `feat(api)`
5. `feat(web)` / `feat(canvas)` / `feat(panels)` / `feat(shell)`
6. `docs(agent-docs)` — only if not bundled with code

## Breaking changes

Footer after body:

```text
BREAKING CHANGE: <what broke> — <migration path>
```
