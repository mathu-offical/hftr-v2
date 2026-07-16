# M1 Sprint Spec — Company Canvas + Module CRUD + Queue Spine

Execution-level detail for milestone M1. Depends on G0 passing.

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
