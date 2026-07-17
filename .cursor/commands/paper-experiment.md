Run a paper-only experimentation cohort with preflight, provenance, and intent-alignment audits.

**Sources:** `.cursor/workflows/paper-experiment-run.md`, `.cursor/skills/paper-experiment/SKILL.md`

1. Invoke `session-start` — confirm milestone and read `agent-docs/research/paper-experimentation-protocol.md`.
2. Follow `paper-experiment` skill: preflight (mode=paper, no live path) → cohort → audits → triage → curate.
3. Multi-company: `parallel-orchestration` with composer-2.5 sub-agents per company.
4. Close via `end-of-run` — verify, commit-message, report.

Fail-closed on live mode, live credentials, or live gate bypass.
