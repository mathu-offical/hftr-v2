# M1 Sprint Spec — Company Canvas + Module CRUD + Queue Spine

Execution-level detail for milestone M1. Depends on G0 passing.

## Progress (2026-07-16)

Verified in the running app (browser-driven: company created through the UI, canvas rendered,
modules added from palette, node rename/status via inspector, `library → trend` data_feed edge
created, invalid link 422, math delete 422, noop job enqueued → drained → completed):

- **T1.1 partial:** create-company form (name/philosophy/seed, paper-only) on `/companies`;
  auto Math module; archive via API. Wizard steps/templates/switcher still open.
- **T1.2 partial:** React Flow canvas at `/companies/[companyId]` — type-tinted `ModuleNode`,
  palette add, drag-persisted positions, LINK_RULES-validated edges (client + server), pinned
  non-deletable Math node, inspector panel (rename/status/delete). Uses `useNodesState` (v12
  requires measured dims to round-trip — deriving nodes per-render leaves them hidden).
  Column snap, LOD, minimap, edge delete still open.
- **T1.3 queue spine:** live — drain endpoint verified end-to-end against Neon; queue stats
  chip in the top bar. Schedules/materializer still open.
- **Infra:** Neon project `hftr-v2` (bold-surf-86557348) created + migrated + XNYS calendar
  seeded (2026–27); GitHub Actions CI added; dev auth bypass (`DEV_AUTH_BYPASS=1`, inactive in
  production or once Clerk keys are set). Clerk keys still needed for real auth (user action).

## T1.1 — Company CRUD + wizard

- Server actions: `createCompany`, `updateCompany`, `archiveCompany` (Zod-validated,
  owner-scoped). Company templates as seed data (`packages/db/seed/company-templates.ts`):
  `blank`, `day_trading_starter`, `crypto_starter`, `prediction_starter`, `research_first` —
  each a list of module specs + link specs + default canvas positions.
- Wizard route `/companies/new`: steps name+philosophy → seed amount (credits placeholder in
  M1; real credits M4) → mode (paper only selectable; live visible but disabled with
  text-first reason) → template picker → creates company + modules + links transactionally.
- Company switcher in top bar hydrated from DB; last-viewed persisted to `users_profile`.

## T1.2 — Canvas (React Flow)

- `@xyflow/react`; route `/c/[companyId]` renders the graph.
- Custom node component per module type family (one memoized `ModuleNode` with type-driven
  config, NOT nine components): icon, name, type chip, status line, key metric slot, activity
  layer slot. `nodeTypes` defined at module scope; Zustand store with `useShallow` selectors.
- Position persistence: drag-end → debounced server action updating `modules.canvas_position`.
- Edge creation: connection handles validated against a `LINK_RULES` matrix in contracts
  (e.g. `library → trend: data_feed` allowed; `trading → research: verification` allowed;
  invalid combinations rejected with toast reason). Edge deletion with confirm.
- Column snapping: nodes softly snap to their type column (research | data | trend | trading |
  policy) on drop; free vertical placement.
- Auto-created Math module node (D-008) rendered pinned in the data column; delete disabled.
- Minimap, controls, fit-view; LOD threshold: below 0.5 zoom, node bodies collapse to
  icon + status dot.

## T1.3 — Queue spine (packages/engine/queue)

- Migration 003 already has `jobs`/`job_schedules`. Implement:
  - `enqueue(tx, jobSpec)` — transactional outbox insert with idempotency_key conflict-ignore.
  - `claim(queueClasses, limit, workerId)` — the SKIP LOCKED claim query from
    job-orchestration.md §2, with per-company fairness cap (window function over company_id).
  - `complete/fail/retry` with jittered backoff (`base * 2^attempts + rand(0..base)`), dead
    at `max_attempts`.
  - `sweepLeases()` — expired active → pending, attempt++.
  - `materializeSchedules(now)` — due `job_schedules` → jobs, idempotent per
    `(schedule_id, window_start)` key.
- Handler registry: `registerHandler(kind, fn)`; handlers in `packages/engine/handlers/`;
  M1 ships `noop_echo` (test), `maintenance.sweep`, `maintenance.schedules`.
- API: `POST /api/queue/drain` (CRON_SECRET; time-boxed loop + bounded self-chain),
  `GET /api/queue/stats` (counts by class/status, oldest pending age).
- `vercel.json` cron enabled: `*/1 * * * *` → drain tick.
- Tests: contention (two concurrent claimers, no double-claim), lease expiry recovery,
  idempotent enqueue, fairness cap, schedule materialization idempotency. Target ≥ 25 tests.

## T1.4 — Node status projections

- `GET /api/companies/:id/canvas` returns graph + per-module status projection:
  active/pending/dead job counts, last completed job kind + age, status text (text-first
  strings composed server-side, e.g. `active · 2 jobs`, `idle`, `error: dead jobs (3)`).
- Canvas polls (SWR, 5s while tab visible); activity layer animates when active jobs > 0
  (CSS pulse in M1; sprite pass later per hybrid aesthetic).

## T1.5 — Panels shell

- Three `Panel` primitives (left/bottom/right) with spring slide-in, 8% canvas peek strip,
  Esc + peek-click close, focus trap, route-driven state
  (`/c/:id/research`, `/c/:id/control`, `/c/:id/execution`), open-state persisted per company.
- M1 content: left = module list + create-module form (typed config forms per module type,
  Zod-shared with server); bottom = placeholder columns scaffold; right = placeholder ledger
  table bound to empty state.
- Keyboard: `[`, `]`, `` ` `` toggles.

## T1.6 — Assistant shell (read-only)

- Bottom-right pill → chat column; `assistant_sessions`/`assistant_messages` persistence;
  streaming Mistral chat (`packages/llm` minimal client) with READ-ONLY tools:
  `get_company_overview`, `list_modules`, `get_module_status`, `get_queue_stats`.
  No write tools until M4 (write-tool hardening spec in llm-pipeline.md §7).
- This is deliberately ahead of the LLM budget system (M2); interim: hard per-user daily
  message cap in `llm_budgets` seeded manually.

## Gate G1 checklist

- [ ] Create company from template → canvas renders template graph with Math node pinned
- [ ] Add/link/move/delete modules; positions + links survive reload; invalid links rejected
- [ ] Enqueue synthetic `noop_echo` via a module's "trigger" action → drain processes it →
      node status line reflects active→idle transition in browser
- [ ] Queue tests green incl. contention + lease recovery; `queue/stats` accurate
- [ ] Panels open/close via routes + keyboard; state persists
- [ ] Assistant answers module-status questions using read tools only
- [ ] Playwright flow 1 (sign-up → company → canvas) green
- [ ] agent-docs updated (progress, deviations, any new OQs)

## Pulled forward from M2 (2026-07-16)

The operator-initiated paper dispatch spine shipped early (decision D-014): `dispatch.paper_trade`
DISPATCH-queue handler, deterministic engine path
(`packages/engine/src/dispatch/paper-trade.ts`), synthetic quote source, pipeline tables
(instructions/tasks/traces/verifications/ledger), trade route
(`POST /api/companies/:id/modules/:mid/trade`), activity projection
(`GET /api/companies/:id/activity`), link `DELETE`, edge deletion on canvas, paper-trade form in
the inspector, and the Activity right rail. Verified end-to-end against the live server + Neon:
enqueue → drain → filled task → passing verification (quantity, fill deviation ≤ 50 bps, limit
respected) → ledger debit with correct derived balance. All checks green (typecheck, lint, tests,
production build).

## Session 2026-07-16 (continued build, decision D-016)

- **T1.4 node status projections shipped:** `GET /api/companies/:id/canvas` composes a text-first
  status line per module (job counts, last trade outcome, last trend); canvas polls every 5s and
  nodes show a pulse dot while jobs are active.
- **Positions:** `positions` table + engine bookkeeping (avg cost, realized PnL, no-shorting
  gauntlet with `broker_policy_block`); `GET .../positions` marks to market against the quote
  source. Unit-tested pure math (`nextAverageCost`, `realizedOnSell`).
- **Catalogs in DB:** `catalog_entries` seeded from the vendored JSONs
  (`pnpm --filter @hftr/db exec tsx src/seed/seed-catalogs.ts`, 97 entries); trading inspector
  strategy-family picker reads `/api/catalogs/strategy_families` and persists through the
  schema-validated module PATCH.
- **Trend scan:** deterministic `trend.scan` RESEARCH handler → `trend_candidates`
  (`deterministic_scan` source class) + drift ValueRefs; "Scan now" control on trend modules.
- **Templates:** `blank` / `day_trading_starter` / `trend_research_lab` in contracts; picker in
  the create-company form; configs contract-tested against `MODULE_CONFIG_SCHEMAS`.
- **Info rail:** right panel now tabbed — Activity / Positions / Trends / Values (Math ValueRef
  audit: value, unit, kind, source class, source id, capture time).
- **Verified in browser with a real Clerk test account:** sign-up, templated company creation,
  activate modules, scan (4 candidates), buy 10 AAPL, sell 4 (balance $10,000 → $8,545.50 →
  $9,125.14; position 10 → 6 with realized PnL); oversell blocked at engine. All checks green.
- Remaining M1 gate items: panel keyboard routes, read-only assistant, Playwright flows.
