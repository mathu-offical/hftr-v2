# Agent-Docs Curation Workflow

Self-curation pass for hftr-v2 living documentation.

## When to run

- End of substantial implementation session
- Milestone gate review
- Suspected doc/code drift
- User invokes `/curate-docs`

## Steps

1. Read `.cursor/skills/agent-docs-curate/SKILL.md` and follow all steps
2. Triangulate agent-docs against code, v2 DevSpecs, and v1 references
3. Make surgical updates to owning docs
4. Resolve or log open questions (OQ-n)
5. Confirm no edits to read-only paths (DevSpecs/, v1/)

## Gate-specific curation

At milestone gates also update:
- `plans/master-build-plan.md` — milestone status
- Active sprint spec — checkbox progress
- `dev-intent/decisions-log.md` — gate review entry

## Verification

After curation, spot-check that README directory map matches actual tree.
