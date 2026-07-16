# hftr-v2 Decisions Log

Dated record of user decisions, clarifications, and open questions. IDs are stable once created.

## Decisions

### 2026-07-16 — Initial planning session

- **D-001 (Stripe/funding boundary):** Stripe never funds brokerage accounts. Real funds stay at
  the broker; the app provides easy broker connection, easy paper↔live switching per company,
  and easy UI-facing fund-adding once a broker is connected (deep-link funding for MVP).
  Stripe covers subscriptions, credits (LLM budget + paper seeds).
- **D-002 (broker scope):** "As many full real connections as possible." Rollout order:
  paper sim → Alpaca (paper→live) → Kalshi → Polymarket → Coinbase. See broker-integration.md.
- **D-003 (LLM tiers):** Claude = top/strategic deep analysis invoked selectively by Mistral;
  Mistral = tactical/orchestration bulk + assistant; Groq = execution compile/format.
  Deterministic below execution (v1 invariant).
- **D-004 (canvas aesthetic):** Hybrid — clean modern node-graph primary, playful animated
  character/activity touches inside nodes (v1 office charm, contained).
- **D-005 (job infra):** Custom-as-possible, stable, no further vendor lock-in → self-owned
  Postgres SKIP LOCKED queue (job-orchestration.md). Inngest/Trigger.dev/Vercel Workflow rejected.
- **D-006 (database):** Fresh Neon Postgres with clean v2 schema; carry contracts, not tables.
- **D-007 (galaxy view):** 3D galaxy research visualization is an MVP signature feature
  (react-force-graph-3d), with 2D fallback and a documented performance escalation ladder.

- **D-008 (number handling, 2026-07-16):** Spec §NUMBER HANDLING added. LLMs never handle raw
  financial numbers: values travel as opaque ValueRef handles from live sources into an
  append-only k/v store; all math runs through a deterministic calculator (fixed-point, unit
  algebra, sanity gauntlet); models select operations/band positions and reason over
  qualitative descriptors; a numeric leak linter rejects digits in model outputs. Surfaced to
  users as an auto-created Math module per company. Full design:
  `architecture/number-handling.md`. Promoted to a workspace safety invariant (AGENTS.md).

- **D-009 (time/date handling, 2026-07-16):** Temporal values join the numeric invariant.
  Dates/times/durations MAY appear in LLM context as read-only orientation (temporal
  orientation block: current timestamp + session phase + descriptors), but any temporal value
  relied upon for output flows through the deterministic pipeline: injectable clock authority,
  market calendar service (venue sessions/holidays/DST, session-legality inputs), temporal calc
  ops, temporal kinds in the ValueRef store, and datetime patterns in the leak linter.
  Externally verified rationale: LLM temporal-reasoning benchmarks (Test of Time, PRIMETIME,
  TicToc/"temporal blindness") show unreliable date arithmetic (as low as 13% on durations) and
  poor elapsed-time awareness even with timestamps provided. Design in
  `architecture/number-handling.md` §4c.

- **D-010 (workspace curation, 2026-07-16):** Cursor agent workspace seeded per init spec
  §Workspace curation. `.cursor/` holds rules (`.mdc`), skills, workflows, and slash commands
  mirroring `AGENTS.md` + agent-docs. DevSpecs and v1 remain read-only; self-curation,
  zero-trust verification, and IronBee browser verification are enforced via always-on rules.
  Index: `.cursor/README.md`.

## Open questions

- **OQ-1 (open):** Credit pack pricing and subscription tier pricing — needs user input before M4.
- **OQ-2 (open):** Criteria/timing for adding a dedicated always-on worker for market-hours
  watchers — decide with M3/M5 latency data.
- **OQ-3 (open):** Alpaca Broker API correspondent relationship for in-app ACH funding —
  post-launch consideration.
- **OQ-4 (open):** Whether to run a one-time import of any v1 database content (currently
  assumed: no; only v1 JSON catalogs are seeded).
- **OQ-5 (open):** Polymarket wallet/key custody design before that adapter ships.
- **OQ-6 (open):** Dashboard/diagnostics slide direction conflict from v1 DevSpecs (top vs
  bottom) — v2 resolves via the three-panel model; confirm no separate diagnostics slide needed.
