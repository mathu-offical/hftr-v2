---
name: commit-message
description: Generates detailed Conventional Commits for hftr-v2 with structured bodies (Context, Why, What changed, Connections, Verification, Next steps). Use at end of implementation runs after verification passes, when staging changes, or via /commit-session.
---

# hftr-v2 commit messages

Rule: `.cursor/rules/git-commits.mdc`

## End-of-run trigger

Run this skill **automatically** when:

- An implementation run finished and verification passed
- `git status` shows uncommitted changes from the run
- You are about to end a session with verified work still unstaged

A run is **not complete** until verified changes are committed (push is separate — user must ask).

## Step 1 — Gather context

Run in parallel:

```bash
cd /Users/matt-mobile/MATT/web_dev/hftr-v2
git status --short
git diff --stat
git diff --staged --stat
git log --oneline -8
```

Identify: primary intent, touched packages, whether agent-docs/plans/decisions should be included.

## Step 2 — Split or batch

| Situation | Action |
|-----------|--------|
| Unrelated domains in diff | **Split** into multiple commits (contracts → db → engine → web) |
| Code + owning agent-docs | **Same commit** (self-curation) |
| Migration + schema usage | **Same commit** |
| Only `.cursor/` or `agent-docs/` | `docs(cursor)` or `docs(agent-docs)` |

Never stage secrets or build artifacts. Confirm `.gitignore` covers them.

## Step 3 — Choose type and scope

Use scope table in `git-commits.mdc`. Examples:

| Change | Subject |
|--------|---------|
| New API route for trends | `feat(api): add company trends list endpoint` |
| Queue drain fix | `fix(queue): recover expired leases before claim` |
| Leak-lint rejection | `fix(calc): reject datetime patterns in model output` |
| M1 canvas node UI | `feat(canvas): render module type chip and status line` |
| Sprint doc progress | `docs(plans): mark M1 queue spine items complete` |
| Cursor parallel-subagents rule | `chore(cursor): add git commit message standards` |
| Drizzle migration 0004 | `feat(db): add watchlist_access table` |

Subject ≤ **72 chars**. Imperative mood. No trailing period.

## Step 4 — Write structured body

Required sections (in order) for any non-trivial commit:

### Context
- User request or session goal (one line)
- Milestone/gate if applicable: `M1`, `G1`, `M3 paper loop`, etc.

### Why
- Safety invariant, architecture boundary, or product behavior driving the change
- For trading/pipeline: note model-free boundary, ValueRef, fail-closed if relevant

### What changed
Group by path prefix; one bullet per logical unit:

```text
- packages/engine/src/handlers/trend.ts: emit trend job handler
- packages/db/src/schema/research.ts: trends table + indexes
- apps/web/app/api/companies/[companyId]/trends/route.ts: GET handler
```

For large diffs, use `git diff --name-status` abbreviated list.

### Connections
```text
- agent-docs: architecture/data-model.md, plans/m1-sprint-spec.md
- decisions: D-012 (if new decision logged this commit)
- plans: m1-sprint-spec §queue spine — 2 items checked
```

### Verification
Be honest — mark unverified explicitly:

```text
- pnpm typecheck ✓
- pnpm --filter @hftr/engine test ✓ (42 passed)
- IronBee browser: /companies/[id] canvas loads, no console errors ✓
```

### Next steps
```text
- wire right panel ledger to dispatch traces (OQ-7 unrelated)
- none
```

## Step 5 — Pre-commit checks

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Skip tests only for pure docs/config with zero runtime claims. Record skip reason in Verification.

## Step 6 — Stage and commit

Stage **only** files for this logical change:

```bash
git add path/to/file1 path/to/file2
git commit -m "$(cat <<'EOF'
<type>(<scope>): <imperative summary under 72 chars>

Context
- ...

Why
- ...

What changed
- ...

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

## Step 7 — Verify commit

```bash
git log -1 --format=full
git show --stat HEAD
```

Confirm subject length, section order, and no secrets in diff.

## Anti-patterns (reject these)

```text
BAD  Update data model and system architecture documentation...
BAD  fix bug
BAD  feat: stuff
BAD  chore: update files
GOOD feat(db): add module_links kind enum for canvas edges
GOOD fix(engine): fail-closed when leak-lint finds digits in compile output
```

## Multi-commit session order

1. `feat(contracts): ...`
2. `feat(db): ...` (depends on contracts)
3. `feat(engine): ...`
4. `feat(api): ...` + `feat(web): ...` (may parallel if independent)
5. `docs(agent-docs): ...` only if docs weren't bundled with code commits

## Breaking changes

Add footer after body:

```text
BREAKING CHANGE: module_links.kind values renamed; run migration 0004 and update canvas client.
```
