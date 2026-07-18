---
name: parallel-orchestration
description: Decomposes hftr-v2 work into parallel Cursor sub-agent tasks with composer-2.5, high-specificity prompts, and parent verification. Use when a task spans multiple packages, domains, or independent research/implementation tracks.
---

# Parallel orchestration

Use when work has **2+ independent tracks**. Rule: `.cursor/rules/parallel-subagents.mdc`.

## Step 1 — Decompose

Split by package, layer, or read-only vs write. Draw dependencies:

```
contracts (seq) → db + engine (parallel after contracts) → web (after both)
```

Only parallelize items with **no write dependency** on each other.

## Step 2 — Write prompts

Each Task prompt must include: goal, absolute paths, constraints, do/do NOT, verification,
return format. See template in `parallel-subagents.mdc`.

## Step 3 — Launch

```text
Task tool settings (every sub-agent):
  model: "composer-2.5"
  run_in_background: true   # when parallel
  subagent_type: explore | generalPurpose | shell | ...
```

Launch all independent tasks in **one parent message**.

**Never** use Grok models for sub-agents.

## Step 4 — Verify & merge

1. Await all sub-agents
2. Re-read claimed file changes
3. Resolve conflicts
4. Run parent-level integration tests + browser verification
5. Update agent-docs once (self-curation)
6. **Commit immediately** verified changes (`commit-message` skill, D-134) before reporting done —
   do not wait for the user to ask

## Example: M1 canvas + queue

**Sequential:** contracts for `ModuleNode` schema first.

**Parallel (after contracts):**
- Sub-agent A (`generalPurpose`): `packages/db` migration + queries
- Sub-agent B (`generalPurpose`): `apps/web` React Flow canvas shell
- Sub-agent C (`explore`): v1 canvas patterns read-only audit

Parent: wire API, verify browser flow, update sprint spec.
