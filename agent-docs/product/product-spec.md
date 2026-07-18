# hftr-v2 Product Specification

## 1. Core loop

A user creates a **Company**, seeds it with funds (credits for paper; broker balance for live),
composes a graph of **Modules** on the canvas, sets **policies**, and starts the pipeline.
Research feeds libraries; trends translate research + live data into directives; trading modules
turn directives into verified executions; results feed back into research and training. The user
watches, steers, and approves through the canvas + three panels + the assistant.

## 2. Companies

- Fields: name, philosophy prompt, **structured philosophy profile** (slideable axes →
  bounded-range lever positions; D-025), trading goals, re-investment strategy, scoping
  policies, mode (paper|live), seed amount, per-module allocations (manual or auto), broker
  connection.
- Company policies bound everything downstream: risk bands, session allowances, approval
  thresholds for fund movements, LLM budget tier. Philosophy axes deterministically affect
  promote/compile sizing and control snapshots; free-text never supplies raw sizes or times.
- A user can own many companies; each company is one canvas.
- **Companies directory (implemented):** each card shows **paper|live** mode (text-first badge),
  included **engine** labels (`engine_instances`), **Seed** and **Current value** equity lines
  (tabular numerals; `Stale` / `Unavailable` text when applicable — color reinforces only), and
  navigates to `/companies/:id`. Equity is the materialized `companies.equity_*` projection
  (hard cash + confirmed open marks); cards never call brokers. Card menu:
  rename (`PATCH`), soft-delete/archive (`DELETE`), and **duplicate**
  (`POST .../duplicate`) which copies canvas topology (engines, modules, links) into a new
  **paper** company in one atomic database batch. Duplication never copies capital, allocations,
  ValueRefs, source-library IDs, auto-funding, live arming, or broker bind; topology-local module
  IDs are remapped and non-Math modules return to `draft` for explicit operator review. Runtime
  artifacts (traces, jobs, libraries) stay on the source. **Archive is fail-closed:** one atomic
  batch sets `archived_at`, forces `mode=paper`, clears live arming/evidence and broker bind,
  disables company `job_schedules`, and pauses active modules. Scoped company APIs and
  `resolveExecutionContext` treat archived companies as not found; schedule materialization skips
  archived company schedules.
- **Company creation (D-024 + D-043 + D-106):** engine-centric. Create requires **≥1 ENGINE**; operators
  add/remove engines freely (Create/Skip blocked at zero). Each engine is its own card with
  inline **basic definition** (template inputs + shared topic/capital/exit — same contract as
  module-store insert). Capital defaults cascade as an equal split of paper seed across
  capital-bearing members; overall exit defaults to one week ahead (D-035). Optional standalone
  modules may be added outside engines. **Sector groups (D-106):** create picks broad groups
  only; all group specifics expand into `companies.sector_focuses` by default. Company drawer
  **Sectors** tab refines by deselecting specifics (narrow-only) and curates separate
  `universe_excludes` ticker carve-outs. Preset `overlapPeers` / shared seed targets are
  intentional confirmation signals. Cap = full catalog. Missing fields validate in place with per-field
  **Required · label** chips and warning borders; confirmed fields use neutral borders and
  subtle in-field green checks. **Skip setup & open canvas** still applies default capital/
  exit cascades; topic/sector stays operator-required on-canvas until filled.
- Day trading / trend research / specialty packs appear as **add buttons** in a compact
  two-column **Research | Execution** strip above a create-form **canvas preview** (template
  module graph + links; dashed edges for research deps). Choosing an **execution** engine
  auto-adds research dependency packs and **cascades topic/capital/exit live** into those
  seeds (`cascadedFromKey`). Gated engines appear as **Locked · …**. Setup edits happen in the
  selected-engine inspector. `EXECUTION_ENGINE_RESEARCH_DEPENDENCIES` drives auto-add. The API
  seeds solely from `engines` (+ optional `extraModules`) after provisioning the company Math
  hub. Module store remains the path for insertable engines after create
  (crypto/prediction/HFT listed with honest gating reasons). Scope fields use
  `pending_operator_scope` until operator setup. Allocation and exit resolve through
  ValueRefs and temporal refs per `architecture/number-handling.md`.
- **ENGINE groups (D-028 / D-091):** each inserted engine persists as an `engine_instances` row with
  `master_topic_sectors` that cascade to member modules (`engine_instance_id`) unless a member
  overrides (`topic_sectors_overridden`). React Flow renders a structural parent group chrome
  (not a module type) with D-089 **header inline** setup fields and D-091 **motherboard utility
  rail** (typed buses for data, clock, funds, control; inter-engine streams on `data_out→data_in`).
  Delete offers cascade (remove members) or ungroup (keep modules). Math modules are never engine
  members; they attach as repeatable multi-consumer TOOL links or motherboard-attached dedicated
  docks (D-033). Auto-hydration on insert: clock utility bind, terminal research analyzer, source-derived
  library names, funds topology for execution engines. D-091 motherboard I/O (utility links
  migration `0037`, API, chrome rail, auto-hydration) **implemented**.

## 3. Modules (user-creatable, multi-instance)

Canvas ordering left→right: research → data (libraries + live APIs) → trend → trading → policies.

**Default seeded trading engines (canonical 2026-07-17):** paper-safe topology follows
research modules → data modules (evidence/history library + live/runtime feed) → trend modules →
trading module, with fund source (`holding_fund`) → Math module → fund router feeding the trading
desk and policy verification modules (`analyzer` transaction monitor + `policy` trading policy).
All default node names describe actual function. Fund/router nodes are **visible topology only** in
M1 — deterministic fund movement is not implemented by this slice (D-023).

### Research modules (model-bearing, curious)
- Autonomous agents building tagged concept databases; opportunistic multi-source gather
  (Brave Search, SEC EDGAR filings, market/news feeds) plus model-free validation before
  optional strategic synthesis (D-039).
- **Subtypes (D-042):** `external_web`, `external_filings`, `external_market_news`,
  `specialty_desk`, `event_catalyst`, `crypto_onchain_context`, `prediction_niche` — set via
  `config.researchSubtype`; specialty packs seed with matching execution/research ENGINEs.
- Config: topic scope, curiosity level (exploration vs exploitation ratio), cadence, target
  libraries, source allowlist/blocklist, **admission mode** (`auto_admit_validated` default or
  `require_operator_approval`).
- Query origins: manual operator query, module-auto from linked trend/promote events,
  company-wide sweep, research cadence schedule.
- Output: evidence packages → validated concepts + tags + typed links (galaxy graph); library
  curation as `auto_admitted` or `proposed` per admission mode.
- **Topics (D-040 / D-126):** agent-created (or seeded) **research points** that organize
  focus and may spawn articles/libraries. They are **not** galaxy nodes and are **distinct
  from seeded library knowledge** (catalog concepts live in the Seeded trading mechanisms
  nest). Company bootstrap seeds **Current awareness** (regime / macro / news) plus one
  **Sector · {focus}** point per `sectorFocuses`, and a thin library-overview topic for the
  Libraries Overview link — not catalog class mirrors. Topics own ordered memberships and a
  hybrid article; research/librarian curation keep graph + article + library membership coherent.
- **Usage telemetry (D-040):** topics and concepts track `query_count` / `last_queried_at` and
  `reference_count` / `last_referenced_at` for retrieval ranking, librarian prioritization,
  cadence, and visual weight — not display-only.
- Progress / UI: left-panel topics list → main overlay **Galaxy | Article** tabs; nested
  library galaxy; topic focus (dim + animated path). See
  `ui-ux/research-galaxy-topic-view-design.md`.
- **Process detail (D-042):** node detail modal maps v1 `research_topic` stages (gather →
  validate → synthesize → admit) with observe + bounded tune; same levers for operator and LLM.

### Librarian modules (model-bearing, company-scoped)
- Query existing library resources; curate and sanity/relevance-check them; assign relevance
  scores across metrics; may create/reorganize libraries and update topic memberships /
  synopses so the knowledge graph stays coherent for operators and downstream promote/
  evidence_fit paths (aligns with DevSpecs research-library philosophy; D-040).
- **First-class canvas module type `librarian` (D-042)** with subtypes `librarian_relevance`
  and `librarian_seed_keeper`. May sit inside research ENGINEs or free at company scope.
- Links: `librarian→library` and `library→librarian` `data_feed`; Math attach via
  `research_metric` tools when needed.

### Data modules
- **Libraries:** curated knowledge bases hydrated by research modules; per-company, shareable
  across modules; scoped by topic but cross-referenced (all libraries are subsets of the master
  library graph). Curation statuses include `proposed`, `accepted`, `auto_admitted`, `rejected`,
  `archived`. Views: left-panel **Libraries dock** (D-121, all tabs) + **Data Explorer**
  browse/filter/search (markdown | JSON); galaxy nests remain Research **trace** (D-040).
  **Bootstrap (D-045):** company create and research graph/topics/libraries ensure paths call
  `bootstrapCompanyKnowledge` so compile-time catalog mechanisms appear as readable
  `catalog_seed` galaxy concepts (payload-derived bodies, not placeholders) and an operator
  Page topic without waiting for a research run.
  **Export: Obsidian-optimized folder of .md files** (frontmatter: tags, links as wikilinks,
  provenance; topic articles as linked notes) — zip download per library or whole company.
- **Live APIs:** deterministic feed managers bound to a registry **hydrator** (`sourceKind`,
  D-121) — not generic venue-only chips. DATA tab lists all available live sources with
  readiness; entitled hydrators can be placed on canvas. Config: sourceKind, instruments,
  feed class (labeled entitlement), polling/stream mode, throttle preset. They hydrate ACTUAL
  numbers into the pipeline — no LLM connectors for market data ever.

### Trend modules
- The engine linking libraries + live data + company philosophy to trading directives.
- Curate trend lists with linked research (evidence chips), emit leads routed to trading
  modules, define completion/verification criteria per trend, update on new data.
- Can trigger simulations to pre-validate directives.

### Trading modules (expertise presets)
- Common core: v1 pipeline embedded (tactical trees → compile → deterministic dispatch →
  verification), seed allocation, desired exit timeline, attached data/research/trend modules,
  full internal verification loop. **Detail modal (D-042)** exposes tree/compile/dispatch/
  loop_refine as observe + bounded-tune layers (not separate canvas nodes).
- **Position lifecycle (paper):** `maintenance.position_exits` applies model-free exits —
  targetExit deadline, RR ladder scale-outs (`rr_target_ladder` tp1/tp2/tp3),
  **measurable_gain_take** (net gain after synthetic round-trip + 25 bps floor), then
  protective ATR stop (synthetic ATR × `atr_stop_multiplier_band`) with catalog
  **breakeven_on_tp1** half-R lock to average cost, spread-buffered breakeven,
  `time_stop_band.typical_min`, and **session_close** flatten when XNYS is closed/overnight
  **only if the position opened during an open cash session**. Exits enqueue through
  `dispatch.paper_trade`. Live `atr_stream` remains follow-on work.
- **Entry sizing (compile):** philosophy `sizingBasisBps` × **complex-signal polarization**
  (D-124: `strengthBand` + six-gate agreement + regime direction align → 0.5–1.5×), then
  **min(budget qty, ATR-risk qty)** using catalog `risk_per_trade_pct_band` and
  `atr_stop_multiplier_band` (fixed-fractional; Kelly deferred oq-036).
- Presets tune default strategy families, bands, cadences, venues:
  - **Crypto** — 24/7 sessions, Alpaca crypto (then Coinbase), cross-cap trend watching.
  - **Prediction markets** — Kalshi/Polymarket adapters, probability-edge families, niche data
    source emphasis, fast order execution posture.
  - **HFT** — micro-trade swarms across sectors; heaviest live-data + auto-research usage;
    strictest throttle envelopes; realistic framing: "high-frequency-oriented" within retail API
    latency limits (documented honestly per compliance baseline).
  - **Day trading** — regular small gains, day strategy families (ORB, gap-and-go, VWAP
    reversion), flat-by-close policy default.
  - **Long-term** — stability/liquidity balance targets, long-horizon trends, one-time event
    positioning, lowest cadence.
- Custom type via Module generator.
- **ENGINE templates (D-042):** execution specialties share one full-spine topology; research
  ENGINE specialties (`research_web_fabric`, `research_filings_fundamentals`,
  `research_seed_mechanisms`, `research_event_catalyst`, `research_market_regime_lab`,
  `research_crypto_context`, `research_prediction_niche`, `research_desk_aligned`,
  `research_multi_curator`) seed curator + library (+ optional trend/live) packs. See
  `architecture/engine-node-family-design.md`.

### Utility modules
- **Holding fund (shipped D-023):** represents a deterministic capital source on the canvas
  (`company_seed`, `company_pool`, `reserve`, or `broker_balance` config). Linked via
  `fund_route` edges to Math and fund router. **Topology only** — no ledger transfers yet.
- **Module generator:** conversational/spec-driven creation of any module type (assistant
  tool-calls under the hood; outputs a draft module the user confirms).
- **Simulator:** parallel paper runs of a trading module config; results comparable side-by-side;
  user can wire results to feed a trend/research module (config field `feed_target`).
- **Analyzer:** model-free inbound package concatenator with auto-detected input shape; serves
  verification loopback on execution ENGINEs and qualitative export on research ENGINEs.
  **D-091:** research ENGINE templates terminate with an analyzer (`emitMode: to_desk_stream` or
  `to_library`) that emits qualitative digests to the engine `data_out` bus or admits concepts to
  libraries; execution analyzers use `verify_loopback` for trading loopback. Config `emitMode`:
  `to_library` | `to_desk_stream` | `verify_loopback`.
- **Fund router:** percentage/amount rules moving funds between modules/reserve; user approval
  required unless auto-policy set; every movement hits the ledger. Amounts resolve through the
  calculator (percentages of live balances are calc ops over ledger ValueRefs — never
  model-emitted numbers). **M1:** node + `fund_route` links are seeded for paper engines; actual
  transfer execution remains M3+.
- **Math module (auto-created per company, named `Deterministic Math Calculator`; D-028 tools):**
  the transparency window into the numeric reference architecture — live k/v value browser, value
  lineage graph (every number traceable to its live source), calculator operation log with sanity
  results, static formula catalog. Exists so users can audit exactly which numbers drive fund
  pipelines and executions. Seeded engines wire `holding_fund → math → fund_router` fund routes.
  D-028: additional Math modules may be created and deleted; each may `data_feed`-attach to
  multiple consumer modules (never joins an ENGINE group).
  **Math types (D-042):** `company_hub`, `fund_path`, `desk_execution`, `trend_signal`,
  `research_metric`, `analyzer_reconcile`, `simulator_sandbox`, `session_calendar` — stored in
  `config.mathType`; dedicated tools provision with the type matching the owner. See
  `architecture/number-handling.md` and `architecture/engine-node-family-design.md`.

### Market posture hub (baseline awareness, D-081–D-112)

Operator-facing **Market posture** left tab + canvas overlay is the live desk for open
positions, watchlists, trends, and pipeline plans — distinct from Research + Libraries
(async corpus). Baseline market awareness (movers compound, synthetic marks, SymbolTicker)
runs **without requiring engine modules**. **Analyze** (D-111) is the master LLM-backed
pass (force reseal + tactical thresholds); **Sync** reloads full hub projection; automatic
**live poll** (D-112) updates only equity/marks on a shared ~15s interval so seals and the
Model algorithm canvas stay stable and Analyze is never blocked by UI refresh.

## 4. Funds model

- Paper companies: seeded from platform credits (Stripe one-click purchases). Simulated capital
  is distinct from provider/API operating budgets. Company → LLM / operating displays Anthropic,
  Mistral, and Groq credential source plus call/cost admission counters separately from trading
  allocation (D-024).
- Live companies: funds live at the broker; app reads balances, allocates virtually across
  modules (allocations are app-level bookkeeping constraining dispatch sizing — the broker sees
  one account). "Add funds" deep-links to venue funding (see broker-integration.md).
- Module fund requests + inter-module borrowing → approval inbox (or auto policy within caps).
- Ledger (right panel) is canonical: every trade, fee, transfer, simulation result.
- Positions (right panel, D-125) list open holdings with stability, recovery, and agent-action
  inspection; Market posture keeps a Positions navigator for the overlay dashboard.

## 5. Built-in assistant

**M1 interim (shipped, D-022; hardened D-023):** docked bottom-right chat pill on the company
canvas. Messages persist in append-only `assistant_messages` scoped to `(company_id,
clerk_user_id)`. The M1 path is **deliberately deterministic and read-only** — regex intent
routing to six server lookups (`company_summary`, `module_status`, `recent_executions`,
`positions`, `trends`, `queue_status`) with **no model calls**. Shared Zod contracts in
`packages/contracts/src/assistant.ts`. Persisted `tool_results` are **summary cards only**
(`tool`, `summary`, `status`); detailed lookup payloads are not stored. Failed lookups return
explicit failed cards and are logged server-side. Admission: 20 user messages per company per
rolling minute. User + assistant rows insert in one multi-row SQL statement (Neon HTTP has no
interactive transaction). UI copy states "Read-only · no model calls". Unmatched questions return
a capabilities card. Retention/erasure policy unresolved (OQ-10).

**Target (M2+ chat, M4 writes):**
- Mistral-run conversational chat, always aware of the currently viewed company; panel-docked
  (bottom).
- Direct edits via hardened JSON-schema tools only; confirm-before-apply default; auto-apply
  opt-in for non-financial edits; financial/live actions always confirmed.
- Structured edit-proposal cards (diff-style: field, old → new) with Confirm/Reject; applied
  edits link to `assistant_edits` audit entries.
- Can answer "why" questions by citing traces, trends, and evidence (read tools over the same
  projections the UI uses).

## 6. Monetization (Stripe)

- Subscription tiers (Clerk Billing): Free (1 paper company, capped LLM budget, sim-only),
  Pro (multi-company, live brokers, higher budgets, galaxy view), Quant (max budgets, parallel
  simulations, priority queues). Exact pricing TBD (OQ-4).
- One-click credit packs for LLM usage + paper seeds. No Stripe money ever reaches a brokerage.

## 7. Number-handling guarantee (user-facing principle)

The product can honestly claim: "AI never touches your numbers — or your clocks." Every
quantity, price, balance, timestamp, and timeout flows from live sources, the system clock, and
exchange calendars through a deterministic, audited calculator; models steer strategy by
choosing among bounded options and reacting to qualitative deltas (they may see time as
read-only orientation, never compute with it). The Math module lets users verify this
end-to-end for any trade, including when every temporal decision was anchored.

## 8. Compliance posture (carried v1 baseline)

- No guaranteed-returns language anywhere. Paper-first defaults. Live gates explicit.
- Entitlement truthfulness on data feeds; session legality matrix enforced; retention 90d hot /
  1y archive on traces; risk/strategy/execution/compliance are co-equal in all product copy.
