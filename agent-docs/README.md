# hftr-v2 agent-docs

Canonical living documentation for hftr v2. This directory is the working brain of the project:
all research, decisions, plans, specs, and progress notes live here and MUST be kept current as
implementation proceeds.

## Canonical references (read-only)

- `../DevSpecs/hftr-v2.init.spec.md` — the v2 initializing spec. Never edit.
- `research/v1-reference/` — vendored v1 snapshot (bands, wiki concepts, compliance baseline,
  contract/pipeline code reference). Never edit; see its README.
- `../packages/db/src/seed/catalogs/` — vendored v1 seed catalogs (canonical for v2; edit with
  `catalog_version` bumps).
- **This repository is fully independent of the v1 workspace** — no build, seed, or runtime
  step reads from `/Users/matt-mobile/MATT/web_dev/hftr/`. The external v1 project is
  historical provenance only (D-015); do not reintroduce cross-workspace references.

## Directory map

| Path | Contents |
|---|---|
| `plans/master-build-plan.md` | Phased milestones M0–M6, gates, deliverables, sequencing |
| `plans/m0-sprint-spec.md`, `plans/m1-sprint-spec.md` | Execution-level task breakdowns per milestone |
| `architecture/system-architecture.md` | Full-stack architecture: tiers, boundaries, services, monorepo layout |
| `architecture/data-model.md` | Complete v2 Postgres schema (Neon), entity contracts |
| `architecture/engine-node-family-design.md` | D-042: canvas families, v1→node map, research/Math types, ENGINE specialties |
| `architecture/engine-motherboard-io-design.md` | D-091: ENGINE utility buses, auto-hydration, inter-engine streams, terminal analyzer |
| `architecture/llm-pipeline.md` | Three-tier Claude/Mistral/Groq pipeline, schemas, rate-limit strategy |
| `architecture/job-orchestration.md` | Custom Postgres queue + scheduler design (no vendor lock-in) |
| `architecture/number-handling.md` | Numeric + temporal reference architecture: ValueRef store, calculator, clock/calendar authority, leak linting, Math module |
| `architecture/broker-integration.md` | Broker adapter layer: Alpaca, Kalshi, Polymarket, crypto; funding UX |
| `architecture/research-document-shapes.md` | SystemDocKind rigid shapes + librarian score bands (D-069) |
| `architecture/research-relevance-graph.md` | Typed relevance graph (“basic vector”); pgvector deferred |
| `architecture/research-live-system-cadence.md` | System folder schedules, Analyze vs Sync vs live poll (D-070 / D-111 / D-112) |
| `architecture/research-curation-priors.md` | Weak-supervision LFs / reject-repair priors (D-071) |
| `architecture/research-verified-normalize.md` | Multi-source seal + dual view/report persist (D-072) |
| `product/product-spec.md` | Companies, modules, funds, policies, assistant — full product behavior |
| `ui-ux/ui-spec.md` | Canvas, panels, galaxy + article research view, design system, visual standards |
| `ui-ux/research-galaxy-topic-view-design.md` | D-040 topics, nested library galaxy, hybrid wiki articles, usage telemetry |
| `ui-ux/research-archive-confidence-design.md` | D-047 soft-delete Archive, confidence bands, system chips |
| `ui-ux/research-tab-shelves-inspector-design.md` | D-049 Research tab shelves, entity search, floating Page inspector |
| `ui-ux/canvas-node-dashboard-design.md` | D-026 labeled ports + fixed dashboard card |
| `ui-ux/canvas-engine-group-design.md` | D-028 ENGINE parent groups + Math tools + D-091 motherboard utility rail |
| `ui-ux/canvas-layout-and-dedicated-math-design.md` | D-033 scoped Reflow + dedicated Math ownership and routing |
| `research/v1-carryover.md` | Everything ported from v1: contracts, bands, catalogs, guardrails |
| `testing/README.md` | Testing doc index; `/paper-experiment` workflow map |
| `testing/requirements-matrix.md` | REQ-ID → evidence matrix (paper intent-alignment program) |
| `testing/requirements-matrix.json` | Machine-readable requirements export for CI/agents |
| `testing/scenario-encyclopedia.md` | Deterministic scenario classes for alignment regression |
| `testing/philosophy-axis-taxonomy.md` | Philosophy axes → catalog bands → `LeverSetting` |
| `testing/intent-alignment-scoring.md` | Declared vs observed vector scoring for experiment close-out |
| `research/paper-experimentation-protocol.md` | Paper-only cohort protocol: preflight, provenance, baselines, gates |
| `research/trading-philosophy-guidance.md` | Multi-objective philosophy guidance (axes, prompts, experiment learnings) |
| `research/tech-decisions.md` | Justified technology choices with alternatives considered |
| `ops/security-audit.md` | Pre-release secrets / ownership / live-gate checklist (D-027, D-074) |
| `ops/runbook.md` | Queue drain, credentials, live arming, dead letters |
| `dev-intent/decisions-log.md` | Dated log of user decisions and clarifications |

## Implementation status

The monorepo is scaffolded and verified (2026-07-16): six workspaces (`apps/web`,
`packages/contracts|db|engine|llm|adapters`), typecheck/lint/tests green, `next build` passing.
Each workspace README documents its architecture and major functions; the root `README.md` maps
the layout. Current progress + remaining G0 items: `plans/m0-sprint-spec.md` §Scaffold status.

## Curation contract

1. **Self-curation is mandatory.** Every implementation session that changes behavior must update
   the owning doc(s) in the same change: plans progress, decisions, open questions, schema deltas.
2. **Zero-trust verification.** No claim in these docs or in code is "done" until verified against
   the running system (tests + browser/API verification). Mark unverified claims explicitly.
3. **DevSpecs and v1 are read-only.** All build processes must align with the combined intent of
   the v2 init spec AND the v1 project. When they conflict, `dev-intent/decisions-log.md` records
   the resolution.
4. **Safety invariants are non-negotiable** (carried from v1):
   - The last model-bearing stage is execution-agent compile; dispatch and verification below it
     are deterministic and model-free.
   - Guardrails and verification schemas are immutable at runtime; only weights and bounded-range
     positions inside envelopes are mutable.
   - Paper and live share one engine; live is fail-closed until explicit gates pass.
   - LLMs never handle raw financial numbers or authoritative dates/times: ValueRef handles +
     deterministic calculator/clock/calendar only, with leak linting (digits + datetimes) and
     per-step sanity checks; timestamps allowed as read-only context only
     (`architecture/number-handling.md`).
   - Never enable live-trading behavior in docs or code without explicit gate criteria.
   - Operator API keys / broker secrets never in `jobs.payload`, LLM prompts, or public GET
     APIs — handler-time resolve only (`ops/security-audit.md`, D-027, D-074).
5. **Open questions** get logged in `dev-intent/decisions-log.md` under "Open", with an ID, and
   are resolved (not deleted) when answered.

## Cursor agent workspace

Cursor-native rules, skills, workflows, and commands live in `.cursor/` (see `.cursor/README.md`).
They extend — do not replace — this directory and `AGENTS.md`.

| Invoke | Purpose |
|--------|---------|
| `/continue-build` | Milestone implementation loop |
| `/curate-docs` | Self-curation pass on agent-docs |
| `/verify` | Verify, then invoke commit-message if dirty |
| `/commit-session` | Chunked per-file Conventional Commits |
| `/end-run` | Full end-of-run: verify → curate → commit |
| `/paper-experiment` | Paper-only experimentation cohort workflow |
| `/secrets-audit` | Secrets hygiene audit (no keys in jobs/prompts/APIs) |

**End-of-run sequence:** verify → curate → **invoke `commit-message` skill** (per-file
bodies, chunked) → report (D-018, D-020). Push only when user asks.

Key skills: `session-start`, `agent-docs-curate`, `v1-reference`, `implement-milestone`,
`verify-change`, `pipeline-engine`, `parallel-orchestration`, `paper-experiment`,
`intent-alignment-audit`, `external-integrations`, `secrets-hygiene`, `commit-message`
(under `.cursor/skills/`).

Always-on secrets rule: `.cursor/rules/secrets-hygiene.mdc` (D-027, D-074).
Ops checklist: `ops/security-audit.md`.
