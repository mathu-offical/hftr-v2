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

- **D-026 (canvas node dashboard: labeled ports, fixed card, naming, 2026-07-17):** Operator
  approved design in `ui-ux/canvas-node-dashboard-design.md`. (a) **Ports:** one labeled handle
  per accepted `LinkKind` inbound/outbound (not four anonymous data/control/tools points).
  (b) **Card:** fixed-size dashboard with always-visible editable high-level fields; no
  expand-on-select. Click chrome → inspector; fields stay interactive on-canvas. (c) **Validation:**
  missing fields show per-field **Required · label** chips and warning borders; confirmed fields
  use neutral borders and subtle in-field green checks. Setup saves via explicit **Save setup**
  (not blur/Enter). (d) **Names:** auto-derived from function + connections until
  customized; inspector **Restore generated name** (`restoreGeneratedName` PATCH). (e)
  **Supersedes D-024 §(c)** expand-selected / suppress-inspector-while-incomplete.
  **Implementation complete** (migration `0011_canvas_node_generated_names` → `generated_name_base`,
  `name_customized`; API `generatedNameBase`, `nameCustomized`, `restoreGeneratedName`; `ModuleNode`
  dashboard, `InspectorPanel` restore-name). **Migration hardening:** `0011` backfills
  `generated_name_base = name` and marks all legacy rows `name_customized = true` before applying
  `DEFAULT false NOT NULL` for future rows. Graph edits therefore preserve pre-D-026 operator
  names; legacy Restore uses the migrated name as its base because earlier base provenance does not
  exist, while new rows retain full generated/custom behavior. Already-migrated local rows were
  manually aligned with the conservative true backfill. Failed edge DELETE restores the edge in
  client state if React Flow removed it before server failure. **Verified (2026-07-17):** migration
  applied after `0010`; `pnpm typecheck`/`lint`/`test` pass (contracts 39, adapters 20, secrets 5,
  llm 13, engine 44); focused Playwright `canvas-node-dashboard.spec.ts` 1/1 (always-visible fields,
  missing Required chips, confirmed in-field checks with neutral borders, labeled ports, fixed
  geometry on chrome-click, explicit **Save setup**, rename + restore generated name); IronBee on
  seeded day-trading company confirmed per-kind handles, always-visible fields, inspector Name +
  generated connection/base text, no new console errors.
  IronBee did not complete customize/restore (pre-migration sample). `company-workspace.spec.ts`
  now reaches and passes the D-026/D-034 setup assertions after exact-label hardening; its full
  run remains red later at an unrelated bottom-panel collapse/expand assertion.

- **D-024 (inline module setup + separate operating budgets, 2026-07-17):** Resolved OQ-9 from
  operator clarification. (a) **Scope:** capital allocation applies only to capital-bearing
  `holding_fund`, `fund_router`, and `trading` modules; LLM/API-provider operating budgets remain
  a separate meter paid through provider keys. Topic/sector is required for research, library,
  live API, trend, trading, simulator, and analyzer nodes. Capital-bearing nodes also require a
  target exit. Utility/policy/display/Math nodes are not given nonsensical setup requirements.
  (b) **Creation:** company templates expose **per-module** inline allocation, topic/sector, and
  target-exit controls (one card per seeded module that requires setup). Operators may add multiple
  extra modules and engines at create time, each with its own inline setup. Shared `templateSetup`
  remains a backward-compatible fallback when per-index entries are absent. **Skip setup** creates
  the graph in draft state and opens the canvas with text-visible required-field chips. (c) **Node controls (superseded by D-026 for canvas
  chrome):** originally required controls rendered inside the selected node and incomplete nodes
  suppressed the inspector — replaced by fixed dashboard body + always-available inspector.
  Draft nodes still cannot transition active while required fields are missing.
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

- **D-025 (paper intent-alignment program + philosophy control plane, 2026-07-17):** Adopted
  the exhaustive paper-only experimentation program. (a) **Docs:** `agent-docs/testing/*`
  (requirements matrix 166 REQs, scenario encyclopedia, axis taxonomy, intent-alignment scoring)
  + `research/paper-experimentation-protocol.md` + `trading-philosophy-guidance.md`. (b) **Cursor:**
  `/paper-experiment` command, `paper-experiment` + `intent-alignment-audit` skills, workflow;
  safety/number-handling/verify-change deltas. (c) **PhilosophyProfile:** contracts +
  `companies.philosophy_profile` + TopDrawer axis controls (min/typical/max); mapper →
  `LeverState` via `enforceAllLayers`; promote reads profile + trading `strategyFamilies[0]` +
  linked policy `policyEnvelopeRef`; compile sizing uses `risk_appetite` → BPS (25/75/200).
  (d) **Provenance/isolation fixes:** synthetic quotes use `sourceClass: synthetic_sim` (not
  `live_feed`); paper traces populate `simulatorGapTags`; `/activity` scopes verifications by
  company trace ids. (e) **Success metric:** intention alignment (declared vs observed), not
  absolute paper P&L. Venues beyond paper_sim remain deferred until adapters exist. Migration
  `0009_philosophy_profile`. Verified: typecheck + unit tests including philosophy mapping.
  Live multi-company browser cohort and IronBee not claimed in this slice.

- **D-027 (real service integration: user keys + ZDR routing + Alpaca isolation, 2026-07-17):**
  Resolved OQ-8. (a) **LLM auth:** only user-saved provider keys authorize provider calls;
  deployment env keys (`ANTHROPIC_API_KEY`, etc.) do not authorize runtime calls (reserved for
  offline tooling). (b) **Model routing:** allowlisted `MODEL_CAPABILITY_REGISTRY` with
  retention class, schema mode, cost, and tier affinity; company `llm_policy` selects profiles
  (`privacy_cost`, `strict_compile`, `premium_quality`). Strict privacy admits `default_zdr` /
  `request_zdr` and Anthropic only when `anthropicZdrAttested`; Mistral stays `unclear` and is
  excluded from strict_zdr until contractually clear. Transport families: Anthropic Messages,
  Mistral chat, OpenAI-compatible (Groq/Cerebras/Fireworks/OpenRouter). Compile default:
  Groq `openai/gpt-oss-20b` (strict json_schema). (c) **Broker isolation:** credentials in
  `broker_connections` encrypted with `CREDENTIALS_ENCRYPTION_KEY` (separate from LLM
  settings); exclusive company bind via unique `companies.broker_connection_id`; paper only;
  admission `min(virtual allocation, broker buying power)`. (d) Shared `@hftr/secrets`
  envelopes; `leakLint` moved to contracts to break llm↔engine cycles.

- **D-028 (ENGINE group visualization + Math multi-attach, 2026-07-17):**
  Persisted ENGINE instances with master topic/sector cascade to member modules. (a)
  **Persistence:** migration `0014_engine_instances` — `engine_instances` table
  (`template_id`, `label`, `master_topic_sectors`, `canvas_bounds`); `modules.engine_instance_id`
  FK (`ON DELETE SET NULL`); `modules.topic_sectors_overridden` for per-member opt-out.
  Company/template creation and `POST /api/companies/:id/engines` insert an engine row and
  stamp members; Math modules never receive `engine_instance_id`. (b) **Topic cascade:**
  `PATCH /api/companies/:id/engines/:engineId` with `masterTopicSectors` fans out via
  `cascadeEngineMasterTopic` to members that have not overridden and require topic/sector;
  module `PATCH` with `restoreEngineTopic: true` clears override and copies master back.
  (c) **Canvas chrome:** `EngineGroupNode` — React Flow structural parent (`type: engineGroup`)
  with dashed bounds, inline master topic editor, delete affordance; bounds from
  `computeEngineBoundsFromPositions` + `ENGINE_GROUP_PADDING`. **UI wiring partial:** component
  and types exist; `CompanyCanvas` still inserts engines via per-module POST (not engines API)
  and does not yet render parent groups or the delete modal. (d) **Delete modes:** `DELETE
  /engines/:engineId` body `{ mode: cascade | ungroup }` — **cascade** removes member modules
  and incident links then engine row; **ungroup** clears `engine_instance_id` on members,
  keeps modules/links, deletes engine chrome only; default without body is **ungroup** (safer).
  (e) **Math tools:** repeatable palette modules; `MATH_TOOL_CONSUMER_TYPES` +
  `isMathToolAttachment` (math→consumer `data_feed` only); Math never an engine member; company
  creation still seeds one Math module but additional Math modules may be created and deleted.
  n8n-style TOOL chrome on consumers deferred in canvas UI. Contracts tests in
  `describe('engine instances (D-028)')`. Playwright `canvas-engine-groups.spec.ts`
  verifies chrome + topic cascade + second-engine insert + ungroup (API-assisted where
  shell overlays intercept RF pointer events). IronBee: Engine chrome on canvas.
  **Status: implemented and verified.**

- **D-029 (dynamic safety limits foundation, 2026-07-17):**
  Codified plan §2 dynamic safety foundation: `@hftr/contracts` limits/guardrails/control-snapshot
  schemas; migration `0013_safety_limits_live_gates` (`control_snapshots`,
  `guardrail_evaluations`, `live_gate_evidence`, `operating_limit_evaluations`,
  `companies.live_armed_at`, `companies.live_gate_evidence_id`); engine deterministic modules
  for catalog-backed operating limits (`computeOperatingLimits` fail-closed on missing inputs),
  guardrail evaluation, and live-gate checklist (24h evidence staleness, operator arming).
  Seeded `live_gate_threshold_bands.json` with `freezeState:
  testing_baseline_v1_not_live_signoff`. Research docs synced under `agent-docs/research/`.
  Billing for limit enforcement deferred; live remains fail-closed until evidence + arming pass.
  (Contracts tests label this slice `describe('dynamic safety contracts (D-028)')` — historical
  comment drift; decisions-log ID is D-029.)

- **D-030 (assistant + simulation retention policy, 2026-07-17):**
  Resolved OQ-10 in place: `assistant_messages` and `assistant_edits` follow **90-day hot
  retention** pending a purge/archive job (same posture as trace hot window). No erasure job
  ships in this slice; `maintenance.retention` counts stale traces only. Billing retention
  (credit ledger) remains separate and deferred.

- **D-031 (live arming ceremony, 2026-07-17):**
  Live dispatch requires persisted `live_gate_evidence` with `overallPass`, evidence &lt;24h,
  operator confirmation phrase `ARM LIVE TRADING`, and `companies.live_armed_at`. APIs:
  `GET/POST .../live-gates/{status,review,arm,disarm}`. `ModeSwitch` surfaces checklist
  text-first; `resolveExecutionContext` + `resolveBrokerAdapter` fail-closed without arming.
  Kalshi demo adapter stub registered; live Kalshi remains blocked.

- **D-032 (billing deferred from production roadmap, 2026-07-17):**
  M4 billing slice (Stripe, Clerk Billing tiers, credit packs) explicitly deferred. M4 non-billing
  work ships: `assistant_edits` proposals, `simulation_runs` API/UI, assistant proposal cards.
  OQ-1 (pricing) remains open until user input.

- **D-033 (scoped canvas Reflow + dedicated Math tools, 2026-07-17):**
  Implemented and runtime-verified (2026-07-17; movable tools + no doubled seed Math 2026-07-17). (a) **Scoped layout actions:** `packages/contracts/src/canvas-layout.ts`
  pure helpers; `PATCH /api/companies/:id/canvas/layout` batch persist; each ENGINE header **Reflow**
  + canvas **Reflow canvas** button; connection-safe template positions + `ENGINE_GROUP_PADDING`
  (112/112/120/160). Trackpad **scroll pans** (`panOnScroll` + `PanOnScrollMode.Free`) and
  **pinch zooms** (`zoomOnPinch`, `zoomOnScroll={false}`). Verified: contracts 54/54; IronBee
  Reflow canvas + engine Reflow visible; layout PATCH 200. (b–d) Migration
  `0018_dedicated_math_ownership` adds unique nullable `tool_owner_module_id`; required analytical
  owners auto-provision reciprocal data-linked Math rows; trading fund routes are rewritten and
  validated through the owner's Math; default company/engine templates no longer route funds
  through the shared company Math seed (holding_fund → fund_router → owner Math → trading).
  Compact `MathToolNode` is independently draggable and persists its position; owner drag moves
  tools by delta without snapping them back. Shared Math attachment badges are suppressed when
  the dedicated compact node is already rendered. Legacy unowned shared Math remains valid and
  is never assigned by migration guesswork.

- **D-034 (subtle confirmed-field validation, 2026-07-17):**
  Implemented and verified (2026-07-17). Missing setup fields keep their explicit warning border
  and **Required · label** chip. Confirmed fields return to normal neutral input chrome and show
  only a subtle green check chip inside the field's trailing edge, without a confirmed-state text
  chip or green field border. Capital allocation places the check inside the value input, while
  target-exit spacing avoids the native calendar control. The shared `ModuleSetupFields`
  implementation owns this behavior across company creation, engine setup, and canvas nodes, with
  pointer-transparent chrome and screen-reader text `Confirmed: {field label}`. Verification:
  `pnpm --filter @hftr/web exec tsc --noEmit` PASS; `pnpm --filter @hftr/web lint` PASS; focused
  `canvas-node-dashboard.spec.ts` 1/1 PASS; IronBee ARIA exposed `Confirmed:` statuses for all
  three fields, cropped node screenshot confirmed checks inside topic, allocation value, and
  target-exit fields with native calendar spacing, and incremental console check after sequence
  1427 returned no new errors. `company-workspace.spec.ts` reached and passed the D-034 assertion
  block after exact-label hardening; no full-spec pass is claimed because it later fails at an
  unrelated bottom-panel collapse/expand assertion.

- **D-035 (ENGINE full shared setup on group chrome, 2026-07-17):**
  Engine groups show **all** insert setup on the group node — topic/sector, **total capital
  envelope**, **overall exit**, and template inputs — not topic alone. Migration
  `0016_engine_setup_fields` adds `capital_allocation_ref`, `target_exit_ref`, `setup_snapshot`,
  `template_inputs` on `engine_instances`. `PATCH` with `setup` records engine ValueRefs,
  persists the operator-visible snapshot, and cascades: topic (non-overridden members), capital
  as equal split across capital-bearing members, exit as the same overall deadline to
  exit-bearing members. `ENGINE_GROUP_PADDING.top` increased for chrome height.
  Verification (2026-07-17): IronBee on day-trading canvas — engine chrome shows Shared
  setup hint + topic/capital/exit fields; PATCH `/engines/:id` with full setup returned 200;
  `setupSnapshot` + engine ValueRefs persisted; topic cascaded to research/library/live_api/
  trend/analyzer/trading; capital+exit refs cascaded to trading/holding_fund/fund_router.
  Member capital draft inputs still do not hydrate from ValueRefs (pre-existing ModuleNode gap);
  engine chrome is the operator-visible source of truth for envelope amounts.
  Company create + module-store insert prefill default envelope splits for included capital
  nodes (`defaultMemberSetupDrafts` / `withDefaultEngineSetup`); extra engines at create use
  `cascadeEngineSetup` instead of stamping the full envelope onto every member. Skip-setup
  create/insert still cascades capital+exit defaults server-side (topic remains operator-required).
  **Regression fix (2026-07-17 evening):** engine chrome briefly lost full shared setup after Math
  reflow work — `EngineGroupNode` topic-only, page hydration omitted `setupSnapshot`/
  `templateInputs`, and `PATCH /engines/:id` ignored `setup`. Restored D-035 UI + PATCH cascade
  + SSR hydrate; layout floors raised so owner/tool envelopes (`LAYOUT_ROW_STEP`) and group
  top padding (300) clear taller setup cards and dedicated Math docks.
  **Status: implemented and verified.**

- **D-038 (Math top data ports + fund-only-via-Math, 2026-07-17):**
  Math modules accept owner `data_feed` on the **top** edge; fund_route is **left in / right
  out**. `LINK_RULES` remove fund endpoints from trading and other model-bearing nodes;
  `isLegalFundRoute` requires Math on at least one end among {math, holding_fund, fund_router}.
  Seed path: `holding_fund → shared Math → fund_router → trading owner Math`; trading receives
  capital as `data_feed` ValueRefs from its dedicated Math (no fund_route into LLM nodes).
  Verification (2026-07-17): contracts 76 ✓; IronBee MathToolNode handles
  `data_feed` top in/out + `fund_route` left/right; trading exposes no fund handles.
  **Status: implemented and verified.**

- **D-039 (research bus + multi-source gather + admission default, 2026-07-17):**
  Research is an autonomous two-phase pipeline: model-free `research.gather` (Brave + SEC +
  market/news, allow/blocklists) → model-free `research.validate` → optional strategic
  `research.synthesize` → model-free `research.admit`. `research.curate` is a thin orchestrator;
  `research.company_sweep` fans out across active research modules. Query origins: manual,
  module-auto (linked trend/promote), company sweep, cadence. Admission default
  `auto_admit_validated` with per-module `require_operator_approval`. Evidence persists
  append-only (`research_evidence`); promote `evidence_fit` consults admitted library refs when
  library concepts exist (not freshness alone). Migrations `0019`–`0021`; research keys in
  `user_research_keys` (Brave / market_news).
  **Status: implemented; research UI Slice 5 polished (left-panel admission, multi-poll run
  status + validation, galaxy provenance fields, library bulk approve/reject); browser verified
  2026-07-17 on sample company.**

- **D-041 (canvas module_links drive pipeline data flow, 2026-07-17):**
  Canvas edges are authoritative for research/trend/promote data transfer: graph resolver in
  `packages/engine/src/graph/module-links.ts`; multi-hop `research→library→trend` for
  module-auto curate; `trend→trading` directive for promote target; inbound `library→trend` /
  `live_api→trend` for evidence scope and scan symbols; `research→library` for admit targets
  and library gather EvidencePackages. `fund_route` graph walker (`fund-route-walker.ts`) now
  proposes module↔module transfer hops along legal paths (REQ-DEF-001 partial). Propose API
  accepts optional `commit: true` to insert `requested` fund_transfers rows (`requested_by:
  module`); approval inbox still required for settlement — no auto-settle. **Status: implemented;
  unit tests on graph helpers + fund-route walker + transfer row mapping.**

- **D-042 (engine node families + v1 detail mapping + typed Math/research, 2026-07-17):**
  Canvas stays operator modules; v1 stages (`research_topic`…`loop_refine`) map into owning
  nodes and surface in a **detail modal** (observe + bounded tune). Shared control plane for
  user + LLM (user owns high-level directives; opt-in manual on any in-envelope lever).
  Execution ENGINEs = full spine with specialties (day/crypto/prediction/long_term/hft).
  Research ENGINEs specialize by research type (web fabric, filings, seed mechanisms, event,
  market regime lab, crypto context, prediction niche, desk-aligned, multi-curator).
  New `librarian` module type; research/library/math subtypes in config; typed Math
  (`company_hub`, `fund_path`, `desk_execution`, `trend_signal`, `research_metric`,
  `analyzer_reconcile`, `simulator_sandbox`, `session_calendar`). Spec:
  `architecture/engine-node-family-design.md`. **Status: implemented (contracts + templates +
  librarian module + typed Math + process detail modal + inspector forms); browser E2E for new
  research ENGINE insert pending follow-up.**

- **D-043 (engine-centric company create, 2026-07-17):**
  Company create requires **≥1 engine**. Operators compose engines as cards (add/remove freely);
  each card holds template inputs + shared topic/capital/exit (module-store parity). API
  `CreateCompanyInput.engines` is `min(1)`; graph seed is Math hub + engines (+ optional
  standalone `extraModules`). Create UI: **Research | Execution** add strips, React Flow
  **canvas preview** (template links + dashed research-dep edges), seed chips, selected-engine
  inspector; execution setup **cascades live** into auto research deps (`cascadedFromKey`).
  Gated engines render as **Locked · …**. Former company templates are no longer a separate
  POST graph seed. User settings modal stays fixed-height with scrollable tab panel.
  Company **duplicate** batches Math tool rows after owners (Neon HTTP FK order).
  **Status: implemented** (contracts + POST `/api/companies` + `CreateCompanyForm` + e2e/docs).

- **D-044 (company sector focus presets, 2026-07-17):**
  Company create exposes optional multi-select **sector focuses** from a wide predefined
  catalog (`SECTOR_FOCUS_PRESETS` in contracts — tech, finance, healthcare, energy, consumer,
  industrial, macro, alt). UI: searchable combobox beside philosophy (type to filter, Enter
  to add). Max 12 labels; persisted as `companies.sector_focuses` (migration
  `0024`). Selecting focuses pre-seeds engine and topic-scoped module drafts and, on create,
  fills `masterTopicSectors` when engine setup omits topics. Operators can still edit per-engine
  topic text. **Status: implemented.**

- **D-046 (direct market/news research sources, 2026-07-17):**
  Research gather adds first-class `alpaca_news` / `alpaca_bars` (paper broker creds),
  `finnhub_news`, and `polygon_news` beside Brave / Marketaux / SEC. Operator keys for
  Finnhub and Polygon live in `user_research_keys`; Alpaca news/bars reuse paper
  `broker_connections`. Evidence is leak-linted qualitative only (no OHLC/quote digits).
  CLI smokes: `pnpm smoke:llm`, `pnpm smoke:research`, `pnpm smoke:alpaca-paper`.
  Cursor skill/rule/workflow: `external-integrations`. Matrix:
  `research/integrations-matrix.md`. **Status: implemented** (adapters + migrations
  `0025`/`0026` + settings UI + smoke scripts).

- **D-036 (auto-disarm + drain latency, 2026-07-17):**
  `autoDisarmCompany` clears `live_armed_at` and `live_gate_evidence_id` on broker verify
  failure, stale evidence while armed (`live-gates/status`), and `resolveExecutionContext` block.
  `drainQueues` records claim-to-complete max/p95; exposed via `/api/queue/stats` `lastDrain`.
  OQ-2 interim research baseline: market-hours p95 > 30s → evaluate dedicated worker (runbook).
  Archive-first retention ships in D-036/G6 slice (`0017_archive_retention`).

- **D-037 (model profile promotion thresholds, 2026-07-17):**
  `privacy_cost` → `strict_compile` when verificationPassRate ≥ 0.85, leakCleanWindow, paperTradeCount
  ≥ 5, intentAlignmentScore ≥ 0.7. Evaluator in `packages/engine/src/llm-profile/promotion.ts`;
  automation hook not wired — thresholds are research baseline pending soak data.

- **D-040 (research topics + nested galaxy + hybrid articles + usage telemetry, 2026-07-17):**
  Research agents create **topics** as organizations of multiple concepts (company DBs,
  seeded knowledge, external gather) — topics are **not** galaxy nodes; nodes remain concepts
  and tags. UI: left-panel topics list; main Research overlay tabs **Galaxy | Article**;
  hard nested library circles; topic focus = dim unrelated + darker subtly animated path/hull
  + fly-to; rotating info-tag layer; hybrid article = agent synopsis with semantic inline
  links + ordered concept sections (research/librarian curation). Topics/concepts track
  query and reference counts for system optimization and visual weight. Spec:
  `ui-ux/research-galaxy-topic-view-design.md`; mirrored in `ui-spec.md` §4/§6,
  `product-spec.md`, `data-model.md`. **Status: implemented** — migration `0022`; APIs;
  Research overlay Galaxy|Article; nested GalaxyView hulls with hard nest clamp; topic focus
  dim/path + zoomToFit + include-neighbors; Article `[[wikilink]]` resolve; synopsis leak lint;
  library filter chips; query bump-once; topic membership + usage. Playwright
  `research-galaxy-topics` pass. Remaining for G2 sign-off: credentialed provider soak.

- **D-045 (compile-time catalog → company libraries/galaxy bootstrap, 2026-07-17):**
  Vendored `catalog_entries` alone are not operator-visible. `bootstrapCompanyKnowledge`
  (`packages/engine/src/libraries/bootstrap.ts`) idempotently: (1) ensures `libraries` rows for
  every `library` module plus a dedicated **Seeded trading mechanisms** nest, (2) upserts all
  rows in `SEED_CATALOG_NAMES` as leak-lint-safe, catalog-payload-derived `concepts` with
  `sourceClass: catalog_seed` (not placeholder stubs), `auto_admitted` membership, and typed
  links, (3) when a research module exists, creates hybrid topic **Seeded trading mechanisms**
  with `[[wikilink]]` synopsis for the Page tab. Wired on company create, library module create,
  and GET ensure paths for libraries / research graph / topics so existing companies backfill
  (and refresh former placeholder bodies once into `catalog_seed`). Deterministic curate uses
  the same body builder. Daily system-curated libraries (movers/trends/policy) remain deferred.
  Aligns with DevSpecs research-library philosophy (compile-time seeded mechanisms).
  **Note:** D-044 remains company sector focus presets; this bootstrap decision is D-045.

- **D-047 (research archive + confidence bands + system chips, 2026-07-17):**
  Soft-delete is the primary cleanup path: concepts/topics/libraries get `status=archived`
  + `archived_at`. Left-panel **Archive** lists soft-deleted rows; **Restore** reactivates;
  **Clear archive** hard-deletes archived runtime rows only. **Archive runtime** soft-deletes
  non-`catalog_seed` concepts and non-seeded topics/libraries. Seeded trading mechanisms
  library/topic and `catalog_seed` concepts are protected. Qualitative `confidence_band`
  (`low|medium|high`) on concepts and topics bumps on admit/accept/verify/refine.
  Shared `ResearchMarkdown` renders optional `[[sys:kind:id]]` chips. Design:
  `ui-ux/research-archive-confidence-design.md`.

- **D-048 (multi-domain research source registry + free/open fan-out, 2026-07-17):**
  Research gather is pre-optimized for **any ready source at any time**:
  `RESEARCH_SOURCE_REGISTRY` + `selectReadySourceKinds` / `resolveDefaultSourceKinds`
  auto-select shipped sources whose auth is satisfied (public, research key, or paper
  Alpaca). Max explicit `sourceKinds` raised to **24**; fan-out remains isolated
  `Promise.all`. Free/open domains shipped: Frankfurter FX, CoinGecko crypto, FRED
  macro (key), Alpha Vantage news (key), World Bank indicators. GDELT / Twelve Data /
  Marketstack completed in D-050. Live WebSocket feeds catalogued as candidates
  (not trading path). Matrix: `research/integrations-matrix.md`. **Status: implemented.**

- **D-049 (research tab shelves + floating inspector, 2026-07-17):**
  Left Research tab reorders to: **Submit new topic** → entity search (Topics / Concepts /
  Tags / Libraries) → expandable library shelves as **folders of pages** (system curated,
  runtime, plus one **Baseline seeded** shelf with inline catalog folders by bootstrap
  seed tags — strategy / guardrails / session / broker / trend leads — and optional **tier
  subfolders**) → Pages (topics) list with linked-page highlight → Archive → collapsed
  modules. Galaxy is the sole overlay surface and is **owned by the left Research panel**
  (opens/closes with that panel; overlay × collapses left too; Data tab hides galaxy while
  left stays open). Detail for Page / Concept / Library / Tag opens in a **right floating
  inspector** (no Galaxy|Page tab strip, no left/galaxy inline expand). Folder caret expands
  page leaves; Overview at top of Baseline seeded opens Seeded trading mechanisms when
  present. Design: `ui-ux/research-tab-shelves-inspector-design.md`. **Status: implemented.**

- **D-050 (complete research provider connect + live_api Alpaca poll, 2026-07-17):**
  Finish remaining researched gather sources: GDELT DOC ArtList (one retry on 429;
  smoke treats rate_limited / ping_timeout as soft-ok), Twelve Data + Marketstack qualitative bar/EOD
  entitlement evidence (operator keys). Settings Research tab gains **Verify** for
  all `ResearchKeyProvider` values (`research-verify.ts`). `trend.scan` polls bound
  Alpaca paper quotes via `pollQuotes` when inbound `live_api` modules exist
  (`feedClass: alpaca_iex_paper`, ValueRef provenance). Migration `0029`.
  Updates D-048 stub notes — GDELT/Twelve/Marketstack now shipped. Matrix:
  `research/integrations-matrix.md`. **Status: implemented.**

- **D-051 (live_api lookback via Alpaca 1Min bars, 2026-07-17):**
  `BrokerAdapter.getQuoteAt` optional; Alpaca paper implements via `fetchBars`
  window around lookback. `trend.scan` uses `resolveLookbackQuotes` so drift is
  live→lookback with honest feedClass provenance (`alpaca_iex_paper` both legs
  when bars available). Synthetic remains fallback. WebSocket streaming still
  researched-only. **Status: implemented.**

- **D-052 (company-serial queue + flexible module/engine caps, 2026-07-17):**
  Engines on a company run **sequentially** through one **company-wide** Postgres
  job queue — not in parallel across engines. `claimJobs` skips companies with an
  active lease and keeps ≤1 claimed job per `company_id` per batch (maintenance
  null-company jobs remain parallel). Create/canvas soft caps raised for
  multi-engine flexibility: `MAX_MODULES_PER_COMPANY=200`,
  `MAX_ENGINES_PER_COMPANY=16` (shared contracts constant; create form preflights
  projected slots). See `architecture/job-orchestration.md`. **Status: implemented.**

- **D-053 (compact canvas node labels, 2026-07-17):** Replace path-style generated
  titles (`longBase ← neighborBase · …`) with **`{Fn} · {Focus}`** primary identity
  plus optional muted **`←`/`→` neighbor Fn** connection refs (cap 2+2, `+N`
  overflow). `generatedNameBase` stores the short function lexicon only. Math stays
  primary-only. Customized names unchanged. Contracts:
  `moduleFunctionLabel`, `moduleFocusToken`, `deriveGeneratedModuleName`,
  `splitCompactModuleName`. UI: two-line card title. **Status: implemented.**

- **D-054 (settings Save & verify fail-closed, 2026-07-17):**
  LLM and research key entry show a text-first verify status badge. **Save &
  verify** pings the provider (draft key) before encrypt/persist; failed verify
  blocks save. Anthropic remains format-ok / deferred live ping. LLM verify
  route accepts optional draft `apiKey` (parity with research). Alpaca paper and
  Kalshi demo Save & verify delete provisional credentials if handshake fails.
  **Status: implemented.**

- **D-056 (canvas visual families + role buses, 2026-07-17):** Operator asked for clear
  distinction between data sources vs agents/modules, subtypes, engine backgrounds, and
  connection points specific to the nature of transferred data. Canvas cards gain **family
  chrome** (Data source / Agent / Fund / Tool / Control) with distinct border/accent/wash;
  **subtype chips** from config (library class, venue, trading subtype, …); **engine groups**
  get category-colored washes from `ENGINE_TEMPLATES.category`. Ports keep `LinkKind` as the
  contract but show **role-specific labels** + edge bus rails; edges use kind dash patterns.
  Implementation: `apps/web/components/canvas/canvas-visuals.ts`, `NodePortBuses.tsx`.
  Docs: `ui-ux/ui-spec.md` §3, `canvas-node-dashboard-design.md`. **Status: implemented.**

- **D-055 (integration resilience + Settings auto-probe, 2026-07-17):**
  Connected-service test pass found: (1) saved-key badges stayed **Not verified**
  until manual Verify; (2) one undecryptable research ciphertext aborted
  `loadResearchGatherKeys` and blocked entire gather/query. Fix: Settings open
  auto-probes saved LLM + research keys (pool concurrency 3) with humanized
  failure copy; gather key load soft-skips decrypt failures so public/ready
  sources still run. Operators must Delete + Save & verify after
  `SETTINGS_ENCRYPTION_KEY` drift. **Status: implemented.**

- **D-057 (compile dispatch via instruction finalizer, 2026-07-17):**
  G3 NRA gap: `compile.select` still enqueued raw `quantity` onto `dispatch.paper_trade`,
  and `executePaperTrade` re-recorded operator-shaped refs. Wire: compile payload is
  `{ instructionId, companyId, moduleId, leadId? }`; handler calls
  `executePaperTradeFromInstruction` → `resolveInstructionFromRefs` and reuses the
  compile instruction + ValueRef lineage (DETERMINISTIC envelope). Operator UI trade
  form remains a separate `OPERATOR_INPUT` path. **Status: implemented.**

- **D-056 (canvas visual families + role buses, 2026-07-17):** Operator asked for clear
  distinction between data sources vs agents/modules, subtypes, engine backgrounds, and
  connection points specific to the nature of transferred data. Canvas cards gain **family
  chrome** (Data source / Agent / Fund / Tool / Control) with distinct border/accent/wash;
  **subtype chips** from config (library class, venue, trading subtype, …); **engine groups**
  get category-colored washes from `ENGINE_TEMPLATES.category`. Ports keep `LinkKind` as the
  contract but show **role-specific labels** + edge bus rails; edges use kind dash patterns.
  Implementation: `apps/web/components/canvas/canvas-visuals.ts`, `NodePortBuses.tsx`.
  Docs: `ui-ux/ui-spec.md` §3, `canvas-node-dashboard-design.md`. **Status: implemented.**

- **D-057 (tight canvas density + per-stream dependency ports, 2026-07-17):** Operator asked
  for smaller min zoom, tighter nodes/engines/layout, and **individual stream dependency
  connection points** on every node. Layout floors: `CANVAS_LAYOUT` module 220×240, gutters
  120/100, Math tool 180×40; `ENGINE_GROUP_PADDING` 72/72/140/100. React Flow `minZoom=0.15`.
  Ports: each allowed `LinkKind` exposes a free **bus** handle plus one **stream** handle per
  existing peer (`{kind}-{dir}__{peerId}`); edges attach to stream pins; labels show `← Peer`
  / `→ Peer`. Helpers: `moduleStreamPorts`, `handleIdForStream`, `parseStreamHandle`. UI:
  `use-module-stream-ports.ts`, tightened Module/Engine/Math chrome. Docs: ui-spec §3,
  canvas-node-dashboard-design, canvas-layout-and-dedicated-math-design.
  **Status: implemented.**

- **D-058 (system:movers bootstrap library, 2026-07-17):** First system-curated shelf slice
  so Research tab **System curated** is non-empty after company bootstrap. Engine
  `ensureSystemMoversLibrary` upserts company library **Daily movers watch**
  (`topicScope=system:movers`, `moduleId` null); when empty seeds three leak-clean qualitative
  placeholder concepts (`deterministic_placeholder`, tags `system_curated`/`movers`/`daily`,
  `auto_admitted` `library_concepts`). Wired from `bootstrapCompanyKnowledge` and job handler
  `library.system_movers` (idempotent placeholder refresh for v1 cadence). Live movers data
  replaces placeholders in a later slice. **Status: implemented.**

- **D-059 (fund transfer approve→settled + module ledger conservation, 2026-07-17):** G3 fund
  settlement: operator approve on `fund_transfers` writes company-pool delta and/or paired
  module↔module ledger rows (`moduleTransferLedgerEntries`, amounts sum to zero), sets
  `approvedAt`, and terminal status **`settled`** (not `approved` alone). Propose API may omit
  `amountCents` when `commit` + `sourceModuleId` if `capital_allocation_ref` resolves to
  scale-0 `usd_cents` (`resolveCapitalAllocationUsdCents`); percentage allocations deferred.
  **Status: implemented.**

- **D-060 (trace timeline → Values lineage deep links, 2026-07-17):** Timeline API returns
  `valueRefs` (quantity / limit / fill timeout) from task payload lineage or instruction
  columns. TraceTimeline shows text-first lineage buttons; `hftr:value-lineage-focus`
  opens the right-panel Values tab and loads `GET …/values/{ref}/lineage`. Closes G3 M3.5
  partial for trace→lineage navigation (ui-spec flow 7). **Status: implemented.**

- **D-061 (fund pct capital allocation resolve, 2026-07-17):** Extends
  `resolveCapitalAllocationUsdCents` for scale-4 `pct` refs: floor
  `baseBalanceCents * valueInt / (100 * 10^4)` with fail-closed null when base missing/≤0,
  pct outside (0,100], or floored amount ≤0. Propose API passes company pool balance via
  `getCompanyBalanceCents`. Fixed `usd_cents` path unchanged. **Status: implemented.**

- **D-062 (system:movers daily job_schedule, 2026-07-17):** `ensureSystemMoversSchedule`
  upserts `every:1440` RESEARCH schedule kind `library.system_movers` with `{ companyId }`
  payload; called from `bootstrapCompanyKnowledge` after library seed so materializer can
  enqueue daily placeholder refresh. **Status: implemented.**

- **D-063 (research library UI resource cache, 2026-07-17):** Library shelf chrome uses
  client stale-while-revalidate (`research-resource-cache` / `research-resource-api`):
  libraries, topics, and library page indexes hydrate from memory/sessionStorage; concept
  bodies stay memory-only; folder expand state persists in session. Soft revalidate on
  company mount + 30s while panel open; mutations invalidate then force-refresh; shelves
  header exposes manual refresh. Baseline `libraryConcepts` warm-prefetched after libraries
  load. Design: `ui-ux/research-tab-shelves-inspector-design.md` §Client caching.
  **Status: implemented.**

- **D-064 (company equity recompute on fill, 2026-07-17):** `recomputeCompanyEquity` loads
  company cash + open positions, runs `calculateCompanyEquity`, records derived
  `usd_cents` ValueRef on success, and writes the company projection. Unavailable calc
  preserves last good cents as `stale`. Wired after paper fill and recovered venue fill
  (fail-soft: trade succeeds if projection write fails). Mark TTL default 15s.
  **Status: implemented.**

- **D-065 (drain enqueues maintenance.sweep, 2026-07-17):** `/api/queue/drain` → `drainQueues`
  idempotently enqueues `maintenance.sweep` once per UTC minute before claiming work so
  `materializeSchedules` actually runs in production. Unblocks research cadence and
  `library.system_movers` (`every:1440`) schedule firing (closes gap noted after D-062).
  **Status: implemented.**

- **D-066 (type-lane default placement, 2026-07-17):** Operator asked for better
  default placement by type: research + data sources left, execution + verification right,
  multi-row within lanes, beautiful by default. `rankEngineMembers` now uses `MODULE_COLUMN`
  lanes (compressed when sparse) instead of pure link topology; within-lane order uses
  `MODULE_LANE_ROW` + topo + barycenter crossing reduction. Lanes: research/librarian →
  library/live_api → trend/holding_fund → trading/simulator/generator/fund_router →
  analyzer/policy/display. Company create + engine insert use `layoutEngineTemplateAtOrigin`
  so defaults match Reflow. Docs: ui-spec §3, canvas-layout-and-dedicated-math-design.
  **Status: implemented.**

- **D-067 (strategic Claude→Mistral continuity fallback, 2026-07-17):** When a strategic-tier
  `invoke` resolves to Anthropic and the user has no Anthropic key (or Anthropic returns
  401/403), automatically retry once with `mistral-large-latest` (8192 max tokens) if a
  Mistral user key exists. `mistral-large-latest` is allowlisted for `strategic`. Continuity
  retention (`admitsStrategicContinuityFallback`) admits that path under `strict_zdr` when the
  operator has saved a Mistral key; explicit Mistral tier selection still uses `admitsRetention`.
  Ledger records the actual provider. UI: strategic tier shows configured when Anthropic **or**
  Mistral key is present. **Status: implemented.**

- **D-068 (vault / library node silhouettes, 2026-07-17):** Operator asked for clearer
  fund/capital and data-source appearance. Fund family chip reads **Vault**; cards get
  rudimentary SVG chrome — vault (door/rivets/dial) for `holding_fund` / `fund_router`,
  library shelves + spines for `library`, live-feed aperture + signal bars for `live_api`.
  Agents unchanged. Implementation: `FamilyShapeChrome.tsx`, `MODULE_VISUALS.shape`.
  Docs: ui-spec §3, canvas-node-dashboard-design. **Status: implemented.**

- **D-069 (system library registry + document shapes + librarian scores, 2026-07-18):**
  Seed all system-curated folders (`system:movers`, `execution_logs`, `daily_summaries`,
  `runtime_policies`, `trend_lists`, `sector_news`) via `SYSTEM_LIBRARY_REGISTRY` with rigid
  `SystemDocKind` shapes (`validateDocumentShape` + `scoreDocumentCuration` bands). Specs:
  `architecture/research-document-shapes.md`, `research-relevance-graph.md`. **Status: implemented.**

- **D-070 (live movers/news query plan + evidence-grounded synthesize, 2026-07-18):**
  Deterministic `ResearchQueryPlan` for gather; deeper gates (`sector_scope`,
  `source_credibility`, `corroboration`); synthesize must cite `evidence:{digest}` or
  `seal:{sealId}`. Cadence: `architecture/research-live-system-cadence.md`. Multi-phase
  daily summary schedules (`pre_open`/`midday`/`close`/`post_analysis`) plus calendar-phase
  fallback when payload omits phase. **Status: implemented.**

- **D-071 (curation priors / weak-supervision LFs, 2026-07-18):** Gate + shape validators are
  labeling functions; raw ratios in append-only telemetry; models see bands + repairHints only.
  Spec: `architecture/research-curation-priors.md`. **Status: implemented.**

- **D-072 (verified normalize seal + dual persist reports, 2026-07-18):** Multi-source
  corroboration seals `VerifiedNormalizedBundle` / `SystemNormalizedView`; consumers skip
  re-verify while seal valid; always dual-persist normalized view + readable curated report.
  `research.synthesize` loads seal summaries via `loadSealSummariesForSynthesize`. Spec:
  `architecture/research-verified-normalize.md`. **Status: implemented.**

- **D-073 (soft vault chrome + Math connection order, 2026-07-18):** Operator asked to
  (1) reduce contrast on vault/library/live-feed background structure so silhouettes read
  as wash behind labels, and (2) order Math fund connections logically across engines and
  templates. Chrome strokes use lower alpha (`structureStroke` idle ~0c / selected ~22) and
  reduced element opacities; shaped-card borders softened. Math peer stream ports sort by
  capital-flow / pipeline lane (`holding_fund` → `fund_router` → `math`, else
  `MODULE_COLUMN`/`MODULE_LANE_ROW`), not UUID. Engine/company templates normalize
  `fund_route` Math links as into-Math then out-of-Math via `orderTemplateLinks`.
  Implementation: `FamilyShapeChrome.tsx`, `moduleStreamPorts`, `templates.ts`,
  `fund-route-links.ts`, `MathPortBuses`. Docs: ui-spec §3, canvas-node-dashboard-design.
  **Status: implemented.**

- **D-074 (no secrets in job payloads, 2026-07-18):** Operator BYOK research keys and
  paper Alpaca secrets must never be serialized into `jobs.payload` jsonb. Manual
  curate/query previously decrypted keys at enqueue and spread them into queue rows
  (visible to DB admins/backups for up to 7 days of completed-job retention). Fix:
  `resolveResearchGatherCredentials(db, companyId)` decrypts at `research.gather` /
  `library.system_sector_news` handler time only (mirrors LLM `withUserApiKey`);
  curate/gather Zod payloads are identity + intent; `enqueue()` fails closed via
  `assertNoSecretsInJobPayload`; `maintenance.sweep` scrubs legacy payload rows.
  LLM keys were already header-only and never in prompts. Scheduled research now
  gets the same credential path as manual runs. **Status: implemented.**

- **D-075 (Math dock on parent bottom, 2026-07-18):** Operator asked for Math tools to
  attach to connection points on the **bottom** of parent nodes. Owner cards render
  `data_feed` streams whose peer is `math` on `Position.Bottom` (outs to Math, then inns
  from Math, L→R); Math tools keep data ports on top. Side buses stay for non-Math peers.
  `StreamPortSpec.peerType` + `isMathDockStreamPort`. Docs: ui-spec §3,
  canvas-layout-and-dedicated-math-design, canvas-node-dashboard-design.
  **Status: implemented.**

- **D-076 (company sector-focus → baseline Sector knowledge, 2026-07-18):** Company
  `sectorFocuses` (create wizard labels; optional PATCH) materialize vendored
  `sector_seeds` catalog pages into the single baseline library
  (`Seeded trading mechanisms`), shown as Baseline → **Sector knowledge** with
  per-sector subfolders (`sector_technology`, …). Mapping: contracts
  `sector-focus-seed-map.ts` (preset → coarse sector + optional subsector).
  `ensureSectorKnowledge` runs from `bootstrapCompanyKnowledge` (including
  skip-if-seeded short-circuit) so existing companies pick up focuses on next
  libraries/topics GET; company PATCH re-bootstraps when focuses change.
  Additive upsert — adding focuses seeds more pages; does not wipe prior sectors.
  Distinct from System curated `system:sector_news` cadence (D-069). Docs:
  research-tab-shelves-inspector-design. **Status: implemented.**

- **D-079 (operator research article submit, 2026-07-18):** Users can submit research
  articles as **link** (URL + optional notes) or **raw text** via Research tab control.
  Model-free path: `SubmitResearchArticleInput` → `submitOperatorResearchArticle` →
  concept with `sourceClass: operator`, research_request/evidence bus rows, optional
  library/topic attach. No URL scrape yet (store URL in `externalRef`; OQ for SSRF-safe
  fetch). Philosophy directives deferred. **Status: implemented.**

- **D-077 (canvas card type context + trend item ports, 2026-07-18):** On-card enrichment is
  type-relevant and interactive — `ModuleContextPanel` for `library` / `research` / `live_api` /
  `trend` (class + linked library, research topics + target libs, venue/instruments/feed/poll,
  posture + cadence). Engine master-topic cascade still seeds `topicSectors` but is demoted to
  secondary Scope / Focus seed on those cards. Trend cards grow `TrendListChrome` from
  `trend_candidates`; each row has `directive-out__trend:{candidateId}`
  (`handleIdForTrendCandidate` / `parseTrendCandidateHandle`). Connecting to trading persists
  nullable `engine_instance_id` + `trading_module_id` on the candidate (migration 0034); binding
  edges are UI topology (compile/dispatch per bound engine is follow-up). Canvas GET returns
  `typeContext` projections. Live API inspector form added. Docs: ui-spec §3,
  canvas-node-dashboard-design. **Status: implemented.**

- **D-078 (galaxy hierarchy + shared qualitative similarity, 2026-07-18):** Research
  galaxy nests **folder stars** (catalog/runtime tags) inside library hulls and
  **article orbits** (topics) inside folders; concepts + capped tag satellites sit
  in article orbits. Folder **mass** amalgamates member concept vocabulary
  (`amalgamationMassFromTexts`). Link spring distance blends qualitative
  `weightBand` with pairwise **RelevanceBand** (`low|medium|high`) from the same
  LLM-assist-normalized Jaccard path as librarian `scoreRelevanceBand` (contracts
  `qualitative-relevance`; layout springs in `galaxy-similarity`). Inspector lists
  (topic memberships, library nest, tag matches) render rich markdown excerpts via
  `ResearchConceptPreview` / `ResearchMarkdown`. Docs: research-relevance-graph,
  research-galaxy-topic-view-design, ui-spec § Research. **Status: implemented.**

- **D-079 (rich seeded catalog articles, 2026-07-18):** Catalog-seeded concept bodies

  are full operator markdown articles: Overview, Identity KV table, trends/leads,
  tools/levers/fields as `[[sys:…]]` chips, sub-variants, compound bindings, and
  additional open fields. Tags collect catalog + qualitative axes. Topic overview
  synopsis lists members by catalog with wikilinks. Bootstrap rematerializes bodies
  on upsert. Sys chip kinds extended with `band` / `field` / `symbol`. Seeded
  families also include `compound_strategies` and `recovery_ladders`. Storage remains
  `concepts.body` markdown; Obsidian export is the `.md` path. Docs:
  research-document-shapes. **Status: implemented.**

- **D-080 (inspector GFM + galaxy nest quieting, 2026-07-18):** Seeded Identity KV
  tables require GitHub Flavored Markdown. `ResearchMarkdown` now runs `remark-gfm`
  with scrollable table chrome; concept inspector sets `omitLeadingH1`. List previews
  use prose-only excerpts (`excerptResearchMarkdownBody`) instead of raw mid-table
  slices. Galaxy folder/article hull wireframes and labels are quieter so nested
  hierarchy stays readable. Docs: ui-spec § floating inspector. **Status: implemented.**

- **D-081 (Market posture left hub, 2026-07-18):** Left panel gains always-present
  **Market posture** tab (between Research + Libraries and Data sources). Composite
  `GET /api/companies/{id}/market-hub` projects movers_board seal, watchlists, trend
  candidates, positions (synthetic marks labeled), and per-symbol lead/tree recovery
  ladder stubs. Research tab label becomes **Research + Libraries**. Galaxy overlay
  stays research-only. `POST …/market-hub` enqueues `library.system_movers`; non-flat
  `trend.scan` and admitted `trend.promote` also enqueue movers revalidation (seal
  idempotent). Contracts: `market-hub.ts`. **Status: implemented.**

## Open questions

- **OQ-9 (resolved 2026-07-17, D-024):** Capital applies only to capital-bearing modules;
  provider/LLM operating budgets are separate. Company and engine template setup is inline with a
  Skip path; incomplete draft nodes show required-field chips and expose the same controls inline
  on selection. Financial and target-exit values resolve to append-only ValueRefs.
- **OQ-10 (resolved 2026-07-17, D-030):** Assistant message and edit retention — **90d hot**
  window for `assistant_messages` and `assistant_edits`; purge/archive job pending (same milestone
  as trace cold storage). `tool_results` summaries follow the parent message row. Account-deletion
  erasure flow not implemented in this slice.
- **OQ-8 (resolved 2026-07-17, D-027):** User-saved keys only authorize provider calls; env keys
  do not authorize runtime calls.
- **OQ-7 (resolved 2026-07-16):** Clerk dev-instance keys added to `apps/web/.env.local`;
  the dev bypass self-deactivates (it requires Clerk to be unconfigured). Clerk-hosted
  sign-up UI verified rendering; full automated sign-up E2E pending (Clerk bot protection
  blocks scripted account creation — verify manually or with Clerk testing tokens).

- **OQ-11 (open):** Experiment log home — append experiment scorecards to
  `agent-docs/testing/experiment-log.md` vs DB `simulation_runs` once that table ships (M4).
  Interim: markdown experiment-log.
- **OQ-12 (open):** Commit policy for experiment-only sessions — user rule “commit only when
  asked” vs workspace mandatory end-of-run. Resolve per session until productized.
- **OQ-1 (open):** Credit pack pricing and subscription tier pricing — needs user input before M4.
- **OQ-2 (open):** Criteria/timing for adding a dedicated always-on worker for market-hours
  watchers — decide with M3/M5 latency data. **Interim baseline (D-036):** sustained market-hours
  drain p95 claim-to-complete > 30s triggers worker evaluation; not a final gate.
- **OQ-3 (open):** Alpaca Broker API correspondent relationship for in-app ACH funding —
  post-launch consideration.
- **OQ-4 (open):** Whether to run a one-time import of any v1 database content (currently
  assumed: no; only v1 JSON catalogs are seeded).
- **OQ-5 (open):** Polymarket wallet/key custody design before that adapter ships.
- **OQ-6 (open):** Dashboard/diagnostics slide direction conflict from v1 DevSpecs (top vs
  bottom) — v2 resolves via the three-panel model; confirm no separate diagnostics slide needed.
