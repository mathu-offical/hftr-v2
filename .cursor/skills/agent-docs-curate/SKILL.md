---
name: agent-docs-curate
description: Curates hftr-v2 agent-docs against code, DevSpecs, and v1 references. Detects drift, updates plans/decisions/architecture docs, resolves or logs open questions. Use when docs drift, at milestone gates, via /curate-docs, or after substantial implementation sessions.
---

# hftr-v2 agent-docs curation

Adapted for hftr v2's doc layout (see `agent-docs/README.md`). Surgical edits only — no wholesale rewrites.

## Step 1 — Load context

1. Read entire `agent-docs/` tree
2. Read `DevSpecs/hftr-v2.init.spec.md` (read-only)
3. Skim relevant v1 docs if carryover is in scope (`research/v1-carryover.md`)

## Step 2 — Triangulate

Priority: **code** > **v2 DevSpecs** > **v1 canonical** > **user chat** > **agent-docs**

Flag:
- Contradictions between docs
- Claims not traceable to code or canonical specs (hallucination candidates)
- Stale doc sections vs current repo state
- Missing coverage for shipped or in-progress features

## Step 3 — Update owning docs

| Signal | Action |
|--------|--------|
| Behavior changed | Update product/architecture/ui-ux doc |
| Schema changed | Update data-model.md + note in carryover if v1 mapping shifted |
| Decision made | Add D-nnn to decisions-log.md |
| Unresolved conflict | Add OQ-n (do not delete when answered — resolve in place) |
| Milestone progress | Update master-build-plan.md + sprint spec checkboxes |
| Tech choice | Add TD-nn to tech-decisions.md with alternatives + verification status |
| v1 port completed | Update v1-carryover.md mapping/status |

## Step 4 — Open questions

Format in `dev-intent/decisions-log.md`:

```markdown
- **OQ-n (YYYY-MM-DD):** Question text. Context: …
```

Resolve by adding decision under Decisions section; mark OQ resolved inline.

## Step 5 — Verify

- No edits to DevSpecs/ or v1 paths
- README directory map still accurate
- Unverified claims marked explicitly until runtime-verified

## Anti-patterns

- Do not duplicate DevSpecs content into agent-docs — link and interpret
- Do not delete historical decisions or resolved OQs
- Do not claim milestone gates passed without verification evidence
