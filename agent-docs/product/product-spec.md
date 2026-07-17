# hftr-v2 Product Specification

## 1. Core loop

A user creates a **Company**, seeds it with funds (credits for paper; broker balance for live),
composes a graph of **Modules** on the canvas, sets **policies**, and starts the pipeline.
Research feeds libraries; trends translate research + live data into directives; trading modules
turn directives into verified executions; results feed back into research and training. The user
watches, steers, and approves through the canvas + three panels + the assistant.

## 2. Companies

- Fields: name, philosophy prompt, trading goals, re-investment strategy, scoping policies,
  mode (paper|live), seed amount, per-module allocations (manual or auto), broker connection.
- Company policies bound everything downstream: risk bands, session allowances, approval
  thresholds for fund movements, LLM budget tier.
- A user can own many companies; each company is one canvas.
- Company creation wizard: name+philosophy → seed → mode → starter template (pre-linked module
  graph per template: "Day trading starter", "Crypto starter", "Prediction markets starter",
  "Research-first", "Blank").

## 3. Modules (user-creatable, multi-instance)

Canvas ordering left→right: research → data (libraries + live APIs) → trend → trading → policies.

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
- **Module generator:** conversational/spec-driven creation of any module type (assistant
  tool-calls under the hood; outputs a draft module the user confirms).
- **Simulator:** parallel paper runs of a trading module config; results comparable side-by-side;
  user can wire results to feed a trend/research module (config field `feed_target`).
- **Analyzer:** any-input→any-output converter with auto-detected input shape; serves
  verification loopback and format bridging between data sources and trends.
- **Fund router:** percentage/amount rules moving funds between modules/reserve; user approval
  required unless auto-policy set; every movement hits the ledger. Amounts resolve through the
  calculator (percentages of live balances are calc ops over ledger ValueRefs — never
  model-emitted numbers).
- **Math module (auto-created per company, non-deletable):** the transparency window into the
  numeric reference architecture — live k/v value browser, value lineage graph (every number
  traceable to its live source), calculator operation log with sanity results, static formula
  catalog. Exists so users can audit exactly which numbers drive fund pipelines and executions.
  See `architecture/number-handling.md`.

## 4. Funds model

- Paper companies: seeded from platform credits (Stripe one-click purchases). Simulated capital
  is distinct from credits used for LLM budget (two meters; both visible).
- Live companies: funds live at the broker; app reads balances, allocates virtually across
  modules (allocations are app-level bookkeeping constraining dispatch sizing — the broker sees
  one account). "Add funds" deep-links to venue funding (see broker-integration.md).
- Module fund requests + inter-module borrowing → approval inbox (or auto policy within caps).
- Ledger (right panel) is canonical: every trade, fee, transfer, simulation result.

## 5. Built-in assistant

**M1 interim (shipped, D-022):** docked bottom-right chat pill on the company canvas. Messages
persist in append-only `assistant_messages` scoped to `(company_id, clerk_user_id)`. The M1
path is **deliberately deterministic and read-only** — regex intent routing to six server
lookups (`company_summary`, `module_status`, `recent_executions`, `positions`, `trends`,
`queue_status`) with **no model calls**. UI copy states "Read-only · no model calls". Financial
figures in responses are server-sourced projections (fixed-point strings from DB/engine), not
LLM output. Unmatched questions return a capabilities card. The empty state tells operators
that messages are persisted and not to paste credentials; API keys remain confined to the
encrypted user-settings store.

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
