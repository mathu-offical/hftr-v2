# hftr-v2 Technology Decisions

Every decision below records: the choice, the justification, alternatives considered, and
verification status. Dated 2026-07-16 unless noted. All external claims verified via current
docs/web research at decision time; re-verify before implementation of each area.

## TD-01 — Framework: Next.js 15 (App Router) + React 19 + TypeScript strict

- **Why:** v1 proved App Router + RSC works for this app shape; Vercel deployment target is fixed
  by the v2 spec; React 19 server actions simplify company/module CRUD; largest ecosystem overlap
  with Clerk, Stripe, React Flow.
- **Alternatives:** Remix/TanStack Start (weaker Vercel-native story), SvelteKit (would discard
  v1 component learnings and React Flow).
- **Monorepo:** pnpm + turborepo, mirroring v1's layout that worked:
  `apps/web`, `packages/contracts`, `packages/db`, `packages/engine` (pure deterministic pipeline
  logic, no Next.js imports — new in v2 to keep dispatch testable and portable).

## TD-02 — Auth: Clerk

- Mandated by the v2 spec. Use `@clerk/nextjs` middleware; Clerk `userId` is the ownership key in
  every table (replaces v1's NextAuth credentials + bcrypt).
- Organizations feature deferred — hftr companies are an in-app concept, NOT Clerk Organizations
  (a user owns many companies; Clerk orgs would add invite/membership semantics we don't need yet).

## TD-03 — Payments: Stripe via Clerk Billing + direct Stripe for one-time credits

- **Subscriptions/tiers:** Clerk Billing (0.7% + Stripe fees) — plans managed in Clerk dashboard,
  `useCheckout()` / `PricingTable` for UI. Covers gating LLM usage tiers and feature access.
- **One-click seed credits:** direct Stripe Checkout `mode: 'payment'` with fixed price points
  ($10/$50/$100/$500 style buttons), embedded checkout (`ui_mode: 'embedded'`), webhook-verified
  credit grants into a `platform_credits` ledger table.
- **Hard boundary (user decision 2026-07-16):** Stripe money NEVER becomes brokerage money.
  Real trading funds stay at the broker; the app exposes broker-native funding flows (see TD-08).
  Stripe credits fund: paper/simulated company seeds, LLM usage, premium features.

## TD-04 — Database: fresh Neon Postgres + Drizzle ORM

- **Fresh instance** (user decision): v1 schema is stale/partial; we carry contracts, not tables.
- **Drizzle over raw SQL** (v1 used raw `@vercel/postgres`): v1's biggest schema pain was
  hand-written `Database` types drifting from migrations. Drizzle gives typed schema-as-code,
  generated migrations, and stays thin/portable (no query-builder lock-in beyond SQL).
- Row-ownership isolation via `clerk_user_id` columns + query-layer scoping helpers (carried from
  v1's `ownership.ts` pattern). No RLS dependency.

## TD-05 — LLM tiers (user-confirmed mapping)

| Tier | Model | Role |
|---|---|---|
| Strategic (top) | **Claude** (Anthropic API, Sonnet-class default; Opus-class flagged) | Deep market/sector analysis, trend synthesis, research module reasoning. Invoked *selectively by Mistral* — never on a fixed high-frequency cadence. |
| Tactical / orchestration (mid) | **Mistral** (`mistral-large-latest` default; `mistral-medium-latest` where cheaper is fine) | Bulk analysis + orchestration middleware. Decomposes leads into decision trees, routes work, powers the built-in assistant. 256k context; strict `json_schema` structured outputs; tool calling (max 128 tools/request). |
| Execution (bottom) | **Groq** (`llama-3.3-70b-versatile` default) | Compile/format/verify-formatting only. 500+ tok/s; strict structured outputs. Last model-bearing stage. |
| Below execution | **No models.** Deterministic dispatch + verification, carried verbatim from v1's invariant. |

- Pricing sanity (2026-07): Mistral Large 3 $0.5/$1.5 per M tokens, Medium 3.5 $1.5/$7.5,
  Groq Llama 3.3 70B $0.59/$0.79. Note Large 3 is *cheaper* than Medium 3.5 — default to Large.
- **Rate limiting by admission, not truncation** (v2 spec requirement): a per-company,
  per-provider call-budget table gates job admission before any LLM call is made; jobs that would
  exceed budget wait in queue rather than truncating context. Monitor `X-RateLimit-Remaining`;
  429 → exponential backoff + requeue.
- Every LLM call declares an input schema and an output `json_schema` (strict) in
  `packages/contracts`. No freeform-text handoffs between tiers.

## TD-06 — Job orchestration: custom Postgres queue (user decision: minimal lock-in)

- Pattern: single `jobs` table, `SELECT ... FOR UPDATE SKIP LOCKED` claim, lease/`locked_until`
  expiry recovery, bounded retries with jitter, dead-letter status, transactional outbox
  (enqueue in the same transaction as the business write), idempotent handlers keyed by
  `idempotency_key`. This is a hardened evolution of v1's proven `pipeline_jobs` spine.
- Drain drivers (in order of adoption):
  1. Vercel Cron → time-boxed drain route (`maxDuration` on Fluid Compute), `CRON_SECRET` gated.
  2. Self-chaining drain: drain route re-invokes itself while work remains (bounded hops).
  3. Optional dedicated worker process (Railway/Fly/VPS) reusing the identical
     `packages/engine` worker loop, if cadence demands it. The worker code is runtime-agnostic
     so this is a deploy change, not a rewrite.
- Rejected: Inngest/Trigger.dev/Vercel Workflow (user prefers no further vendor lock-in;
  our workload is moderate-throughput and Postgres-adjacent, the sweet spot for SKIP LOCKED).
- Consulted: pg-boss internals as the reference implementation of the pattern; we implement our
  own thin version because we need custom queue classes, per-company budgets, and
  pipeline-specific priorities baked into the claim query.

## TD-07 — Canvas: React Flow (`@xyflow/react`)

- Module-node canvas per company: research → data → trend → trading → policy, left-to-right.
- Node counts per company are small (tens), well inside React Flow's comfort zone; performance
  discipline still applies: `React.memo` all custom nodes/edges, define nodeTypes outside
  components, Zustand + `useShallow` selectors, no direct `nodes`/`edges` array dependencies.
- **Hybrid aesthetic (user decision):** clean modern node-graph shell with playful animated
  activity inside nodes — small worker sprites / activity pulses per node echoing v1's office
  charm, rendered as lightweight CSS/canvas layers inside memoized node bodies. Animated
  data-flow edges show live pipeline traffic.
- Rejected: hand-rolled SVG canvas (v1's 3.4k-line `OfficeCanvas.tsx` was the costliest UI asset;
  React Flow gives pan/zoom/selection/minimap for free).

## TD-08 — Brokers: adapter layer, "as many full real connections as possible" (user decision)

Order of integration (per-adapter detail in `architecture/broker-integration.md`):
1. **Alpaca Trading API** — stocks + crypto, paper AND live from one adapter (paper/live differ
   only by base URL + keys → perfect fit for the parity invariant). User connects their own
   funded account via API keys; "add funds" deep-links to Alpaca's native funding.
2. **Kalshi** — regulated US prediction markets, public REST/WS trading API with demo env.
3. **Polymarket CLOB** — prediction markets; requires wallet-based auth (more setup friction;
   phase-gated).
4. **Coinbase Advanced Trade** — dedicated crypto venue beyond Alpaca's crypto coverage (later).
- Alpaca **Broker API** (in-app ACH funding via Plaid) noted as the eventual path to true
  in-app funding UX, but it requires a broker-dealer relationship — logged as an open question,
  not an MVP dependency. MVP funding UX = connect account → show balances → deep-link funding.

## TD-09 — Research galaxy: `react-force-graph-3d` (MVP, user decision)

- Three.js/WebGL 3D force-directed graph; d3-force-3d engine; supports node/link hover/click,
  dagMode layouts, custom node objects. Proven to ~4k elements out of the box.
- Scale plan: research libraries start small (hundreds of concepts); if we exceed ~2–3k visible
  nodes, adopt the documented escalation path — cluster-collapse LOD, InstancedMesh custom
  rendering, Web Worker layout (graphier/galaxy-nodes patterns studied as references).
- 2D fallback (`react-force-graph-2d`, same API) for low-power devices and large graphs (>200).
- **D-040 layout contract:** hard nested library hulls (force constraints / radial bounds),
  topic focus overlays (dim + animated path), rotating tag chip layer, Article tab sibling —
  see `ui-ux/research-galaxy-topic-view-design.md`. Library nests remain in 2D fallback.

## TD-10 — Styling & design system

- Tailwind CSS v4 + a token layer (`tokens.css` carried conceptually from v1) defining the
  financial-terminal dark theme. shadcn/ui for panels/modals/forms primitives (owned code, no
  runtime dep lock-in). Lucide icons (v1's `hftr_symbolic_mono` maps cleanly to Lucide names
  already used in its registry: `shield-key`, `radar`, `route`, etc.). No emojis in product UI.
- Full design standards in `ui-ux/ui-spec.md`.

## TD-11 — Market data

- **Quotes / bars (broker path):** Alpaca Market Data API (IEX free tier) for stocks/crypto
  quotes + bars at dispatch; Kalshi WS for prediction books (M3). Entitlement truthfulness
  from v1 compliance baseline (free/IEX vs SIP labeled; paper realism tags mandatory).
- **Research news / qualitative bars (D-046):** gather sources `alpaca_news` (Alpaca
  `/v1beta1/news`), `alpaca_bars` (qualitative IEX bar evidence), `finnhub_news`
  (company-news / general), `polygon_news` (`/v2/reference/news`), plus existing Brave /
  Marketaux / SEC. Feed classes must stay honest; evidence titles/summaries are leak-linted
  — never raw OHLC/quote digits into model-facing packages.
- Matrix: `research/integrations-matrix.md`.

## TD-12 — Testing & verification

- Vitest for unit/contract tests (v1 reached 294 passing tests on the pipeline spine — match or
  exceed on the v2 engine). Playwright for E2E auth+canvas flows. Zero-trust rule: every pipeline
  stage ships with contract tests against its declared schemas; every UI milestone verified in a
  real browser before "done".
