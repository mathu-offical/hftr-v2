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

- **D-011 (scaffold implementation, 2026-07-16):** Full monorepo scaffolded and verified
  (typecheck/lint/25 tests/next build green). Deviations from plan, all low-risk:
  (a) `policy` and `math` added to the modules type enum — policy nodes are lightweight modules
  binding policy envelopes, resolving the canvas "trading → trading policies" column against
  the schema; (b) the numeric/temporal store + exchange_calendars schema and the calc/clock/
  calendar/queue engine cores were pulled forward from M2 into the scaffold so contracts and
  routes could be typed against them from day one; (c) LLM providers are implemented over plain
  `fetch` (Anthropic Messages; Mistral/Groq OpenAI-compatible) instead of SDKs to keep the
  dependency surface minimal; (d) contracts export raw TS (`./src/index.ts`) transpiled by
  consumers rather than a tsup build step — simpler until an external consumer exists.
  Remaining G0 items listed in `plans/m0-sprint-spec.md` §Scaffold status.

- **D-012 (application build session, 2026-07-16):** Fresh Neon project `hftr-v2`
  (bold-surf-86557348, per D-006) created via MCP; migrations applied; XNYS calendar seeded.
  Dev-only auth bypass added (`DEV_AUTH_BYPASS=1`): active only when Clerk is unconfigured AND
  NODE_ENV != production; production without Clerk keys fails closed. M1 canvas/CRUD/queue
  spine implemented and verified against the running app (see m1-sprint-spec §Progress).
  Clerk dashboard keys remain a user action (OQ-7).

- **D-013 (sub-agent orchestration, 2026-07-16):** Cursor workspace rules require parallel
  sub-agent delegation for independent multi-package/domain work. All Cursor sub-agents must
  use `composer-2.5`; Grok models (`cursor-grok-*`) are forbidden for sub-agents. Sub-agent
  prompts must be high-granularity (absolute paths, constraints, verification, return format).
  Parent re-verifies all sub-agent output. Distinct from product Groq execution-tier LLM.
  Rule: `.cursor/rules/parallel-subagents.mdc`.

- **D-014 (paper dispatch spine, 2026-07-16):** The deterministic tail of the pipeline
  (instruction → gauntlet → task → paper fill → trace → verification → ledger) was pulled
  forward from M2 as an operator-initiated path (`OPERATOR_INPUT` authority): trading modules
  expose a paper-trade form; the route enqueues `dispatch.paper_trade` on the DISPATCH queue
  and drains inline for immediate UX. New tables: `action_instructions`, `deterministic_tasks`,
  `action_traces` (append-only), `verification_records` (append-only), `ledger_entries`
  (append-only; balance = seed + sum, never mutated). Quotes come from a deterministic
  `synthetic_sim` source (per-symbol base + bounded per-minute walk), recorded as `live_feed`
  ValueRefs with `sourceId: synthetic_sim:*` and honest `feedClass` labeling — swapped for
  Alpaca IEX later with no downstream change. Company balance projection and an Activity right
  rail (ledger + traces + verification chips) shipped with it. Trend/lead/decision-tree tables
  still land with the LLM pipeline milestone.

- **D-015 (v1 independence, 2026-07-16):** User directive — v2 must be fully independent of
  the v1 workspace; anything v2 uses from v1 must live inside this repository. Executed:
  (a) all nine seed-catalog JSONs vendored to `packages/db/src/seed/catalogs/` (canonical for
  v2; edit in place with `catalog_version` bumps, never re-sync from v1); (b) reference
  material vendored to `agent-docs/research/v1-reference/` (band + tool catalogs, compliance
  baseline, DevSpecs audit, five wiki concept pages, v1 contracts + pipeline-node code
  snapshots — reference only, excluded from builds); (c) `.cursor` rules/skills, `AGENTS.md`,
  `agent-docs/README.md`, seed READMEs, and `v1-carryover.md` repointed to in-repo paths.
  Verified: no package code, config, or script references the v1 workspace path; typecheck,
  lint, tests, and build unaffected.

- **D-016 (positions, catalogs-in-DB, trend scan, templates, info rail, 2026-07-16):**
  Continued build session. (a) `positions` table maintained only by the dispatch layer at
  fill time (average-cost basis, whole units, realized PnL accumulated on sells); paper v1
  forbids shorting — sells over held quantity are blocked with `broker_policy_block`.
  (b) The nine vendored catalog JSONs are now seeded into a generic `catalog_entries`
  table (97 entries, `v1_snapshot_2026_07_16`); the strategy-family picker in the trading
  inspector reads from `/api/catalogs/strategy_families`. (c) Deterministic `trend.scan`
  handler (RESEARCH queue) computes quote drift over a lookback window, records it as a
  bps ValueRef, and emits `trend_candidates` honestly labeled `deterministic_scan` — the
  LLM tiers will later write `model_nominated` rows to the same table. (d) Company
  templates (`blank`, `day_trading_starter`, `trend_research_lab`) in
  `packages/contracts/src/templates.ts`; template module configs are contract-tested
  against `MODULE_CONFIG_SCHEMAS`. (e) Canvas nodes poll a server-composed per-module
  status projection (`GET .../canvas`, text-first). (f) The right rail is now a tabbed
  info panel: Activity / Positions (mark-to-market vs synthetic quotes) / Trends /
  Values (Math-module ValueRef audit with source + lineage). Verified end-to-end in the
  browser with a real Clerk account: templated company creation, trend scan, buy 10 AAPL,
  sell 4 (balance and position updated correctly), oversell blocked at the engine level.

## Open questions

- **OQ-7 (resolved 2026-07-16):** Clerk dev-instance keys added to `apps/web/.env.local`;
  the dev bypass self-deactivates (it requires Clerk to be unconfigured). Clerk-hosted
  sign-up UI verified rendering; full automated sign-up E2E pending (Clerk bot protection
  blocks scripted account creation — verify manually or with Clerk testing tokens).

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
