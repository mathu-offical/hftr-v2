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
- **Company creation (implemented D-024):** offers discrete seed modules/engines and an inline
  setup section. Capital-bearing nodes (`holding_fund`, `fund_router`, `trading`) require a fixed
  or percentage capital allocation plus target exit; research/data/signal/trading analysis nodes
  require topic/sector. Highlighted Required/Set chips validate in place. **Skip setup & open
  canvas** creates draft nodes with visible missing-field chips and inline node controls.
- The create form picks one of three company templates (`blank`,
  `day_trading_starter`, `trend_research_lab`). The module store additionally exposes insertable
  end-to-end `ENGINE_TEMPLATES` (day-trading and trend-research available; crypto/prediction/HFT
  listed with honest gating reasons). Templates seed no topic, sector, or instrument universe:
  scope fields use `pending_operator_scope` and instruments start empty until operator setup.
  Company creation and later engine insertion use the same setup contract. Allocation and exit
  resolve through ValueRefs and temporal refs per `architecture/number-handling.md`.
- **ENGINE groups (D-028):** each inserted engine persists as an `engine_instances` row with
  `master_topic_sectors` that cascade to member modules (`engine_instance_id`) unless a member
  overrides (`topic_sectors_overridden`). React Flow renders a structural parent group chrome
  (not a module type). Delete offers cascade (remove members) or ungroup (keep modules). Math
  modules are never engine members; they attach as repeatable multi-consumer TOOL links. Full
  canvas grouping UX verification pending (API/DB/contracts implemented).

## 3. Modules (user-creatable, multi-instance)

Canvas ordering left→right: research → data (libraries + live APIs) → trend → trading → policies.

**Default seeded trading engines (canonical 2026-07-17):** paper-safe topology follows
research modules → data modules (evidence/history library + live/runtime feed) → trend modules →
trading module, with fund source (`holding_fund`) → Math module → fund router feeding the trading
desk and policy verification modules (`analyzer` transaction monitor + `policy` trading policy).
All default node names describe actual function. Fund/router nodes are **visible topology only** in
M1 — deterministic fund movement is not implemented by this slice (D-023).

### Research modules (model-bearing, curious)
- Autonomous agents building tagged concept databases; opportunistic source-seeking (scoped web
  research via provider tools; Brave Search optional).
- Config: topic scope, curiosity level (exploration vs exploitation ratio), cadence, target
  libraries, source allowlist/blocklist.
- Output: concepts + tags + typed links (galaxy graph), library curation proposals.
- Progress view: topics tree, recent concepts, coverage stats, next planned inquiries.

### Data modules
- **Libraries:** curated knowledge bases hydrated by research modules; per-company, shareable
  across modules; scoped by topic but cross-referenced (all libraries are subsets of the master
  library graph). Views: browse/tag/search, graph view, markdown preview.
  **Export: Obsidian-optimized folder of .md files** (frontmatter: tags, links as wikilinks,
  provenance) — zip download per library or whole company.
- **Live APIs:** deterministic feed managers (Alpaca data, Kalshi books, future venues).
  Config: instruments, feed class (labeled entitlement), polling/stream mode, throttle preset.
  They hydrate ACTUAL numbers into the pipeline — no LLM connectors for market data ever.

### Trend modules
- The engine linking libraries + live data + company philosophy to trading directives.
- Curate trend lists with linked research (evidence chips), emit leads routed to trading
  modules, define completion/verification criteria per trend, update on new data.
- Can trigger simulations to pre-validate directives.

### Trading modules (expertise presets)
- Common core: v1 pipeline embedded (tactical trees → compile → deterministic dispatch →
  verification), seed allocation, desired exit timeline, attached data/research/trend modules,
  full internal verification loop.
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

### Utility modules
- **Holding fund (shipped D-023):** represents a deterministic capital source on the canvas
  (`company_seed`, `company_pool`, `reserve`, or `broker_balance` config). Linked via
  `fund_route` edges to Math and fund router. **Topology only** — no ledger transfers yet.
- **Module generator:** conversational/spec-driven creation of any module type (assistant
  tool-calls under the hood; outputs a draft module the user confirms).
- **Simulator:** parallel paper runs of a trading module config; results comparable side-by-side;
  user can wire results to feed a trend/research module (config field `feed_target`).
- **Analyzer:** any-input→any-output converter with auto-detected input shape; serves
  verification loopback and format bridging between data sources and trends.
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
  multiple consumer modules (never joins an ENGINE group). See `architecture/number-handling.md`
  and `ui-ux/canvas-engine-group-design.md`.

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
