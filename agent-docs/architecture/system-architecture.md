# hftr-v2 System Architecture

## 1. Monorepo layout

```
hftr-v2/
  apps/web/                 # Next.js 15 App Router (UI + API routes + server actions)
  packages/contracts/       # Zod schemas + TS types for every cross-boundary artifact
  packages/db/              # Drizzle schema, migrations, query helpers, ownership scoping
  packages/engine/          # Pure pipeline: tools, levers, bands, dispatch, verification,
                            # queue worker loop. NO Next.js/React imports. Runs anywhere.
  packages/adapters/        # Broker adapters (paper sim, alpaca, kalshi, polymarket, ...)
  packages/llm/             # Provider clients (anthropic, mistral, groq) + schema-locked
                            # call wrappers + budget/rate-limit admission
  agent-docs/               # this documentation system
  DevSpecs/                 # read-only
```

Rationale: v1 cohosted everything in the web app; extracting `engine`/`adapters`/`llm` makes the
deterministic core independently testable and lets the queue worker run in any runtime
(Vercel function, dedicated worker) without a rewrite.

## 2. Layered runtime (authority model)

```
┌─ UI (canvas, panels, assistant) ── reads projections; writes only via validated APIs ─┐
├─ API layer (route handlers + server actions, Clerk-scoped, Zod-validated) ────────────┤
├─ Orchestration (job queue + scheduler; module cadences; budget admission) ────────────┤
├─ Model-bearing tiers — numbers ONLY as ValueRef handles + qualitative descriptors     │
│    Strategic: Claude   (selective, Mistral-invoked)                                    │
│    Tactical:  Mistral  (bulk orchestration, tree expansion, assistant)                 │
│    Execution: Groq     (compile ActionInstruction; LAST model stage)                   │
├─ Numeric + temporal reference architecture (packages/engine/calc, clock, calendar) —  │
│    k/v value store, calculator, clock authority, market calendars, descriptor          │
│    generation, leak linting, sanity gauntlet (see number-handling.md)                  │
├─ Deterministic core (packages/engine) — model-free, provider-free                     │
│    activation gates → guardrails → watchers → dispatch → verification → traces        │
├─ Broker adapters (paper sim / Alpaca / Kalshi / Polymarket) — polymorphic policy only │
└─ Neon Postgres (system of record) ─────────────────────────────────────────────────────┘
```

Authority rules (carried from v1, enforced in code review + tests):
- UI/web shell never writes privileged trading artifacts directly.
- Model tiers emit schema-validated artifacts; they never submit orders.
- Model tiers never handle raw financial numbers or authoritative dates/times — ValueRef
  handles + calculator/clock/calendar tools only (`number-handling.md`). Data modules/adapters/
  ledger/clock/calendar are the only producers of source values; the calculator is the only
  producer of derived values.
- Deterministic core is the only layer that talks to broker trading endpoints.
- Every cross-tier artifact travels in a `HandoffEnvelope`.

## 3. Domain model (companies & modules)

A **Company** is the user's top-level unit (replaces v1 "broker workspace"):
- seed amount (platform credits for paper; broker balance for live), philosophy prompt,
  trading goals, re-investment strategy, scoping policies, paper|live mode.
- Owns a module graph rendered on the canvas.

**Modules** (all multi-instance per company, all first-class DB entities with positions on the
canvas):

| Module | Determinism | Backing |
|---|---|---|
| Research module | Model-bearing (Claude via Mistral routing) | builds tagged concept graphs → libraries |
| Data module: Library | Curated store | indexed/tagged knowledge base, markdown-exportable (Obsidian folder) |
| Data module: Live API | Deterministic | market data feeds (Alpaca data, Kalshi books); queryable by pipeline |
| Trend module | Model-bearing (Mistral) + deterministic scoring | trends + leads + directives; can trigger simulations |
| Trading module (crypto / prediction / HFT / day / long-term) | Mixed; dispatch deterministic | full v1 pipeline embedded per module, expertise presets per type |
| Utility: Module generator | Model-bearing | creates configured module instances from user spec |
| Utility: Simulator | Deterministic engine + paper adapter | parallel paper runs; results feed trends/training |
| Utility: Analyzer | Mixed | any-input→any-output converter; verification loopback |
| Utility: Fund router | Deterministic + approval gates | moves fund allocations between modules/reserve |
| Utility: Math module | Deterministic (auto-created, non-deletable) | numeric k/v store + calculator surface; value lineage + calc audit views (`number-handling.md`) |

Module-to-module edges on the canvas are real data-flow contracts (which library feeds which
trend module, which trend module directs which trading module), stored as `module_links`.

Inter-module fund mechanics: allocation requests to company pool and profit borrowing between
modules require user approval unless the company policy sets auto-approve (with bounded caps).

## 4. Pipeline (per trading module)

Carried v1 spine, re-scoped per module:

```
company philosophy + module config
  → research modules (Claude): topics → tagged concepts → libraries
  → trend modules (Mistral): trends → leads (+ six-gate activation validation)
  → trading module tactical (Mistral): DecisionTree expansion (lever geometry)
  → trading module execution (Groq): compile → ActionInstruction
  → deterministic core: guardrails → dispatch → broker adapter → verification → ActionTrace
  → analyzer/training feedback: bounded band/weight retunes only
```

Cadences (defaults, per-module configurable within policy bounds): strategic pre-market/3h/
trigger; tactical ≤30m; execution ≤5m; deterministic watchers continuous while market open.
Users can manually trigger any tier from the module's expanded view.

## 5. API surface (initial)

Route handlers under `apps/web/app/api/`, all Clerk-authenticated + Zod-validated + owner-scoped:

- `companies` CRUD, `companies/:id/canvas` (graph), `companies/:id/policies`
- `modules` CRUD, `modules/:id/config`, `modules/:id/trigger` (manual tier trigger)
- `modules/:id/links` (graph edges), `funds/transfers` (fund router + approvals)
- `research/concepts`, `research/graph` (galaxy data), `libraries/:id/export` (md/Obsidian zip)
- `trends`, `leads`, `watchlists`, `decision-trees/:id`
- `dispatch/tasks`, `traces`, `traces/:id`, `ledger` (right panel)
- `simulations`, `simulations/:id/results`
- `assistant/chat` (Mistral tool-calling; hardened JSON edit functions)
- `billing/credits`, `billing/webhook` (Stripe), broker: `brokers/connect`, `brokers/:id/balances`
- `cron/*` + `queue/drain` (CRON_SECRET gated)
- `health`

## 6. Deployment

- Vercel project (new), Neon Postgres (fresh), Vercel Cron for schedules, custom queue drain
  (see `job-orchestration.md`). Env contract defined in `.env.example` from day one and kept in
  sync with `packages/contracts` `ENVIRONMENT_REQUIREMENTS` (fixing v1's `POSTGRES_URL` vs
  `DATABASE_URL` inconsistency: v2 standardizes on `DATABASE_URL`).
- Secrets: Clerk, Stripe, Anthropic, Mistral, Groq, Alpaca (paper+live), Kalshi, Neon.
  Broker secrets stored encrypted (per-user, AES-GCM with app KMS key env var); only last-four
  ever displayed (v1 pattern).

## 7. Observability

- Immutable `action_traces` + `verification_records` are the canonical audit history (hosted logs
  are not, per v1 compliance baseline).
- LLM call ledger table: provider, model, tokens, cost, latency, schema-validation outcome —
  feeds budget admission and the UI's usage meters. LLM tracing allowed upstream of dispatch only.
