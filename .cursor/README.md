# hftr-v2 — Cursor Agent Workspace

Cursor-native agent layer for hftr v2. **Does not replace** `AGENTS.md`, `DevSpecs/`, or
`agent-docs/` — mirrors and extends them for Cursor (`.mdc` rules, skills, workflows, commands).

## Source hierarchy

| Layer | Path | Role |
|-------|------|------|
| Master rules | `AGENTS.md` | Project-wide constraints (auto-loaded) |
| v2 init spec | `DevSpecs/hftr-v2.init.spec.md` | Canonical v2 user spec — **read-only** |
| v1 reference | `agent-docs/research/v1-reference/` + `packages/db/src/seed/catalogs/` | Vendored v1 snapshot — **read-only** (external v1 workspace is history only, never a dependency) |
| Living docs | `agent-docs/` | Research, decisions, plans, architecture truth — **self-curate** |
| Cursor rules | `.cursor/rules/` | Always-on and file-scoped rules (`.mdc`) |
| Cursor skills | `.cursor/skills/` | Task-specific agent skills (`SKILL.md`) |
| Cursor workflows | `.cursor/workflows/` | Step-by-step playbooks |
| Cursor commands | `.cursor/commands/` | Slash commands |

Full index: `.cursor/rules/agent-sources.mdc`

## Layout

```
.cursor/
├── README.md           # This file
├── rules/              # Always-on and file-scoped rules (.mdc)
├── skills/             # Task-specific agent skills (SKILL.md)
├── workflows/          # Step-by-step workflow playbooks
└── commands/           # Slash commands
```

## Cursor rules

| Rule | Scope |
|------|-------|
| `agent-sources.mdc` | Always apply — master index of all agent sources |
| `canonical-readonly.mdc` | Always apply — DevSpecs + v1 read-only contract |
| `self-curation.mdc` | Always apply — agent-docs mandatory update contract |
| `hftr-safety-invariants.mdc` | Always apply — trading/LLM pipeline safety |
| `zero-trust-verification.mdc` | Always apply — verify before claiming done |
| `parallel-subagents.mdc` | Always apply — parallel delegation, composer-2.5, never Grok |
| `git-commits.mdc` | Always apply — per-file bodies, chunked commits, end-of-run mandatory |
| `architecture-monorepo.mdc` | `packages/**`, `apps/**` |
| `typescript-standards.mdc` | `**/*.{ts,tsx}` |
| `ui-ux-standards.mdc` | `**/*.{tsx,css}` |
| `number-handling.mdc` | `packages/{engine,llm,contracts}/**` |
| `ironbee-devtools-use.mdc` | Always apply — browser verification via IronBee DevTools |

## Cursor skills

| Skill | When to use |
|-------|-------------|
| `session-start` | Start of any substantial build task |
| `agent-docs-curate` | Doc drift, milestone close, `/curate-docs` |
| `v1-reference` | Port contracts, bands, guardrails from v1 |
| `implement-milestone` | Build a master-plan slice |
| `verify-change` | Zero-trust verification before finishing |
| `pipeline-engine` | Engine, dispatch, verification, bands/levers work |
| `parallel-orchestration` | Multi-package/domain parallel sub-agent delegation |
| `commit-message` | **MANDATORY end-of-run** — inventory files, chunk, per-file commit bodies |
| `paper-experiment` | Paper-only cohort runs with preflight, provenance, intent audits |
| `intent-alignment-audit` | Score declared vs observed vectors; hard fail on cap violations |

## Cursor workflows

| Workflow | Purpose |
|----------|---------|
| `session-start.md` | Context load + milestone alignment |
| `implement-milestone-slice.md` | Spec → plan → implement → verify loop |
| `agent-docs-curate.md` | Self-curation pass |
| `verify-and-ship.md` | Verify → curate → invoke commit-message → report |
| `end-of-run.md` | **Mandatory** close: verify + chunked per-file commits |
| `commit-session.md` | Alias of end-of-run commit phase |
| `paper-experiment-run.md` | Paper cohort: session-start → paper-experiment → end-of-run |

## Slash commands

| Command | Invokes |
|---------|---------|
| `/continue-build` | Milestone implementation loop |
| `/curate-docs` | agent-docs curation |
| `/verify` | Verify, then invoke commit-message if dirty |
| `/commit-session` | Chunked per-file Conventional Commits |
| `/end-run` | Full end-of-run: verify → curate → commit |
| `/paper-experiment` | Paper-only experimentation cohort workflow |

## Product goals (quick reference)

hftr v2 is a functional rebuild of v1's trading/research platform:

- **Companies** on a React Flow canvas: research → data → trend → trading → policy modules
- **Three panels**: left (research/data), bottom (control), right (execution/simulation)
- **LLM tiers**: Claude (strategic) ← Mistral (orchestration) → Groq (compile) → deterministic core
- **Auth/payments**: Clerk + Stripe (credits/subscriptions; never brokerage money)
- **Safety**: ValueRef number handling, fail-closed live gates, model-free dispatch

Full detail: `agent-docs/product/product-spec.md`, `DevSpecs/hftr-v2.init.spec.md`.

## Current milestone

See `agent-docs/plans/master-build-plan.md` for M0–M6 gates and active sprint specs.
