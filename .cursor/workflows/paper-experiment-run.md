# Paper Experiment Run Workflow

Paper-only experimentation cohort: preflight → run → audits → close.

## Sequence

```
session-start → paper-experiment skill → end-of-run
```

## Step 1 — Session start

`.cursor/skills/session-start/SKILL.md` — load milestone, safety invariants, protocol docs.

## Step 2 — Paper experiment

`.cursor/skills/paper-experiment/SKILL.md` — full checklist:

scenario brief → paper-only preflight → run cohort → provenance audit → intent-alignment audit → triage → curate docs.

## Step 3 — End of run

`.cursor/workflows/end-of-run.md` — verify (including paper experiment checks) → curate → invoke `commit-message` → report.

Push only if user explicitly asks.
