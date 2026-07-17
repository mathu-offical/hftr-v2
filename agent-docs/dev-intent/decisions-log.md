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

- **D-017 (git commits, 2026-07-17):** Workspace git commit standards: Conventional Commits
  with hftr-v2 scopes (`web`, `canvas`, `engine`, `db`, `contracts`, etc.), subject ≤72 chars
  imperative, structured body in fixed order (Context, Why, What changed, Connections,
  Verification, Next steps). One logical intent per commit; bundle code with agent-docs.
  Pre-commit typecheck/lint/test for runtime changes. Rule: `.cursor/rules/git-commits.mdc`;
  skill: `.cursor/skills/commit-message/`; command: `/commit-session`.

- **D-018 (end-of-run commits, 2026-07-17):** Workspace policy — implementation runs must
  **commit verified work before ending**. Fixed close sequence: verify → curate docs → commit →
  report. Push remains user-request-only. Updated rules, skills, and workflows accordingly.

- **D-019 (app-shell ribbon, spec panels, typed handles, watchlists, 2026-07-17):**
  Implemented DevSpecs/ui-ux.spec.md's shell and panel geometry (parallel sub-agent build).
  (a) Top ribbon: company dropdown, executions ticker tape (marquee over `/executions`),
  gated paper/live master switch, and a top drawer with Ledger/PnL, Trading profile,
  Settings, and Philosophy (editable, PATCHes the company). (b) Panels: left
  Research/Data-sources, bottom Trends/Scenario-engine/Watch-lists/Decisions+traces (with
  per-module selector), right Verify/Executions/Ledger(+positions)/Sims/Values — replacing
  the single ActivityPanel; all collapse to slim strips rather than full slide-overs (that
  behavior stays on the roadmap). (c) Canvas nodes now expose four typed handles (left
  data-in, right data-out, top control-in, bottom tools-out), colored by type; edge kind is
  derived from the handle pair; edges animate only while the touching modules have active
  jobs. Handles are presentation-only in the link payload for now. (d) New `watchlist_items`
  table + CRUD API (trading/trend modules only) with an inspector add-form; executions,
  verifications, and placeholder simulations APIs back the new panels. Template enum
  drift in `CreateCompanyInput` removed — `CompanyTemplateId` is the single source.
  Verified in the browser: ticker showing fills, drawer PnL rollup, watch-list add →
  bottom panel row, decisions tab joining traces to verification passes, trends tab.

- **D-020 (per-file commit bodies, 2026-07-17):** Commit messages were still too truncated
  (paragraph subjects / incomplete file coverage). Strengthened standards: agents **must**
  invoke `commit-message` skill at end of every run; inventory every dirty file via
  `git diff --name-status`; publish an explicit chunk plan; each commit body lists **every
  staged file** under `Files changed` (path + what + why); bullet count must equal staged
  file count. New workflow/command: `end-of-run.md` / `/end-run`. Paragraph-only messages
  and truncated file lists are forbidden.

- **D-021 (pipeline spine, user settings keys, display nodes, panel create UX, 2026-07-17):**
  Coordinated FE/BE pass against DevSpecs ui-ux + init + dev-notebook. (a) Ported v1
  activation → tree → compile spine as deterministic placeholders (`concepts`,
  `lead_packages`, `decision_trees`, `compile_events`; handlers `research.curate` /
  `trend.promote`); e2e promote yields filled paper trace. (b) User settings modal for
  Anthropic/Mistral/Groq keys encrypted at rest (`user_api_keys`, AES-GCM via
  `SETTINGS_ENCRYPTION_KEY`). (c) `display` module type with kind table/list/ledger/
  chart/graph. (d) Left-panel create research/data-source; bottom Add-candidate +
  Promote + gate strip + TraceTimeline + Justification honesty popovers. (e) Manual
  POST `/trends` records operator_input ValueRef for drift. LLM call path still reads
  env keys only until user-key injection lands (follow-up).

- **D-024 (inline module setup + separate operating budgets, 2026-07-17):** Resolved OQ-9 from
  operator clarification. (a) **Scope:** capital allocation applies only to capital-bearing
  `holding_fund`, `fund_router`, and `trading` modules; LLM/API-provider operating budgets remain
  a separate meter paid through provider keys. Topic/sector is required for research, library,
  live API, trend, trading, simulator, and analyzer nodes. Capital-bearing nodes also require a
  target exit. Utility/policy/display/Math nodes are not given nonsensical setup requirements.
  (b) **Creation:** company templates and module-store engine templates expose highlighted inline
  allocation, topic/sector, and target-exit controls. Complete setup applies shared values to
  matching template nodes. **Skip setup** creates the graph in draft state and opens the canvas
  with text-visible required-field chips. (c) **Node controls:** required controls render directly
  inside the selected canvas node; incomplete nodes suppress the overlapping inspector until
  setup is saved. Draft nodes cannot transition active while required fields are missing.
  (d) **NRA:** `modules.topic_sectors` stores qualitative scope; `capital_allocation_ref` and
  `target_exit_ref` point to append-only `operator_input` ValueRefs (`usd_cents|pct` and
  `timestamp_ms`). Migration `0008_blushing_kronos` adds these fields. (e) **Operating budget
  visualization:** Company → LLM / operating reads user/environment credential source and
  company `llm_budgets` call/cost counters separately from trading capital. Verified: migration
  applied; typecheck/lint/contracts; two-spec Playwright; IronBee create → skip → inline setup
  save → separate provider budget view; no new console errors.

- **D-023 (canonical DevSpecs sync: engines, holding fund, elbows, assistant hardening,
  2026-07-17):** Aligned implementation and agent-docs with `DevSpecs/dev-notebook.md`
  (2026-07-17) and `DevSpecs/ui-ux.spec.md` §Connections. (a) **Company creation &
  templates:** create flow exposes discrete company templates (`blank`, `day_trading_starter`,
  `trend_research_lab`); module store adds insertable `ENGINE_TEMPLATES` (day-trading and
  trend-research engines available; crypto/prediction/HFT gated with honest reasons). Templates
  seed construction/logic only: scope fields use `pending_operator_scope` and instruments are
  empty rather than silently seeding topics/sectors. Per-module allocation amount/percentage,
  topic/sector preset-plus-custom, and target exit date/time — for creation and later engine
  insertion — are **canonical requirements** but **not yet wired** (OQ-9). (b)
  **Function-specific names:** all seeded template
  nodes and palette `defaultName` values describe actual function (e.g. `Market Regime Research`,
  `Paper Seed Holding Fund`, company Math `Deterministic Math Calculator`). (c) **Paper-safe
  seeded engine topology:** `day_trading_starter` and `engine_day_trading` seed
  research → evidence library + paper market/runtime feed → trend → paper execution, with
  `holding_fund → math → fund_router → trading` fund-route links and analyzer/policy
  verification (`Transaction Execution Monitor`, `Paper Trading Policy`); `trend_research_lab`
  seeds research → library → trend only. Fund/router nodes are **canvas topology only** —
  deterministic fund movement is not implemented in this slice. (d) **`holding_fund` module
  type:** added to contracts, DB enum, palette, LINK_RULES (`holding_fund→math|fund_router`),
  and `HoldingFundModuleConfig` (`source`, `allocationPolicyRef`). (e) **Canvas edges:**
  stored/created edges use React Flow `smoothstep` with `ConnectionLineType.SmoothStep` preview;
  rounded right-angle routing with column spacing — **not** true arbitrary obstacle avoidance;
  ELK/pathfinding deferred. (f) **Assistant hardening:** shared Zod contracts
  (`packages/contracts/src/assistant.ts`); `tool_results` persists **summary cards only**
  (`tool`, `summary`, `status`); failed lookups emit explicit cards + server logging; 20 user
  messages/min/company admission cap; Neon HTTP lacks interactive transactions — user +
  assistant rows inserted atomically via one multi-row `INSERT`; migration `0007_left_firestar`
  adds composite index `(company_id, clerk_user_id, created_at)` and `role` CHECK. Assistant
  retention/erasure policy unresolved (OQ-10). Verified locally: typecheck, lint, unit tests,
  production build, and the final expanded-topology Playwright M1 suite pass. Migration `0007`
  local apply and IronBee verification are not claimed.

- **D-022 (M1 assistant, panel persistence, Playwright, gate honesty, 2026-07-17):**
  Closed the remaining M1 shell gaps with honest labeling. (a) **Assistant:** append-only
  `assistant_messages` (company + `clerk_user_id` scoped); `AssistantDock` + assistant API with
  six deterministic read-only lookup intents (`company_summary`, `module_status`,
  `recent_executions`, `positions`, `trends`, `queue_status`) via regex classification —
  **no Mistral/Groq/model calls** in M1; UI states "Read-only · no model calls". Mistral chat,
  write tools, and `assistant_edits` proposal cards remain M2/M4. No `assistant_sessions` table
  yet. (b) **Panels:** keyboard `[` / `]` / `` ` `` toggles and Esc collapse; per-company
  `localStorage` persistence for open state, tab, and bottom module filter. (c) **Playwright:**
  `apps/web/e2e/` (`companies.spec.ts`, `company-workspace.spec.ts`, fixtures with archive
  cleanup), `playwright.config.ts` (port 3001, `DEV_AUTH_BYPASS=1`); vitest excludes `e2e/**`;
  CI `e2e` job. (d) **G1 gate status:** implementation treated as a **gate candidate**, not
  formally signed off — typecheck, lint, unit tests, and the complete two-spec Playwright suite
  pass locally after assistant race/intent fixes. The new CI e2e job has not run remotely yet;
  IronBee browser MCP was unavailable, so **no IronBee verification is claimed**. Formal G1
  sign-off waits on those two external verification surfaces.

## Open questions

- **OQ-9 (resolved 2026-07-17, D-024):** Capital applies only to capital-bearing modules;
  provider/LLM operating budgets are separate. Company and engine template setup is inline with a
  Skip path; incomplete draft nodes show required-field chips and expose the same controls inline
  on selection. Financial and target-exit values resolve to append-only ValueRefs.
- **OQ-10 (open):** Assistant message retention and erasure policy — TTL, company archive
  behavior, account deletion, and whether summary `tool_results` history follows the same rules
  as `content`. No policy encoded yet; `assistant_messages` remains append-only with no purge
  job.
- **OQ-8 (open):** When user-saved LLM keys exist, should they override env keys, or
  should env remain the deployment default with user keys as optional personal overrides?
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
