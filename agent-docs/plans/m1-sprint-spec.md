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
  production or once Clerk keys are set). Vercel project `hftr` rootDirectory corrected to
  `apps/web` (was stale `apps/hftr-web`); production env seeded with `DATABASE_URL` + Clerk +
  `CRON_SECRET` — `/api/health` returns `db: true` on https://hftr.vercel.app (2026-07-17).

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

- Three docked panel primitives (`LeftPanel`, `BottomPanel`, `RightPanel`) with spec tabs and
  collapse-to-strip chrome (full slide-over deep-link routes remain roadmap).
- **Keyboard (shipped 2026-07-17, D-022):** `[` toggles left, `]` toggles right, `` ` ``
  toggles bottom; `Esc` collapses the focused panel (bottom defers to `TraceTimeline` when
  open). Shortcuts are suppressed while focus is in an editable field.
- **Per-company persistence (shipped):** `localStorage` keys
  `hftr:{companyId}:panel:{left|bottom|right}` store open state, active tab, and (bottom only)
  module filter; restored on next visit to that company.
- M1 content: left = Research/Data sources + create forms + concepts browser; bottom =
  Trends/Scenario engine/Watch lists/Decisions+traces; right = Verify/Executions/Ledger/Sims/
  Values projections.

## T1.6 — Assistant shell (read-only, deterministic)

- Bottom-right `AssistantDock` pill → chat column overlay (`apps/web/components/assistant/`).
- **Persistence:** append-only `assistant_messages` table — `(company_id, clerk_user_id, role,
  content, tool_results jsonb)`; GET returns newest 100 chronological; no `assistant_sessions`
  table in M1 (deferred).
- **No model calls in M1 (D-022):** POST classifies user text with regex intent rules and runs
  deterministic read lookups only — **not** Mistral/`packages/llm`. UI labels the surface
  "Read-only · no model calls".
- **Six lookup intents:** `company_summary`, `module_status`, `recent_executions`, `positions`,
  `trends`, `queue_status`. Unmatched intents return a capabilities card listing supported
  topics. Financial figures in tool payloads are server-sourced fixed-point strings from DB/
  engine projections — the assistant path does not invoke any LLM and therefore does not emit
  raw model numbers.
- **Later milestones:** Mistral orchestration chat (M2+), write tools + confirm proposal cards
  (`assistant_edits` audit, M4 per llm-pipeline.md §7).

## Gate G1 checklist

Status key: **done** = verified in running app or Playwright; **candidate** = implemented,
awaiting final CI/local rerun; **open** = not yet met.

- [x] **done** Create company from template → canvas renders template graph with Math node pinned
      (browser-verified earlier; Playwright `company-workspace` covers `day_trading_starter`)
- [x] **done** Add/link/move/delete modules; positions + links survive reload; invalid links
      rejected (browser-verified 2026-07-16; not fully Playwright-covered)
- [x] **done** Enqueue synthetic `noop_echo` → drain → node status reflects active→idle
      (browser-verified 2026-07-16)
- [x] **done** Queue tests green incl. contention + lease recovery; `queue/stats` accurate
      (full unit suite passed after the e2e/vitest script split)
- [x] **done** Panels open/close via buttons + keyboard (`[`, `]`, `` ` ``, Esc); open/tab/filter
      state persists per company in `localStorage` (Playwright `company-workspace`)
- [x] **done** Assistant answers read-only lookup questions (deterministic intents; Playwright
      covers `queue status` + reload persistence)
- [x] **candidate** Playwright M1 flows green: `companies.spec.ts` (template form) +
      `company-workspace.spec.ts` (canvas, panels, shortcuts, module store, assistant) under
      `DEV_AUTH_BYPASS=1`; complete local suite passed — **not** full Clerk sign-up flow 1;
      remote CI e2e job first run pending
- [x] **done** agent-docs updated (this session, D-022)

**G1 gate verdict (2026-07-17):** implementation **complete as a gate candidate**; formal G1
sign-off **pending** the remote CI e2e run and zero-trust IronBee browser pass. Local typecheck,
lint, unit tests, and the complete two-spec Playwright suite pass. IronBee DevTools was
unavailable — no IronBee verification claimed.

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
- Remaining M1 gate items at that session (later shipped in D-022): panel keyboard routes,
  read-only assistant, Playwright flows.

## Session 2026-07-17 (shell + spec panels, decision D-019)

- **App-shell ribbon shipped** (DevSpecs ui-ux spec): company switcher dropdown, executions
  ticker tape, gated paper/live master switch, top drawer (Ledger/PnL, Trading profile,
  Settings, Philosophy — both editable fields PATCH the company API).
- **Panel geometry now matches the spec:** left Research/Data sources; bottom Trends /
  Scenario engine / Watch lists / Decisions + traces with a per-module selector; right
  Verify / Executions / Ledger (with open positions) / Sims / Values. All collapse to slim
  strips. `ActivityPanel` retired.
- **Typed node handles:** data-in (left), data-out (right), control-in (top), tools-out
  (bottom), colored by type; link kind derived from the handle pair on connect; edges
  animate only while touching modules have active jobs.
- **Watch lists:** `watchlist_items` table (migration `0003_bitter_piledriver`), CRUD API
  scoped to trading/trend modules, inspector add-form, bottom-panel view.
- **New read APIs:** `/executions`, `/verifications`, `/simulations` (placeholder), all
  ownership-scoped. Verified in the browser end-to-end; typecheck/lint/tests/build green.
- Remaining gate items at that session (later shipped in D-022): panel keyboard routes,
  read-only assistant, Playwright flows.

## Session 2026-07-17 (pipeline spine + settings + display, decision D-021)

- **v1 pipeline spine (deterministic placeholders):** `concepts`, `lead_packages`,
  `decision_trees`, `compile_events` + handlers `research.curate` / `trend.promote` +
  APIs (concepts/leads/trees/timeline/promote/curate). Verified promote e2e:
  six gates pass → tree dispatched → compile → paper fill.
- **Research/Trend/Decision UI:** left-panel create research + data source; concepts
  browser with Curate now; bottom Trends Add-candidate + Promote; Scenario engine
  six-gate strip; Decisions → TraceTimeline modal; Justification hover honesty.
- **User settings modal:** encrypted per-user Anthropic/Mistral/Groq keys
  (`user_api_keys`, migration `0005_smiling_kid_colt`).
- **Display nodes:** new `display` module type (table/list/ledger/chart/graph) in
  contracts, palette, inspector config form.
- Remaining at that point: wire saved user keys into `@hftr/llm` call path; galaxy view;
  assistant; Playwright; keyboard panel routes (all addressed in D-022 session below).

## Session 2026-07-17 (assistant, panel persistence, Playwright, decision D-022)

- **Deterministic read-only assistant shipped:** `assistant_messages` migration +
  `GET/POST /api/companies/:companyId/assistant` + `AssistantDock`. Six regex-routed lookup
  intents; no Mistral/Groq calls; honest "no model calls" chrome. History survives reload.
- **Panel keyboard + persistence shipped:** `[` / `]` / `` ` `` toggles and Esc collapse on all
  three panels; per-company `localStorage` for open state, tab, and bottom module filter.
- **Playwright infrastructure:** `@playwright/test` in `apps/web`, `playwright.config.ts` (port
  3001, `DEV_AUTH_BYPASS=1`, Clerk keys cleared), `e2e/fixtures.ts` (company archive on
  teardown), `companies.spec.ts`, `company-workspace.spec.ts`. Vitest excludes `e2e/**`.
  Optional CI `e2e` job applies migrations to service Postgres then runs `test:e2e`.
- **Verification recorded:** typecheck, lint, unit tests, and the complete two-spec Playwright
  suite pass locally after assistant race/intent fixes. Remote CI e2e first run pending;
  IronBee browser MCP unavailable (not claimed).
- **Still open for later milestones:** Mistral assistant chat, write proposal cards, full Clerk
  sign-up Playwright flow 1, IronBee zero-trust browser pass, formal G1 sign-off.
