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
  **Superseded for runtime connections by D-158** (`calm-bird-16964297`); bold-surf retained
  as `hftr-v2-backup-quota`. Dev-only auth bypass added (`DEV_AUTH_BYPASS=1`): active only when
  Clerk is unconfigured AND NODE_ENV != production; production without Clerk keys fails closed.
  M1 canvas/CRUD/queue spine implemented and verified against the running app (see
  m1-sprint-spec §Progress). Clerk dashboard keys remain a user action (OQ-7).

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
  exit-bearing members. `ENGINE_GROUP_PADDING.top` increased for chrome height (later **D-089**
  moved shared setup into header inline bounded fields and reduced top padding 140→92; the
  pre-D-089 stacked body setup strip is superseded).
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
  120/100, Math tool 180×40; `ENGINE_GROUP_PADDING` 72/72/140/100 (top later **92** under
  D-089 inline header fields). React Flow `minZoom=0.15`.
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
  slices. `urlTransform` preserves `hftr-sys:` chip hrefs (react-markdown otherwise
  strips unknown protocols to `""`). Galaxy folder/article hull wireframes and labels
  are quieter so nested hierarchy stays readable. Bootstrap `skipIfSeeded` short-circuit
  still **rematerializes** stale catalog_seed bodies (skips already-rich D-079 articles)
  so companies created before D-079 pick up rich articles on the next graph/libraries
  GET. Docs: ui-spec § floating inspector. **Status: implemented.**

- **D-081 (Market posture left hub, 2026-07-18):** Left panel gains always-present
  **Market posture** tab (between Research + Libraries and Data sources). Composite
  `GET /api/companies/{id}/market-hub` projects movers_board seal, watchlists, trend
  candidates, positions (synthetic marks labeled), and per-symbol lead/tree recovery
  ladder stubs. Research tab label becomes **Research + Libraries**. Galaxy overlay
  stays research-only. `POST …/market-hub` enqueues `library.system_movers`; non-flat
  `trend.scan` and admitted `trend.promote` also enqueue movers revalidation (seal
  idempotent). Contracts: `market-hub.ts`. **Status: implemented.**

- **D-082 (operator philosophy directives, 2026-07-18):** Append-only
  `operator_philosophy_directives` rows (company- or module-scoped). Operators append
  via TopDrawer Philosophy tab / `POST …/philosophy-directives`. No PATCH/DELETE in
  app code — agents never write these. Research synthesize folds digit-collapsed
  directive text into `ResearchDirective.operatorDirectives`. Distinct from editable
  `philosophy_prompt`. Migration `0035`. **Status: implemented.**

- **D-083 (justification hover expansion, 2026-07-18):** Notebook “JUSTIFICATION POP UPS”
  beyond BottomPanel Trends/Scenario. Shared `Justification` wraps research concept
  inspector titles, TraceTimeline pipeline stages (stage→sourceClass map), Market
  posture movers/watchlists/trends/pipeline rows, and Scenario six-gate cells. Source
  labels stay honest (`system_seal`, model vs deterministic). **Status: implemented.**

- **D-084 (15s equity refresh cadence, 2026-07-18):** Company-equity plan Task 6.
  Pure planners in `packages/engine/src/equity/refresh.ts`; `maintenance.sweep`
  enqueues idempotent `equity.refresh` per active paper company when XNYS session is
  open/midday/power_hour (15s window keys). Closed/overnight/pre_market deferred.
  Handler recomputes via `recomputeCompanyEquity(…, 'schedule')`. **Status: implemented.**

- **D-085 (Market posture dashboard overlay, 2026-07-18):** Market posture opens a
  canvas overlay (galaxy-style) with equity chart that refocuses on selected
  holdings (accent mark path), sector movers, report nav into Research concepts,
  and higher-detail position cards showing **presiding engine chips** (from
  position module + symbol-linked trend binds). Left rail is a category navigator
  (positions / watchlists / trends / plans). Hub API adds `equity`, `sectorFocuses`,
  `reports`, and `engines[]` on positions/watchlists/trends. **Status: implemented.**

- **D-086 (granular seeded research directives, 2026-07-18):** Topics are
  **research-module directives** (module-side). Concepts, tags, trends, and functions
  remain **library-side**. Bootstrap no longer dumps every catalog concept into one
  mega-topic. It seeds a parent program **Seeded trading mechanisms** plus child
  directives: Strategy families Tier A/B/C, Compound strategies, Recovery ladders,
  Guardrails, Session constraints, Broker policy, Trend lead patterns, Compliance
  packages, Event archetypes, Macro triggers, and Sector knowledge. Each child owns
  filtered `topic_concepts` membership; the program synopsis links children. Topics
  may spawn further articles/libraries during agent work. Archive protects the full
  seeded title set. Pages list renders `parent_topic_id` as an indented tree. Docs:
  research-galaxy-topic-view-design, ui-spec, data-model. **Status: implemented.**

- **D-087 (paper-spine correctness hardening, 2026-07-18):** Gap analysis top risks:
  (1) `liveGateBlocked` from `isLiveDispatchAllowed` via `resolveExecutionContext`
  (paper always unblocked; live fail-closed until armed + fresh overallPass evidence)
  — no longer hardcoded `true`. (3) `realizedLossCents` from company position book
  loss magnitude. (5) promote wires `buildRegimeSynthetic` → `regimeTrendUp` so
  regime_fit is numeric. (7) compile sizing prefers trading-module ledger →
  holding_fund → company pool (`resolveCompileBalanceCents`). Justification hover
  expansion remains D-083; equity refresh D-084. **Status: implemented.**

- **D-088 (Master Clock + Time processors + Math Calc-ref + denser cards, 2026-07-18):**
  Promotes D-009 temporal authority onto the canvas the way Math promotes D-008.
  Module types `clock` (company singleton, auto-seeded, not ENGINE member) and
  `time` (repeatable tool-family processors: elapsed / add_duration / timezone_convert /
  session_window / schedule_ref). LINK_RULES: clock→time|trading|trend|policy|analyzer|math;
  time→trading|trend|policy|analyzer|display|math (`data_feed`). Owner↔Math collapses to
  one Calc-ref connection (math→owner `data_feed`; UI labels by info type, not peer names).
  Layout floor `moduleHeight` 240→168; ModuleNode/context/trend chrome denser. **D-091 follow-up:**
  engine motherboard `clock` utility bind supersedes direct clock→member for new engines.
  Follow-up: force every schedule through a Time node at compile. Plan draft called this D-078; that ID
  was already used for galaxy hierarchy. Docs: number-handling §8, ui-spec §3,
  engine-node-family-design, canvas-layout-and-dedicated-math-design.
  **Status: implemented.**

- **D-089 (engine header inline bounded setup fields, 2026-07-18):** ENGINE group shared
  setup (topic/sector, capital mode+value, target exit) and template inputs move from a
  stacked body strip into the **header** as one wrap row of bordered (“bounded”) inline
  fields (`ModuleSetupFields` `layout="inline"`). `ENGINE_GROUP_PADDING.top` 140→92.
  Drag remains on chrome; fields stay `nodrag nowheel`. **D-091** adds a separate bottom
  utility rail; setup fields remain header-only. Docs: ui-spec §3,
  canvas-engine-group-design, canvas-layout-and-dedicated-math-design.
  **Status: implemented.**

- **D-090 (paper-spine service bindings + gate/limit hardening, 2026-07-18):** Continues
  D-087 gap closure: (a) `evidence_fit` never company-wide-scans when library→trend
  links are empty — linked libs always consult admitted refs (empty fails until curated);
  unlinked trends stay freshness-only. (b) `market_structure_fit` fail-closed for live
  unknown feed class; paper keeps waiver. (c) daily-loss limits use fresh
  `companies.equityCents` when available + session-window loss from
  `realized_pnl_events` (not cash-ledger buy debits). (d) `module_service_bindings`
  table + `resolveCompanyServiceBindings` after broker verify / company / engine /
  module create; GET `service-coverage`; positions carry connection_id/venue on fill.
  Migration `0036`. Docs: data-model. **Status: implemented.**

- **D-091 (engine motherboard I/O + research terminal analyzer + auto-hydration, 2026-07-18):**
  ENGINE group chrome becomes a **motherboard** with typed utility buses (`data_in`, `data_out`,
  `clock`, `funds`, `system_control`) persisted on `engine_utility_links` — distinct from
  `module_links`. Research/trend_research categories expose data + clock + control; execution
  categories also expose `funds`. Inter-engine qualitative streams pair `data_out→data_in` via
  opaque `stream_id` + descriptor (no raw numbers/datetimes). **Auto-hydration** on insert via
  `ensureEngineMotherboardUtilities`: clock utility bind; funds bind when category exposes it
  and a `holding_fund` exists; analyzer `data_out` stub; topic project into non-overridden
  members; **Time hub** (`provisionEngineTimeHub`) with clock→time→time-bearing members;
  terminal **analyzer** as the last step on research ENGINEs; library display names from topic
  + inbound sources (`deriveLibraryDisplayName`). Canvas: unique in/out utility handles,
  engine↔engine and module→engine utility edges, DELETE API. **AnalyzerModuleConfig** `emitMode`:
  `to_library` | `to_desk_stream` | `verify_loopback`. Direct `clock→consumer` deprecated;
  activation requires Time inbound for `TIME_BEARING_MODULE_TYPES`. Layout pins Clock/Time to
  a bottom cadence rail. Setup stays D-089 header inline fields. Docs:
  `architecture/engine-motherboard-io-design.md`, data-model, engine-node-family-design,
  number-handling §8a, canvas-engine-group-design, ui-spec §3, product-spec, plans,
  requirements-matrix. Migration `0037`.
  **Status: implemented.**

- **D-092 (compound movers / watchlist suggestion algorithm, 2026-07-18):** Master
  `library.system_movers` path hydrates entitled research lanes + libraries, optionally
  invokes orchestration-tier LLM for envelope-bound `SuggestionThresholdProfile` presets
  (fail-closed → typical catalog anchors 20/60-class), then deterministic
  `resolveSuggestionThresholds` + multi-lane compound rank. Emits sealed `movers_board`
  with real `symbolOrSector`, upserts `suggested_search` (`source_class=movers_rank`,
  never clobber operator), promotes `suggested_verified` via subset gates
  (symbol_universe_fit ∧ evidence_fit ∧ regime_fit-when-numeric ∧ corroboration floor).
  Operator Confirm → `watching`. UI tier filters on Market posture + BottomPanel.
  Contracts: `packages/contracts/src/watchlist-suggestions.ts`. Migration `0038`.
  Docs: ui-spec Market posture, data-model watchlist_items.
  **Status: implemented.**

- **D-093 (research-key bindings + bars regime + fund auto-propose + Justification, 2026-07-18):**
  (a) `user_research_keys` → `research_provider` (+ `historical_bars` for polygon/
  alpha_vantage/twelve_data/marketstack); Alpaca connected also grants
  `historical_bars`; LLM BYOK keys dropped from service sources. Migration `0039`
  adds `user_research_key_id`. Re-resolve on research key PUT/DELETE.
  (b) promote uses Alpaca `fetchBars` → `buildRegimeFromBars` when connected,
  else synthetic. (c) `AutoFundPolicy` (`off` | `propose_on_equity_refresh`) —
  equity.refresh may insert `requested` fund_transfers (never auto-settle).
  (d) Justification on RightPanel Values/Verify, BottomPanel watchlists/lineage,
  MarketPosture position rows. Docs: data-model, ui-spec. **Status: implemented.**

- **D-094 (research topics section placement + display, 2026-07-18):** Left Research tab
  places a dedicated **Research topics** section between Entity search and Library shelves
  (replacing the bottom Pages list). Nested seeded titles use shortened display labels under
  parents; rows show concept count and Program/Group/Directive kind; groups collapse by default
  with the Seeded trading mechanisms program expanded. Docs: research-tab-shelves-inspector-design,
  ui-spec. **Status: implemented.**

- **D-095 (research agent activity + Libraries dock, 2026-07-18):** Left Research tab scroll
  column places **Agent activity** (per research-module run/admission controls) directly under
  **Research topics**. Library shelves + create/export move to a **bottom-anchored Libraries
  dock** (max ~42vh, independently scrollable) that collapses to a **Libraries** card and
  expands on click; open/closed persists in `hftr:{companyId}:panel:left`. Modules & tools
  keeps module inventory/sweep only (no duplicate run actions or libraries section). Docs:
  research-tab-shelves-inspector-design, ui-spec. **Status: implemented.**

- **D-096 (separate catalog + desk-focus research topics, 2026-07-18):** New-company bootstrap
  seeds research topics as **separate top-level roots** (Strategy families, Guardrails,
  Session constraints, Broker policy, Trend leads, Compliance, Events, Macro, Sector
  knowledge, plus catalog leaves) — not nested solely under **Seeded trading mechanisms**
  (that title remains an overview index + library nest name). Company `sectorFocuses` add
  **Desk focus · {label}** topics with combination children (Strategies / Trend leads /
  Guardrails / Events) whose membership ORs sector_seeds with the matching catalog.
  Topic sync attaches to any research module even when catalog concepts are librarian-owned.
  Archive protects desk-focus titles. Docs: ui-spec, data-model, research-galaxy-topic-view-design.
  **Status: superseded by D-126** (catalog mirrors removed from research topics).

- **D-097 (bottom ribbon tabs + execution-engine scope, 2026-07-18):** Bottom control panel
  keeps **persistent ribbon tab buttons** (Trends · Scenarios · Watch · Decisions · Lineage ·
  Approvals · Dead) for quick navigation when collapsed or expanded; chevron / `` ` `` / Esc
  still toggle the content pane. The ribbon dropdown selects the **execution engine** being
  viewed (`All engines` or one `engine_instances` row), not individual modules. Every tab
  filters company API projections to modules with matching `engine_instance_id` (trends from
  trend lists, scenarios/leads/trees, watchlists, decisions/executions, lineage, approvals
  touching member modules, dead letters with member `moduleId`). Company-scoped rows without a
  module binding show only under All engines. Persist `engineFilter` in
  `hftr:{companyId}:panel:bottom` (legacy `moduleFilter` ignored). Docs: ui-spec §4 middle-bottom,
  m1-sprint-spec T1.5. **Status: implemented.**

- **D-098 (library vs posture research queues + topic initiate, 2026-07-18):** Split research
  work into dedicated queue classes: **LIBRARY_RESEARCH** (topic/module curation pipeline) and
  **POSTURE_RESEARCH** (system movers / sector news / market-hub refresh). Both are separate from
  execution lanes (DISPATCH/COMPILE/VERIFY/…) and other LLM queues (STRATEGIC/TACTICAL/ASSISTANT).
  Company serial fairness is per `(company_id, queue_class)` so library research can run while
  execution work proceeds. Research topics UI: per-topic **Research** + section **Research all**
  enqueue `research.curate` jobs on LIBRARY_RESEARCH (`POST …/research/topics/research`). Docs:
  job-orchestration, ui-spec. **Status: implemented.**

- **D-099 (bottom panel real-data wiring, 2026-07-18):** Continues D-097. Approvals tab loads
  fund transfers **and** pending `assistant_edits` (Confirm/Reject via existing proposal
  routes) plus live-gate status (Save evidence when checklist fails / stale). Lineage Queue
  shows pending+active jobs from new `GET …/jobs/pending` alongside dead letters.
  `GET …/executions` returns `leadId`/`treeId` via the same causation walk as the trace
  timeline so Scenario/Lineage join without relying solely on symbol substrings. Docs: ui-spec
  §4 middle-bottom. **Status: implemented.**

- **D-100 (galaxy hover cards + nest physics polish, 2026-07-18):** Galaxy view gains a
  terminal-styled hover card (concept nest path, curation/source, query/reference counts, tags;
  link relation · weight · qualitative similarity; nest hull kind labels). Hover dims
  non-neighbors and brightens 1-hop edges; 2D paint draws hover rings + early labels. Nest
  forces strengthened (library → folder → article hierarchy), collision/charge retuned, tag
  orbit capped at 24 chips with quieter chrome. Helpers in `galaxy-hover-labels.ts`. Docs:
  research-galaxy-topic-view-design, ui-spec §6. **Status: implemented.**

- **D-101 (Market posture hub metric completeness, 2026-07-18):** Completes the Market posture
  live hub (D-081 / D-085 / D-092). Overlay + left rail render all `MarketHubResponse` fields
  that matter to operators: equity status/asOf/version + freshness strip; movers title/
  corroboration/verified/expires with stale cue; multi-seal reports (`movers_board`,
  `sector_bulletin`, `daily_summary_phase`) with kind + expiry; positions realized PnL;
  trends strengthBand/engines; pipeline lead+tree+recovery; watchlist tier filters including
  `triggered` with Confirm + Justification on both surfaces; rail rows focus overlay selection.
  Equity accent prefers `positionMarkCents` series when present; otherwise a dashed synthetic
  current-mark line (no fabricated history). Code comments that mislabeled posture overlay as
  D-082 corrected to D-085. **Follow-up (same decision):** applied missing `system_normalized_views`
  migration; capped seal `sourceDigests` at 24 on write + trim-on-load so oversized seals still
  parse; market-hub Refresh drain budget raised (POSTURE_RESEARCH, 60s); ticker extract rejects
  1-letter / English noise tokens. Docs: ui-spec §4 left Market posture. **Status: implemented.**

- **D-102 (galaxy point-anchored labels + nest emphasis, 2026-07-18):** Hover cards project to
  the actual node via `graph2ScreenCoords` and track camera motion. Company envelope sphere is
  always present. Library/folder/article nests remain visible with idle/dim/hover/selected
  states (halo + opacity); click pins a nest, background clears. Concept hover lights its
  ancestry hulls. Docs: research-galaxy-topic-view-design §4.3.1, ui-spec §6. **Status:
  implemented.**

- **D-103 (Market posture provider-surface honesty, 2026-07-18):** Movers / sector-news gather
  intersects lane kinds with `selectReadySourceKinds` against operator research keys + Alpaca
  paper credentials (never invents entitled providers). Seals store `contributingSourceKinds`.
  Market hub projects `sources.lanes` (ready / missing_key / contributed) and UI lists which
  providers the last scan pulled from. Marks stay synthetic until live broker marks. Docs:
  ui-spec §4. **Status: implemented.**

- **D-104 (bottom Trends tab = per-module trend lists, 2026-07-18):** Bottom panel Trends
  renders **one list card per trend module** in the selected execution-engine scope (multiple
  cards when an engine has multiple trend modules). Lists show that module's
  `trend_candidates` (candidate + promoted, capped by `maxActiveTrends`) matching canvas
  `TrendListChrome`. Empty modules still appear. `GET …/trends` raises limit and orders by
  `scannedAt`. Docs: ui-spec §4 middle-bottom. **Status: implemented.**

- **D-105 (bottom panel taller expanded height, 2026-07-18):** Expanded middle-bottom control
  panel content grows from fixed `h-64` (~256px) to **`min(70vh, 48rem)`** with a 16rem floor
  so Trends / Scenario / Lineage have a primary working surface while the ribbon stays docked.
  Docs: ui-spec §4 middle-bottom. **Status: implemented.**

- **D-106 (sector groups + refine-down + universe excludes, 2026-07-18):** Company create
  selects **broad sector groups** only (all 10 groups allowed: technology, finance,
  healthcare, energy, materials, consumer, industrial, communication, macro, alt). Selecting
  a group expands to **all** preset specifics in `companies.sector_focuses` (cap = catalog
  size; prior 12-label ceiling removed). Company drawer gains a **Sectors** tab to add/remove
  groups and **deselect specifics** (refine-down only — reduces data). Separate curated field
  `companies.universe_excludes` (migration `0041`) holds ticker carve-outs; create optional,
  PATCH/duplicate/market-hub wired. Catalog granularized with `overlapPeers` + shared seed
  targets as intentional confirmation signals for early picks. TopDrawer is near-fullscreen
  under the ribbon. Docs: ui-spec §2, product-spec, data-model, contracts `sector-focus.ts`.
  Supersedes create UX of D-044 (presets remain the persisted labels). **Status: implemented.**

- **D-107 (galaxy nest clarity — non-uniform physics + labeled hierarchy, 2026-07-18):**
  Addresses uniform-cloud / unclear pattern feedback. Physics: softer global charge;
  size-ranked golden-spiral library centers; folder nest dominates when folder key present;
  mass-weighted folder rings; folder cohesion force; foreign-library keep-out; article
  orbits spiral inside parents. Visual: always-on library/folder 3D sprite labels; dual-ring
  library shells; folder octahedron cue; quieter article shells; **LOD** — one heaviest folder
  hull per library by default (all folders when library-filtered), article hulls only under
  topic focus; larger default concept spheres (`nodeRelSize`). Docs:
  research-galaxy-topic-view-design §4.3.1, ui-spec §6. **Status: implemented.**

- **D-108 (canvas connection-point audit + default engines, 2026-07-18):** Full ModuleType
  port audit (`canvas-connection-point-audit.md`). Ports gain edge/slot/nature; Time hub
  splits Schedule (top) + Time bus (right); clock_in additive on
  `TIME_BEARING ∪ {library, display}` (bottom far-left); natures style rails/edges;
  connect + links API fail-closed for schedule/time_bus → clock_in; inspector may hide
  unlocked delivery outs only (analyzer Concat); ENGINE spines add research→librarian
  ingest; time-provision wires clock-in recipients. Spec:
  `docs/superpowers/specs/2026-07-18-canvas-connection-point-audit-design.md`.
  **Status: implemented.**

- **D-109 (SymbolTicker + posture charts, 2026-07-18):** Universal `SymbolTicker` (spark +
  glyph/ticks/metrics) seeded by baseline market hub algorithm (synthetic quote walk +
  qualitative bands) without requiring engines. **Held P&L color wins** over watchlist
  relevance orange→lime; every cue also has non-color encoding. Hub projects
  `MarketHubSymbolViz` / `charts` (allocation pie, tiers, strength, mover dirs, sources).
  Spec: `docs/superpowers/specs/2026-07-18-symbol-ticker-posture-viz-design.md`. Docs:
  ui-spec §4. **Status: implemented.**

- **D-110 (canvas node styling + default ENGINE spines, 2026-07-18):** Closes remaining
  template orphan/librarian spines (`engine_crypto` / `engine_prediction` / trend research /
  research packs) with distinct Fn-aligned module names. Live cards: richer subtype chips
  (trend/analyzer/policy/funds), denser nature port labels + MathPortBuses labels, clock_in
  vs Math-dock spacing, agent/control family silhouettes, MathToolNode token parity with hub
  Math, EngineGroupNode nature utility labels, create preview parity via `NodePortBuses` +
  `FamilyShapeChrome` + category wash. Docs: ui-spec §3 node families;
  `canvas-connection-point-audit.md`.   **Status: implemented.**

- **D-111 (Market posture Analyze vs Sync + Model canvas, 2026-07-18):** Split operator
  actions — **Sync** forces a full hub GET (seals + categories); **Analyze** POSTs
  `…/market-hub/analyze` to force-reseal movers + sector + daily summary and run tactical
  LLM `suggestion_threshold_profile`. Nested **Model** category shows read-only React Flow
  of the baseline algorithm (providers → gather → LLM/defaults → compound → seal → hub).
  Automatic background updates moved to live-slice policy in **D-112**. Docs: ui-spec §4.
  **Status: implemented.**

- **D-112 (Market posture live vs static refresh policy, 2026-07-18):** UI surfaces split by
  update rate. **Live (silent ~15s poll via `GET …/market-hub/live`):** equity series/status,
  position marks / uPnL / held SymbolTicker sparks, freshness `fetchedAt`. **Static until
  Sync or Analyze:** movers seal + reports, charts aggregates, provider lane inventory,
  watchlist/trend/pipeline row identity, Model algorithm canvas, sector focuses. Live poll
  never sets Syncing…, never replaces static slices, uses a **ref-counted shared interval per
  company** (panel + overlay), and **pauses while Analyze runs** (shared busy flag) so
  backend drain is not contended by UI refresh. Manual Sync = full hub; Analyze = POST then
  one full hub reload. User intent: regular updates only where efficient; backend Analyze
  remains unblocked by UI cadence. Docs: ui-spec §4, research-live-system-cadence.md,
  data-model.md (hub projection APIs). **Status: implemented.**

- **D-113 (bottom panel tabs top-when-expanded, 2026-07-18):** Expanded middle-bottom panel
  places the tab strip + engine dropdown + collapse control at the **top** of the window;
  collapsed state keeps the same controls as a bottom ribbon. Docs: ui-spec §4. **Status:
  implemented.**

- **D-114 (bottom panel multi-open condensed panes, 2026-07-18):** Bottom ribbon tabs are
  multi-select — operators can keep several sections open as condensed side-by-side panes
  (Trends, Scenarios, Watch, **Positions**, **Policies**, Decisions, Lineage, Approvals, Dead).
  Pane chrome supports collapse and hide; state persists as `openTabs` / `collapsedPanes`
  (legacy single `tab` migrates). Positions load from `GET …/positions` (engine-scoped);
  Policies list policy modules with envelope refs. Docs: ui-spec §4 middle-bottom.
  **Status: implemented.**

- **D-115 (company TopDrawer layered overlay + condensed tabs, 2026-07-18):** Company drawer
  is a **layered panel** over the canvas (dimmed backdrop, centered `w-[min(42rem,…)]`, rounded
  bottom — not full-bleed). Ribbon toggle is a bordered chip labeled **Company profile**. Tabs
  condensed to **Desk / PnL** (trading profile + ledger + equity chart + allocation/trend charts +
  positions/ledger tables), **Philosophy & sectors** (mandate + sector focuses / excludes),
  LLM/operating, Settings. Per-tab SWR cache (`company-drawer-cache` + shared market-hub cache)
  with lazy refresh when a section is viewed; mutations invalidate the owning slice. Docs:
  ui-spec §2. **Status: implemented.**

- **D-116 (galaxy 3D volume packing — Fibonacci spheres, 2026-07-18):** Research galaxy
  under-used Z (pancake / necklace). Surveyed d3-force-3d clustering, dagMode, hyperbolic
  trees; kept TD-09 stack. Nest centers move to **Fibonacci-sphere** packing on concentric
  shells; folders/articles pack on spheres inside parents; weaken global `center`; longer
  springs + charge reach. Nest + **folder shell radials** fill ball volume. Camera uses
  packing-derived **`computeVolumeCameraPose`** (elevated orbit outside company envelope)
  plus **Fit** control and gentle idle auto-rotate (paused on pointer) — replaces
  `zoomToFit`+elev hacks that could frame from inside the envelope. DEV `layoutStats`
  reports AABB + camera pose. Live: `zOverX≈0.88` on 8-library company. Research:
  `research/galaxy-3d-volume-layout.md`. Docs: research-galaxy-topic-view-design §4.1,
  TD-09 amendment. **Status: implemented.**

- **D-117 (panel condensed density + count chrome, 2026-07-18):** Bottom condensed panes
  show header counts, stretch when sole-expanded, sectioned lineage lists with selection
  highlight, and a 48-row cap with “showing N of M”. Ribbon + left/right `PanelTabs` expose
  count `meta` when non-zero. **Empty `openTabs` auto-collapses** the bottom panel to the
  ribbon (hide/toggle last pane, chevron/` blocked until a tab is open). Docs: ui-spec §4.
  **Status: implemented.**

- **D-118 (persistent panel edge toggles, 2026-07-18):** Left, right, and bottom docked
  panels keep their **expand/collapse control on the window edge** in both states so the
  same screen area always shows/hides the panel. Left/right: vertical edge rail stays
  outside the panel body (`w-80` / `w-96` inset); header `×` removed. Bottom: tab + engine
  ribbon stays on **top** when expanded (D-113); a slim **bottom-edge** strip holds only
  the hide/show chevron; content height is reduced to account for the strip. Keyboard
  shortcuts unchanged (`[` / `]` / `` ` `` / Esc). Docs: ui-spec §4. **Status: implemented.**

- **D-119 (activity `view=ledger` light path, 2026-07-18):** `GET …/activity` accepts
  `?view=ledger|full` (default `full` for e2e/trace callers). Ledger view returns balance +
  recent ledger only (skips action_traces + verification join). Company profile Desk/PnL and
  right-panel ledger poll use `view=ledger` so desk open is not contended by heavy trace
  scans under market-hub load. **Status: implemented.**

- **D-120 (market posture synthesis hub + live Model stages, 2026-07-18):** Operator
  **Analyze** creates a durable `market_hub_synthesis_runs` row and stage rows
  (`providers`…`hub_ready`), enqueues force-reseal movers/sector/daily with `synthesisRunId`
  in parallel, plus `library.posture_narrative` (handler **waits** for seal stages), and
  returns `{ runId }` after a short drain. Model tab is a **live** React Flow hub plus an
  **awareness dock** (movers status, multi-seal freshness, report/narrative open). Narrative
  is a deterministic book↔tape rollup (held/watch/pipeline vs movers); upserts
  `posture_synthesis_narrative` and projects into hub `synthesis` + `posture_narrative`
  report. Overlay shows a mini run strip with Open Model. Synthesis polls ~1.5s separately
  from equity live poll (D-112). LLM narrative deferred. Spec:
  `docs/superpowers/specs/2026-07-18-market-posture-synthesis-hub-design.md`. Docs:
  ui-spec §4 Market posture Model, research-live-system-cadence, data-model.
  **Status: implemented.**

- **D-121 (shared Libraries dock + DATA live sources + Data Explorer, 2026-07-18):** Libraries
  dock is **first-class left-panel chrome** — visible under Research, Market posture, and Data
  (not Research-owned). DATA tab primary list is **LIVE DATA SOURCES** — **active only**
  (`ready` / `public` via `isActiveLiveDataSource`; missing-key / stub / researched hidden)
  from `GET …/live-data-sources`. Company canvas `library` modules appear under dock
  **Company**. Center **Data Explorer** browses live hydrators and library contents
  (markdown / JSON). Live-source **inventory** is client SWR-cached (metadata only).
  Service-tab **query/browse** widgets are also client SWR-cached (5m fresh / 30m stale)
  with server TTL + provider preview TTL (D-152) so diagnostics do not over-query
  external APIs; **Refresh live** force-bypasses caches. Canvas `live_api` identity uses
  optional `sourceKind` hydrator (legacy venue map). Galaxy stays Research-owned for
  topic/connection **trace**; Explorer is content **read**. Spec:
  `docs/superpowers/specs/2026-07-18-data-tab-libraries-dock-explorer-design.md`.
  Docs: ui-spec §4, research-tab-shelves-inspector-design, product-spec §Data modules.
  **Status: implemented** (active-only DATA list; elevated Libraries sheet; inventory +
  query caches).

- **D-122 (dual paper books + engine→service binding + delta training, 2026-07-18):**
  Paper execution uses **explicit dual books** with linked delta resolution, plus a
  **per-engine service binding** model that hydrates the company **main book**:

  1. **Operator binds each trading engine** (canvas trading module / engine group) to a
     **real service** (Alpaca paper, Kalshi demo, …) when available. Binding is user-defined —
     not an automatic company-wide override of every engine.
  2. **If no real service is bound** for that engine, dispatch uses **internal paper
     functions** (hftr paper engine / `paper_sim` realism layer) for that engine’s activity.
  3. **When bound to a real service:** the service’s **ledger amount is an added funds
     source** into the company main book (capital hydration). Binding alone does **not**
     imply always-on parallel fill shadowing.
  4. **Order routing is switchable** per engine (or company policy), with modes:
     - **`funds_only`** — provider ledger hydrates capital; orders execute on the
       **internal paper engine** (against that capital + live market model).
     - **`execute_on_service`** — orders submit/reconcile on the bound provider; ledger
       still hydrates the main book.
     - **`both_verify`** — internal + provider paths for **tight verification**; linked
       books produce **deltas** used to train / weight the internal sim (fill, latency,
       partials, marks, reject codes). Preferred when the operator wants realism feedback.
  5. **Safest default** when a real service is newly bound: **`funds_only`** (confirmed) —
     no provider order traffic until the operator elevates to `execute_on_service` or
     `both_verify`.
  6. **Realism / weight teacher in `funds_only`:** **live market model only** — fuse
     entitled live data sources into marks, fill realism, and holdings simulation; deltas
     are sim vs live tape/marks. Provider fills teach only in **`both_verify`**.
  7. The live market model **integrates with baseline company analysis for current
     awareness** via a **shared, extensible awareness substrate** — at minimum **Market
     posture hub / synthesis (D-120)** and **seeded Current awareness research topics /
     seals (D-126)**, with room to attach further Analyze / library / live-source consumers
     without a paper-only fork. Prefer **flexible adapters** over a single hard-wired path.
  8. **Capital isolation:** each **execution engine** manages its **own allocated slice** of
     company total capital. Engines **cannot share funds** unless capital is **explicitly
     shared** (approved fund_router / transfer / allocation change). Main book = rollup of
     engine books + company-level seed/unallocated remainder.
  9. The **hybrid combination** of bindings + routing modes **hydrates the company’s
     main book** (rollup), while engine books remain the spend authority for dispatch.

  Related: D-002, D-014, D-023, D-025, D-027, D-059, D-061, D-120, D-125, D-126; OQ-13
  (resolved). Spec: `docs/superpowers/specs/2026-07-18-internal-paper-trade-engine-design.md`.
  Plan: `docs/superpowers/plans/2026-07-18-internal-paper-trade-engine.md`.
  **Status: complete through Phase 5 (InternalPaperCore + UI binding).**

- **D-135 (heat atr_stream + mid-drain partial traces, 2026-07-18):** Compile portfolio
  heat prefers `resolveAtrCents` per open position (`loadCompanyOpenPositionRisksWithAtr`)
  and passes `entryAtrCents` into `projectHeatAfterEntry`. Time-spaced child drain appends
  `action_traces` with `outcome: 'partial'` + `time_spaced_drain_in_progress` after each
  non-final slice; final slice still writes `filled`. Migration **0044** applied on Neon.
  Docs: post-fill-deterministic-lifecycle.md. **Status: implemented (paper).**

- **D-134 (control_snapshots + atr_stream cadence + time-spaced drain, 2026-07-18):**
  Closes D-129 follow-ons. (1) Admitted promote + successful compile persist
  append-only `control_snapshots` rows; compile sets non-null
  `HandoffEnvelope.controlSnapshotRef` + lineage ids. (2) `maintenance.atr_stream`
  (from `maintenance.sweep`) refreshes open-position symbols via Alpaca 1Day bars →
  `atr_stream:{SYMBOL}` ValueRefs; exit scans use `resolveAtrCents` (synthetic
  fallback). (3) Multi-slice paper fills: slice[0] now, remaining
  `dispatch.paper_trade_child_slice` with `runAfterMs`; migration **0044**
  `deterministic_tasks.drain_state`; gap tags `child_slice_drain` +
  `time_spaced_child_drain`. Docs: post-fill-deterministic-lifecycle.md.
  **Status: implemented (paper).**

- **D-129 (POV child-slice drain + operator exit scan, 2026-07-18):** Completes the
  paper POV follow-on from the post-fill lifecycle workstream. Paper dispatch drains
  compile `childSlices` (and operator qty≥2 via default POV planner) as sequential
  fill legs with 1¢ adverse walk + VWAP ledger (`child_slice_drain` gap tag;
  single-shot keeps `no_partial_fills`). `POST …/positions/exits` enqueues
  `maintenance.position_exits` and drains MAINTENANCE+DISPATCH. Executions API
  returns `simulatorGapTags`. Docs: post-fill-deterministic-lifecycle.md. **Status:
  implemented (paper; time-spaced drain + atr_stream cadence + snapshot persist
  completed in D-134).**

- **D-125 (post-fill heat + trail + weighted valves, 2026-07-18):** Compile admits
  entries only when projected portfolio heat (sum open ATR-risk / equity) stays under
  `portfolio_heat_pct_band.max`. Post-fill exits add chandelier `trail_stop` from peak
  mark ValueRefs after tp1 R; measurable-gain floors include a **paper fee proxy** and
  higher net edge for HFT-oriented short horizons. Multi-way **weighted valves**
  (participation, urgency, heat, trail, polarization) are continuous modulators inside
  catalog envelopes — learning adjusts in-band positions via `proposeValvePositionDelta`,
  not hard switches. Architecture: `post-fill-deterministic-lifecycle.md`. **Status:
  implemented** (paper; POV child-slice drain completed in D-129).

- **D-124 (complex-signal polarization → capital leverage, 2026-07-18):** No v1 term
  `polarization`; v2 defines it as agreement strength of a complex signal (trend
  `strengthBand` + six-gate pass rate + regime direction align). Compile applies a
  fixed-fractional sizing multiplier in **[0.5, 1.5]** to philosophy `sizingBasisBps`, then
  caps qty with ATR risk geometry
  `min(budgetBpsQty, equity×risk_per_trade_pct/(atr×atr_mult))`. Not Kelly (oq-036 deferred).
  Exits: RR/measurable gains before protective stop; catalog `breakeven_on_tp1` locks stop
  floor to avg cost once mark clears half of tp1 R. Docs: product-spec trading modules,
  data-model jobs. **Status: implemented.**

- **D-123 (side panel symbol edge rails, 2026-07-18):** Left/right persistent edge rails
  (D-118) are wider (`w-10`) and show **Lucide symbol buttons for each tab** in both open and
  collapsed states. Clicking a symbol selects that tab and expands the panel; a bottom
  chevron remains the explicit show/hide control (`[` / `]` labels preserved for e2e).
  Active tab gets accent stroke + edge bar. Shared `PanelEdgeRail`. Docs: ui-spec §4.
  **Status: implemented.**

- **D-125 (Positions home = right panel, 2026-07-18):** Open positions move from the bottom
  ribbon (D-114) into a dedicated **RightPanel Positions** tab (Verify | Executions |
  Positions | Ledger | Sims | Values). Inspector shows stability (held-vs-cost), automatic
  recovery (tree ladder + next model-free exit candidate on `GET …/positions`), and agent
  actions (lead/tree + recent executions → TraceTimeline). Ledger is entries-only; Market
  posture Positions category stays as overlay navigator. Legacy bottom `openTabs`/`collapsedPanes`
  values of `positions` are dropped on read. Docs: ui-spec §4. **Status: implemented.**

- **D-126 (seeded research topics = awareness + sector points, 2026-07-18):** Seeded
  **research topics** are distinct from seeded **library knowledge**. Company bootstrap no
  longer mirrors catalog domains (Strategy families / Guardrails / …) as research topics —
  those stay on the Seeded trading mechanisms library shelf. Topics seed: **Current
  awareness** (regime & breadth, macro & policy, news & event readthrough) plus one
  **Sector · {label}** research point per `sectorFocuses` (light `sector_seeds` membership
  when the label maps), and a thin **Seeded trading mechanisms** overview for Libraries
  Overview. Legacy D-096 catalog-directive / Desk focus trees prune on next
  `ensureSeededResearchTopics`. Docs: product-spec, ui-spec §6, research-galaxy-topic-view-design,
  research-tab-shelves-inspector-design. **Status: implemented.**

- **D-127 (research articles list + librarian actions, 2026-07-18):** Research **articles**
  are library-backed concepts stamped with `hftr:article` (1–3 display tags; system tags
  like `catalog` hidden from chips). Topics remain work directives; research runs + operator
  submit produce articles that **must** save into a library (`libraryId` required) but remain
  flexibly listed in the Research **Articles** group. Concepts GET supports `?kind=article`.
  Custom **runtime** library shelves expose librarian **Curate / Verify / Refresh** via
  `POST …/libraries/[libraryId]/actions`. Operator submit accepts `draft` or `active`
  research modules so articles can land before full module activation. Distinct from
  research **topics** (D-126) and catalog seed knowledge. Docs: ui-spec §4/§6,
  research-tab-shelves-inspector-design, contracts `research-articles.ts`.
  **Status: implemented.**

- **D-128 (Libraries full-height left rail action, 2026-07-18):** Left edge rail gains a
  bottom **LIB** symbol (above the collapse chevron). Clicking it always opens the panel and
  expands Libraries to **full left-panel height** (`librariesFull`, persisted). Selecting any
  other left tab (rail or header tabs) restores the compact dock size. Hide collapses to the
  Libraries card. Docs: ui-spec §4. **Status: implemented.**

- **D-130 (Research panel slim + galaxy entity search, 2026-07-18):** Left Research scroll
  column shows only **topic create**, **planned/in-progress topics** (`active` + `deferred`),
  and **Articles**. Entity search moves into Galaxy overlay chrome (default Concepts). Agent
  activity, archive, and Modules & tools removed from the Research column (module create stays
  on canvas). Docs: ui-spec §4, research-tab-shelves-inspector-design. **Status: implemented.**

- **D-131 (Posture rail holdings vs day overlay, 2026-07-18):** Market posture left tab is
  **holdings inventory only** — open positions + capital sources (holding funds / capital-bearing
  modules via hub `capitalSources`). Watchlists, trends, plans, Model, and Analyze move off the
  left rail onto the **canvas day overlay**, which aggregates live streams into persistent
  human-readable views (equity, movers, seals/reports, recommendation grids, synthesis Model /
  awareness dock) and is **not** position-centric. Position row select still highlights for
  right-panel Positions (D-125). Docs: ui-spec §4, product-spec Market posture, contracts
  `MarketHubCapitalSource`. **Status: implemented.**

- **D-138 (Posture funds amounts + stock/news day streams, 2026-07-18):** Left Posture rail
  projects **resolved allocation amounts** (ValueRef → USD cents + pool share bps + optional
  module ledger) for holding funds, trading desks, fund routers, and engine envelopes — never
  LLM-emitted dollars. Day overlay shows **master equity**, dual **stock movers / sector news**
  boards (lens toggle), and recommendations; Analyze already reseals movers compound + sector
  news in parallel — UI and hub `news` board make both streams first-class. Docs: ui-spec §4,
  data-model, contracts `MarketHubCapitalSource` / `MarketHubNews`. **Status: implemented**
  (refined by D-144 — root funds + trading splits only).

- **D-144 (Posture capital = company roots + execution splits, 2026-07-18):** Left Posture
  capital inventory is **not** the fund_route graph. Viewing pattern:
  1. **Company · root funds** — company pool header + nested `holding_fund` modules only
  2. **Execution · module splits** — `trading` desks only, grouped by engine
  3. **Open positions**
  Omits `fund_router` hops and research `engine_envelope` rows (topology / research capital ≠
  inventory sources). `MarketHubCapitalSource.tier` discriminates `company_root` vs
  `execution_split`. (Earlier commit notes said D-139; that ID is reserved for galaxy
  celestial — this decision is D-144.) Docs: ui-spec §4, contracts.
  **Status: implemented.**

- **D-147 (synthesis Model hydration graph, 2026-07-18):** Overlay **Model** shows baseline
  **live data sources** (full registry) and **library shelves** feeding the Analyze pipeline.
  Every node carries an **operation** and **amount** (counts/status — never LLM dollars).
  Hub projects `modelHydration`. Superseded edge shape: live→providers / library→gather —
  refined by **D-156** (per-service adapters). Stage amounts prefer run summary counts when
  Analyze has run. Docs: ui-spec §4, data-model, synthesis hub design. **Status: implemented.**

- **D-132 (galaxy library clusters — separation + nest dominance, 2026-07-18):** Fibonacci
  volume packing (D-116) still allowed large nest hulls to overlap and cross-library springs
  to blend concepts into one cloud. Refine: (1) `separateLibraryCenters` after packing so
  hulls stay ≥1.38×(r₁+r₂) apart with capped radii; (2) stronger library nest restore +
  foreign keep-out + `createLibraryCohereForce`; (3) cross-library link distance↑ / strength↓;
  (4) tighter nest seed jitter; (5) higher library/folder hull opacities; (6) live FG coords
  reseeded when packing signature changes (avoid remount Loading stall); (7) show multiple
  folder shells inside large libraries — catalog folders are the real clusters when one lib
  owns ~90% of concepts; (8) wire nest forces synchronously on graph mount so warmup cannot
  collapse to origin first. DEV `layoutStats` reports `clusterSeparation` + `nestMembership`.
  Docs: `research/galaxy-3d-volume-layout.md`. **Status: implemented.**

- **D-133 (DATA company libraries + shell-persistent inspector, 2026-07-18):** DATA tab
  lists **company canvas `library` modules** (engine-created or manual) below active live
  API hydrators. Library/concept/page reading uses the Galaxy-style **floating inspector**
  mounted at **shell** level (`ShellInspectorLayer`, z above overlays) so it persists across
  Research / Market posture / Data. Opening inspect targets does **not** force a tab or
  primary-overlay switch — background stays the last navigated left-tab view. Live API
  browse remains Data Explorer. Spec:
  `docs/superpowers/specs/2026-07-18-data-company-libraries-shell-inspector-design.md`.
  Docs: ui-spec §4. Extends D-049 / D-121. **Status: implemented.**

- **D-134 (commit after every session + verified update, 2026-07-18):** User directive —
  workspace agents must generate git commits after **every** session and after **every**
  verified update, not only when asked and not only at milestone gates. Resolves **OQ-12**
  in favor of workspace policy (overrides generic “commit only when asked” defaults for
  this repo). Close sequence remains verify → curate → invoke `commit-message` skill →
  report; push still user-request-only. Surfaces updated: `git-commits.mdc`,
  `zero-trust-verification.mdc`, `self-curation.mdc`, `agent-sources.mdc`, `AGENTS.md`,
  `commit-message` / `verify-change` / `session-start` / `implement-milestone` skills,
  `end-of-run` / `verify-and-ship` / `commit-session` workflows, `/end-run` `/verify`
  `/commit-session` commands, `.cursor/README.md`, `agent-docs/README.md`.

- **D-136 (galaxy free-float + soft orbits/systems, 2026-07-18):** Concepts and tags
  **free-float** on semantic weight + similarity springs. Articles apply **soft orbital**
  radial bands; folders apply **loose system** bounds. Library framing is faint only.
  Hierarchy gently biases springs (`hierarchicalLinkScale`); cross-membership edges stay
  strong enough that systems/orbits **intersect**. Replaces D-132 hard nest dominance as
  the primary clustering metaphor. Docs: `research/galaxy-3d-volume-layout.md`,
  `ui-ux/research-galaxy-topic-view-design.md` §4.1. **Status: implemented.**

- **D-137 (atr cred discovery + drain ledger↔trace, 2026-07-18):**
  `defaultLoadAlpacaPaperCredentials` fail-open chain:
  `companies.brokerConnectionId` → bound `module_service_bindings` alpaca paper →
  owner-scoped connected alpaca paper (`broker_connections.clerkUserId`). Time-spaced
  child drain inserts per-slice `ledger_entries` with non-null `traceId` after writing
  the matching `partial` / `filled` `action_traces` row (no ledger UPDATE). Mid-drain
  start returns the partial `traceId`. Soak helper caps companies; credentialed refresh
  verified on Neon. Docs: post-fill-deterministic-lifecycle.md. **Status: implemented (paper).**

- **D-139 (galaxy celestial objects + article-star orbits, 2026-07-18):** Granular galaxy
  nodes render as distinct celestial bodies (`galaxy-celestial.ts`: star / planet / rock /
  ember / moon / comet by source class and role). Article hulls are **unpinned star hubs**
  that soft-orbit parent folder/shelf systems (`createArticleHullOrbitForce`); concept
  soft-orbits follow **live** article-hull positions (`createArticleOrbitForce`).
  Superseded LOD note: D-141 shows all library-scoped article stars. Builds on D-136
  free-float. Docs: `research/galaxy-3d-volume-layout.md`,
  `ui-ux/research-galaxy-topic-view-design.md` §4.1. **Status: implemented.**

- **D-140 (Engine Data Hub, 2026-07-18):** Each execution engine owns a first-class shared
  **Engine Data Hub** library (canvas module + `libraries` row). Linked research engines
  hydrate the hub; in-family libraries nest under it in Library/Data views. **Canvas I/O
  superseded by D-159** (ENGINE utility + nest parent FK; no hub `module_links`). Spec:
  `docs/superpowers/specs/2026-07-18-engine-data-hub-design.md`. **Status: implemented.**

- **D-141 (galaxy full library articles + live refresh, 2026-07-18):** Graph nests every
  library-scoped `hftr:article` as an article-star orbit (merged with topic membership
  orbits). Galaxy renders **all** folders and article stars in the active library filter
  (no top-N LOD). Research overlay reloads the graph on research-cache invalidation and
  polls every 8s while open so newly admitted articles/resources reshape the map.
  Docs: ui-spec Galaxy tab, research-galaxy-topic-view-design §4.1,
  galaxy-3d-volume-layout. **Status: implemented.**

- **D-142 (galaxy orbital shelf physics, 2026-07-18):** Live graph observation: typical
  company has ~100 catalog concepts, ~17 folders, ~0–1 articles, and **very sparse**
  `concept_links` (~5). Hierarchy forces must organize the map. Folder nest switched from
  core-attract to **orbital radial bands** + tangential ring spread; stronger folder shell;
  shell seeds around folder/article centers; tighter charge distanceMax; article-star
  collide/repel. `layoutStats` adds article/folder orbit fractions + hull counts.
  Docs: galaxy-3d-volume-layout, research-galaxy-topic-view-design §4.1.
  **Status: implemented.**

- **D-143 (strict librarian spines + chrome polish, 2026-07-18):** Default ENGINE and company
  starter templates drop parallel `research→library` data_feed bypasses so ingest is only
  `research→librarian→library`. Fixes `engine_crypto` philosophy targeting trend (not live_api),
  aligns `trend_research_lab` with `engine_trend_research`, renames long-term seed fund to
  Paper Horizon Holding Fund. `topicScope` inputs fan out via `alsoTargets` to research +
  librarian + library. Cross-template research-pack module names disambiguated. Canvas chrome:
  fund_router subtype prefers policy envelope; Math attached-strip / MathToolNode tokens from
  `MODULE_VISUALS.math`; port labels 6px; create-preview cards enlarged with separate subtype
  chips + PreviewEngineGroupNode utility bus labels. Docs: ui-spec §3,
  canvas-connection-point-audit. **Status: implemented.**

- **D-145 (galaxy semantic interaction springs, 2026-07-18):** Observed spheres stayed
  separated because packing used hard D-132 gaps and graphs often have ~5 persisted
  `concept_links`. Client now builds **semantic springs** from qualitative token overlap
  (medium/high), shared display tags, and article/topic membership; softens library packing
  (gap ~1.06) and foreign repel; hierarchical scale **bridges** high cross-nest similarity.
  Tag satellites exclude system/catalog markers. Docs: galaxy-3d-volume-layout,
  research-galaxy-topic-view-design, ui-spec. **Status: implemented.**

- **D-146 (Assistant AST right-rail floating panel, 2026-07-18):** Right edge rail gains a
  bottom **AST** symbol (above the collapse chevron), mirroring left **LIB**. Clicking it
  toggles a **full-height floating column** (`AssistantDock`) separate from the main
  RightPanel — not a tab inside Verify/Executions/…. Selecting any main right tab closes the
  assistant column and opens that tab. `assistantOpen` persists on
  `hftr:{companyId}:panel:right`. Removes the bottom-right FAB mount from the company page.
  Docs: ui-spec §4 / §5. **Status: implemented.**

- **D-148 (Provider status dropdown on day overlay, 2026-07-18):** Market posture day
  overlay moves provider surfaces out of the always-visible header strip into a top
  **Provider status** button (ready/N + missing-key hint) that opens a dropdown dialog with
  the full lane list (ready / need key / contributed). Esc and outside click dismiss.
  Docs: ui-spec §4. Extends D-103. **Status: implemented.**

- **D-149 (Posture funds outline collapsed; positions primary, 2026-07-18):** Left Posture
  rail puts **open positions** first (more prominent cards). **Funds** are a single
  collapsible block (**collapsed by default**) with a one-line summary (pool · root count ·
  desk count). Expanded view is a short indented outline: pool → root funds → execution
  desks by engine; each fund row shows **name + amount inline** (no multi-line cards).
  Docs: ui-spec §4. Extends D-144. **Status: implemented.**

- **D-150 (Assistant layered drag/resize overlay, 2026-07-18):** AST assistant is a
  **viewport-fixed overlay** (`createPortal` → `document.body`, `z-50`) layered **on top of**
  the main RightPanel (and other chrome) — not an in-flow sibling column. Header drag and
  edge/corner resize; geometry persists at `hftr:{companyId}:assistant:geometry`. Selecting
  right tabs no longer closes the assistant (underlying panel stays visible beneath).
  Extends D-146. Docs: ui-spec §4 / §5. **Status: implemented.**

- **D-151 (galaxy physical semantic bridging, 2026-07-18):** Spheres stayed separated
  because packing + foreign keep-out dominated sparse springs, and articles/seeds lacked
  shared display tags / persisted correlates. Now: `normalizeGalaxyDisplayTag` vocabulary;
  seed tag refresh + shared-tag `concept_links`; deterministic synthesis emits correlates;
  article orbits include co-tagged peers; denser topic membership cliques; closer packing
  (gap ~1.0); **`createCrossLibraryBridgeForce`** drifts library centers toward semantic
  pairs; stronger cross-nest spring scale. Docs: galaxy-3d-volume-layout,
  research-galaxy-topic-view-design, ui-spec. **Status: implemented.**

- **D-152 (live-data query/provider TTL caches for diagnostics, 2026-07-18):** DATA
  Explorer service-tab queries must not re-hit external providers on every remount.
  Layers: (1) client SWR for `POST …/live-data-sources/[kind]/query` (5m fresh / 30m
  stale, session-persisted); (2) API in-process TTL (5m) with inflight dedupe; (3)
  operator-preview provider TTL (5m) for CoinGecko / Frankfurter / Alpaca OHLC keyed
  without secrets. `forceRefresh` / **Refresh live** bypasses all layers. Response
  carries `cached` + preserved `fetchedAt`. Extends D-121. Docs: ui-spec §4.
  **Status: implemented.**

- **D-153 (use-case research deps + Data Hub family, 2026-07-18):** Default execution
  engines seed **specific** research packs (not generic fabric): day-trading → session
  regime lab + desk specialty; long-term → filings + event catalysts (not desk-aligned);
  crypto/prediction keep domain packs; HFT → `research_microstructure_lab` (D-157).
  Day-trading inline research is session specialty (regime lab owns market news).
  `expandEngineSeedsWithResearchDeps` runs on company create; module-store execution
  insert seeds missing packs first; research insert re-syncs dependent Engine Data Hubs
  (D-140 nests/hydrate/query/returns). Docs: product-spec company create, templates.
  **Status: implemented.**

- **D-154 (Assistant shell Dock to bottom-right anchor, 2026-07-18):** Assistant overlay
  chrome gains a **Dock** control (Lucide `Dock`) that snaps the panel to the canonical
  far-right bottom anchor (right-rail gutter + bottom inset), preserving current size.
  Default open geometry uses the same anchor. Extends D-150. Docs: ui-spec §4 / §5.
  **Status: implemented.**

- **D-155 (Market posture source-verify chips, 2026-07-18):** Every posture metric surface
  can show **extremely lightweight** chips that **must say** provenance class
  (`api` | `library` | `system` | `setting`) plus a short source label. Hub projects
  `sourceChips` on movers/news (seal `contributingSourceKinds`), equity (ledger), positions
  (mark feed + ledger), and watchlists (`sourceClass`). Live mark/equity deltas **preserve**
  chips via `mergeMarketHubLive`. Multi-confirm metrics show multiple chips. UI:
  `SourceVerifyChips`. Docs: ui-spec §4, data-model. **Status: implemented.**

- **D-156 (Market posture per-API Model processing flows, 2026-07-18):** Synthesis Model must
  show **specific processing flows per API service** — distinct adapters and analysis roles —
  not all live sources dumping into a single providers→gather aggregator. Hub projects
  `modelHydration.processingFlows[]` (`adapterLabel`, `analysisRoles`, `targetStages`,
  `pipelines`). Catalog mirrors movers/sector lanes (e.g. dual Alpaca `entitle` vs `ohlc`→RS;
  news → gather/universe/sector|seal; library Jaccard → thresholds/rank/seal). Graph:
  live|lib → adapter → distinctive stages. Docs: ui-spec §4, data-model, synthesis hub design.
  **Status: implemented.**

- **D-157 (paper HFT engine + microstructure lab, 2026-07-18):** Ship a **usable paper**
  high-frequency-oriented ENGINE (retail-API framing, not colocated HFT): full execution
  spine (`engine_hft`), use-case pack `research_microstructure_lab`, research subtype
  `microstructure_context`, trend posture `microstructure_swarm`, strategy family `strat-007`,
  and throttle baseline/envelope `paper_hft_swarm_v1` (elevated MD/stream, bounded trade +
  low burstCap). `EXECUTION_ENGINE_RESEARCH_DEPENDENCIES.engine_hft` → microstructure lab.
  Live remains fail-closed until M5 live gate. Spec:
  `docs/superpowers/specs/2026-07-18-hft-engine-design.md`. Extends D-153. Docs:
  product-spec presets, canvas-connection-point-audit, engine-node-family-design, REQ-MDL-012.
  **Status: implemented.**

- **D-158 (Neon project cutover, 2026-07-19):** Active Neon project is `hftr-v2`
  (`calm-bird-16964297`, aws-us-east-2, endpoint `ep-blue-fire-ajk6bglk`). Prior project
  `bold-surf-86557348` renamed `hftr-v2-backup-quota` and kept as `DATABASE_URL_BACKUP` only.
  Schema on the new project has 45 Drizzle migrations applied. `DATABASE_URL` migrated for
  local (`apps/web/.env.local` + worktree), and Vercel project `hftr` Development / Production /
  Preview. Supersedes the project id recorded in D-012 for runtime connections (D-006 still
  holds: fresh Neon + clean v2 schema). **Status: implemented.**

- **D-159 (engine vertical families + Data Hub via ENGINE edges, 2026-07-19):** Canvas layout
  stacks execution families vertically: research deps left → Engine Data Hub in the gap →
  execution right. Hub→exec I/O uses motherboard `engine_utility_links`; nest membership
  stays `parent_hub_library_id` (Library tree). Live canvas rejects cross-engine and hub
  `module_links`. **Auto-layout:** `reflowCompanyFamilyLayout` on create/insert/page load.
  Default eng↔eng mesh **superseded by D-168**. Extends D-140 / D-091. **Status: implemented.**

- **D-160 (Market posture Model edge activation + tracks/layers, 2026-07-19):** Flesh synthesis
  Model steps into **layers** (sources→adapters→pipeline→output) and **tracks**
  (entitle/compound/sector/daily/compose) with per-stage `dataRole`. Graph edges carry
  `edgeType`, `activation`, `status`, `track`; canvas styles stroke/dash/animation and
  **pulses** on Sync/Analyze when `modelHydration.asOfIso` or stage signatures change.
  Hub projects seal freshness stamps for stale/armed styling. Extends D-156. Docs: ui-spec §4,
  data-model, synthesis hub design. **Status: implemented.**

- **D-161 (Market posture Model panel surface hydration, 2026-07-19):** Model `hub_ready` /
  seal stages hydrate into operator **panel surfaces** (rail positions/funds; overlay equity,
  movers, news, watchlists, reports, charts). Hub projects `panelSurfaces[]`; live poll patches
  equity/positions surfaces via `livePatchedAt` without bumping `asOfIso` (panel-only pulse).
  Extends D-160. Docs: ui-spec §4, data-model, synthesis hub design. **Status: implemented.**

- **D-162 (Market posture Model route-granular process nodes, 2026-07-19):** Replace generic
  adapter→stage fan-out with **route-specific process chains** (news_headline, bars_ohlc,
  macro_context, library_jaccard, …) and **shared compound bridges** (providers_entitle,
  universe_build, compound_rank, verify_promote, sector_bulletin, daily_phase,
  narrative_compose). Hub projects `processSteps[]` + `processingFlows[].route` /
  `processStepIds`. Stage IDs remain synthesis milestones for run polling; granular nodes are
  Model hydration/visualization only. Extends D-156 / D-161. Docs: ui-spec §4, data-model,
  synthesis hub design. **Status: implemented.**

- **D-163 (Market posture Model available-only tracks + capital amounts, 2026-07-19):** Model
  diagram filters to **available providers** (ready/public/contributed/canvas-bound) and
  **admitted libraries**; track legend + sector/daily branches follow capabilities. Capital
  fund rows project as **CAP data-source nodes** with hub-resolved dollar amounts; capital-
  bearing panels (capital/equity/positions) emphasize inline amount readouts. Per-role node
  chrome distinguishes SRC/LIB/CAP/ADAPT/PROC/STAGE/PANEL. Extends D-162. Docs: ui-spec §4,
  data-model, synthesis hub design. **Status: implemented.**

- **D-164 (galaxy independent spheres + seeded folder similarity, 2026-07-19):** Galaxy nests
  were too dense after D-151 soft packing. Library/folder radii now grow **independently**
  from content; packing gap ≥ 1.28; parent hulls **refit** around folder extents. Seeded
  catalog folders carry system-defined similarity bands (`galaxy-folder-similarity.ts`) so
  related shelves place closer and unrelated farther. Bridge force respects the packing gap.
  Docs: galaxy-3d-volume-layout, research-galaxy-topic-view-design, ui-spec. **Status: implemented.**

- **D-165 (Market posture Model track-banded spacing + type legend, 2026-07-19):** Model layout
  uses **track lanes** (entitle/compound/daily/sector/compose) with wider column gaps, lane
  labels, and source stacking by primary track. Nodes show **track-colored top bars** + layer
  badges; legend lists tracks and node types (SRC/LIB/CAP/ADAPT/PROC/STAGE/PANEL). Extends
  D-163. Docs: ui-spec §4, synthesis hub design. **Status: implemented.**

- **D-166 (research topics per research engine, 2026-07-19):** Seeded research topics attach to
  **every** research module/engine (not only the first). Topics GET returns empty when the
  company has no research modules; Left Research Topics list stays blank until a research
  module exists. UI is a **flat list** with owner chips (`engineLabel` / research module name)
  — no Program/Group/Research-point kind labels or nested tree chrome in the list. Seeded
  libraries remain **company-wide**; scrolling shelves dedupe shared name+scope rows so
  overlap shows one set (engine data hubs stay distinct). Contracts enrich `ResearchTopic`
  with `engineInstanceId` / `engineLabel` / `researchModuleName`. Docs: ui-spec §6,
  research-galaxy-topic-view-design. **Status: implemented.**

- **D-167 (paper vs live capital copy on money surfaces, 2026-07-19):** Keep paper trading
  low-friction (ModeSwitch + existing paper seed / paper trade flows) but make **dollar amounts
  self-labeling** so operators never confuse virtual ledger money with live broker money.
  Shared helpers in `apps/web/lib/capital-mode-label.ts` drive: Desk/PnL (`Paper balance` /
  `Paper realized PnL`), right-panel balance, company-card equity (`Paper equity`), market
  posture funds/equity headlines, execution fill chips (`paper sim` / `paper` / `live` from
  venue+mode), fund-transfer eyebrow (`Virtual fund transfers (paper)`), and broker buying
  power (`Paper broker buying power` when bound connection mode is paper). No modals.
  Docs: ui-spec §2. **Status: implemented.**

- **D-168 (strategic Data Hub + no default eng↔eng mesh, 2026-07-19):** Data Hub placement
  biases toward execution `data_in` (gap bias 0.72, Y aligned to ~18% chrome top). Engines
  are **not** auto-connected to peer engines; default data path is hub→exec only. Page-load
  heal **prunes** legacy `fromEngineId` `data_in` utility links. Operator may still draw
  eng↔eng utility binds manually. Intra-engine member links and research→hub hydration via
  `targetLibraryIds` unchanged. Extends D-159. Docs: engine-data-hub-design, canvas-layout.
  **Status: implemented.**

- **D-169 (Market posture Model active-only + per-function chrome, 2026-07-19):** Model diagram
  shows **active** live sources only (`ready` / `public` / contributed non-stub) — canvas-bound
  stubs no longer light lanes. Each process step carries `processFunction` (fetch, normalize,
  extract, corroborate, entitle, score, rank, verify, seal, …) with **distinct chrome**; live
  SRC nodes tint by research **domain** (news/filings/macro/fx/crypto/equity_bars). Route chains
  stay **kind-granular** (kind-prefixed labels; twelve_data/marketstack get entitle **and** OHLC
  like Alpaca). Process chains wire to a **single primaryFeedStage** (cuts multi-stage fan-out
  spaghetti); stage→stage bridges still carry the compound path. Extends D-162 / D-163 / D-165.
  Docs: ui-spec §4. **Status: implemented.**

- **D-170 (galaxy looser gravity / more volume, 2026-07-19):** Continue spreading the research
  galaxy: longer weight/similarity spring rest lengths, weaker nest/folder/article attractors
  and cohesion, stronger many-body charge with longer `distanceMax`, packing gap ≥ **1.48**,
  larger library/folder radii and Fibonacci shell spacing, softer collide, farther Fit camera.
  Extends D-164 / D-151 / D-145. Docs: ui-spec §6, research-galaxy-topic-view-design.
  **Status: implemented.**

- **D-171 (paper_sim funds_only live quote teacher, 2026-07-19):** Extend D-122 MarketModel +
  D-137 credential discovery so **unbound `paper_sim` + `funds_only`** fills price from a
  **read-only** Alpaca paper quote when company/module/owner paper creds exist — without
  `submitOrder` and without forcing company broker bind. `resolveDispatchMarketQuote` fuses
  bound-adapter quote → owner Alpaca teacher → synthetic fail-open. Wire into dispatch,
  compile-select sizing, and position-exit marks; ValueRef provenance + `live_market_quote`
  gap tags follow. Honesty tags also emit `no_queue_position` / `no_market_impact`.
  Docs: internal-paper-trade-engine-design §5, broker-integration §7, experiment-log.
  **Status: implemented.**

- **D-172 (User settings existence + verify cache, 2026-07-19):** Settings modal caches
  **existence** (LLM/research keyHint rows, Alpaca/Kalshi summaries) and **verify badges**
  across open/close. Soft GET merges structures without wiping warm UI. Auto-probe only
  unknown / failed / invalidated providers (verified + format-ok skip). Draft edit, save,
  delete, and failed handshake invalidate that provider's verify. Never caches plaintext or
  ciphertext. Extends D-027. Docs: ui-spec §1 shell.   **Status: implemented.**

- **D-173 (option-tree anchors + complete canvas inspector, 2026-07-19):** Deterministic
  catalog decision points render as `optionAnchor` nodes under engine groups (template
  inputs, strategy families, branch roles, recovery phases, philosophy axes). Lever bands
  stay inspector-only. Canvas `InspectorPanel` is schema-complete via `SchemaConfigForm` +
  `LeverTreeSection`; selecting an engine or option anchor opens dedicated inspectors.
  Band positions persist on `setupSnapshot.optionAnchorPositions` (no raw numbers). Extends
  D-159 / D-091. Docs: ui-spec §3, canvas-engine-group-design,
  `docs/superpowers/specs/2026-07-19-option-anchor-nodes-design.md`.
  **Status: implemented.**

- **D-174 (DT/HFT cascade granularization + sector cohort, 2026-07-19):** Paper experiment
  across sectors for `engine_day_trading` + `engine_hft`. Defaults: day strategy palette
  `strat-001/002/005` (ORB, gap-and-go, VWAP); HFT feed paper-first `paper_sim`/`synthetic_sim`
  poll 5s (Alpaca IEX on bind). Deterministic cascade splits: `runCompileAdmissionCascade`
  (heat→valves→POV; denser HFT child slices); exit scan reads `subtype: hft` for measurable-gain
  floor + 10m time_stop; `strat-*` → recovery aliases with `strat-007`→`rec-006`. Cohort script
  `paper-sector-engine-cohort.ts` with create-cap archival. Docs: post-fill lifecycle,
  experiment-log EXP-2026-07-19-03, HFT design spec.   **Status: implemented (paper).**

- **D-175 (Market awareness linkage hybrid + Posture levels, 2026-07-19):** Linkage-first
  compound movers: durable `MarketAwarenessLink` edges (news/library/trend/macro →
  symbol/recommendation) built model-free during `library.system_movers`, sealed on
  `VerifiedNormalizedBundle.awarenessLinks`, and used as scoring bands
  (`newsLinkBand` / `libraryLinkBand` / `trendLinkBand` / `linkCoverageBand`) beside RS,
  volume, Jaccard fallback, and corroboration. Hub projects `awarenessAnalysis` for the
  expanded Market Posture window as four levels: Evidence → Links → Trends →
  Recommendations (primary emit). Model canvas remains secondary process chrome. Extends
  D-092 / D-169. Spec: `docs/superpowers/specs/2026-07-19-market-awareness-linkage-design.md`.
  Docs: ui-spec §4, data-model.   **Status: implemented.**

- **D-176 (engine family spacing + company cascade default, 2026-07-19):** Default canvas
  spacing for engines and connected structures: `researchToExecGap` 340, `topLevelGutter` 140,
  `ENGINE_GROUP_PADDING.right` 168 (option-anchor column), hub tight-gap clearance 48, hub
  spawn always via `placeDataHubOrigin`. Canvas engine insert gains `cascadeFromCompany`
  (default **true**): empty topic fills from `company.sectorFocuses`, capital defaults from
  `seedCreditsCents`; engine→member cascade unchanged. Extends D-035 / D-044 / D-159 / D-173.
  Docs: canvas-layout-and-dedicated-math-design, canvas-engine-group-design, ui-spec §3.
  **Status: implemented.**

- **D-177 (MarketModel ValueRef fusion + catalog slippage, 2026-07-19):** Extend D-171
  MarketModel so dispatch fuses fresh company price ValueRefs (`live_api:quote:{SYM}`,
  alpaca quote marks) with adapter / owner Alpaca teachers. Trend `pollQuotes` persists
  marks via `recordPolledQuotesAsValueRefs`. InternalPaperCore fills resolve slippage from
  catalog `max_slippage_bps_band` (typical) and optional square-root participation impact
  when POV participation is known (compile lineage or operator multi-share plan). Honesty
  tags: `square_root_impact_proxy` vs `no_market_impact`. Off-hours: stale venue marks are
  rebucketed to clock-now for the paper gauntlet with `prior_session_mark` (prices stay
  venue-sourced; RTH still drops stale teachers per D-171). No secrets in payloads; quote
  teacher remains read-only. Docs: internal-paper-trade-engine-design Phase 7,
  broker-integration §7, experiment-log EXP-2026-07-19-04.
  **Status: implemented.**

- **D-178 (galaxy natural volume + label declutter, 2026-07-19):** Address residual central
  blob after D-170: wider folder Fibonacci shells + hard gap ≥ 1.85 + density breath;
  packing gap ≥ **1.62**; stronger charge; softer nest/folder/article attractors; longer
  springs. Nest nameplates: libraries quiet; **folder/article labels hover/select or close
  zoom only** — no always-on stacked shelf chips. Concept canvas labels require higher zoom.
  Docs: ui-spec §6, research-galaxy-topic-view-design.   **Status: implemented.**

- **D-179 (Model spacing + mid-pipeline metric emissions, 2026-07-19):** Widen Market Posture
  Model column/track spacing (process/stage/panel gaps, source row stack). Add edge type
  `emit` (dashed) so calculation stages **and** process-function nodes emit metrics into
  operator boards mid-pipeline — not only hub_ready→panel. Panel surfaces gain
  `emitFromStages` / `emitFromFunctions` plus awareness level boards
  (`awareness_evidence|links|trends|recommendations`) wired from D-175 analysis. Extends
  D-161 / D-165 / D-169 / D-175. Docs: ui-spec §4, data-model.   **Status: implemented.**

- **D-180 (research option-tree anchors + owner docking, 2026-07-19):** Expand
  `buildOptionAnchorsForEngine` for research engines: `research_subtype`, `curiosity_band`,
  `admission_mode`, `cadence_band`, discover→verify `branch_role`, `librarian_subtype`,
  `library_class`, `trend_posture`, `emit_mode`, research philosophy axes
  (`evidence_bar` / `research_breadth` / `regime_bias`), plus strategic/research lever bands
  (inspector-only). Canvas placement docks owned roots beside owner modules with
  `option_bind` owner→root→child edges; unowned roots remain in the engine column. Extends
  D-173. Docs: ui-spec §3, canvas-engine-group-design, option-anchor-nodes-design.
  **Status: implemented.**

- **D-181 (seven-slot Market Hub analyze cadence, 2026-07-19):** Replace the D-070 four-slot
  daily summary tags (`pre_open` / `midday` / `close` / `post_analysis`) with
  `MarketHubAnalyzePhase`: `wake_up`, `pre_market`, `mid_morning`, `midday`, `afternoon`,
  `market_close`, `evening`. Operator **Analyze** resolves the current-moment slot via
  `resolveAnalyzePhase(session, nowMs)` (America/New_York wall clock refined by XNYS
  open/close; injectable clock only). Scheduled runs use `et:HH:MM` schedule expressions
  (05:00 / 07:30 / 10:00 / 12:00 / 14:00 / 16:00 / 18:30 ET). Seal subject keys
  `phase_{analyzePhase}`; document shape has seven section headings; Analyze response
  returns `analyzePhase` + `analyzePhaseLabel`. Legacy phase tags normalize onto the new
  vocabulary. Distinct from calendar `SessionPhase`. Extends D-070 / D-111 / D-120.
  Docs: research-live-system-cadence, ui-spec §4. **Status: implemented.**

- **D-182 (canvas block accidental swipe-back, 2026-07-19):** Main company React Flow canvas
  uses `overscroll-behavior: none` (wrapper + `.react-flow__pane`) so trackpad / touch pans
  do not trigger browser history back/forward while navigating the graph. OS/browser edge
  swipes outside page content remain uncontrolled.   Docs: ui-spec §3.   **Status: implemented.**

- **D-183 (expanded analyze slots + movement auto-analyze + diversified posture, 2026-07-19):**
  Grow analyze cadence to ten slots (`overnight`, `open_bell`, `power_hour` added) with
  per-slot `gatherBias` / `focusAreas` / `queryHints`. Scheduled ET triggers enqueue full
  Analyze via `library.market_hub_analyze` (not daily-only). Each analysis is timing-tailored
  in movers gather query, daily section copy, and posture narrative. Auto-trigger Analyze
  when diversified baseline signals fire (≥3 families: leadership, volume, link coverage,
  news+macro, trend alignment, corroboration, breadth) with cooldown. Expand market-state
  sources: sector-focus peer ETFs, broader liquid anchors, `macroLinkBand` in compound rank.
  Extends D-175 / D-181. Docs: research-live-system-cadence, ui-spec §4. **Status: implemented.**

- **D-186 (Market Posture stage-strip workspace, 2026-07-19):** Day overlay is a two-band
  workspace: horizontal **pipeline-column stage screens** (capital → **live** → **library** →
  process → **outlook** → day) snap-scroll above a fixed bottom **Model diagram strip**.
  **Live precedes library** so API normalize/hydrate feeds corpus constants and built-in
  functions.   **Live ingest** shows active sources, search/filter orientation (route +
  operation + contribution), fetch→normalize→extract chains, an **analysis module**
  (organize → route → score) before library seed, and **system variables**
  (`analysisRoles`) for downstream nodes. Kind-specific adapter process nodes and
  `analyze:*` nodes sit on the Live strip column; Model edges are
  adapter/process → organize → route → score → `lib:*` (seed), not bare live→lib
  hydrate. **Library** shows scored seed intake onto admitted shelves, then
  sector/company constants
  (numerical + semantic) from sectors, engines, shelves, and holdings — admission ranges
  and market-aware positioning context. **Process** links market + news + library evidence
  and emits **tagged trend lists** with symbols. **Outlook** (operator name for the former
  seals column) shows all watched symbols/values, open positions, plus spark-path /
  heldVsCost **growth outlook** (orientation only; no invented forward dollars) alongside
  **committed stock/news boards**. Stage/model copy uses **board / commit** language
  (`Movers board`, `board movers`, `on board`) while internal ids remain `seal_movers`
  etc. **Day plan** analyzes
  upstream stages into actionable movements, watch/plan actions, research topics
  (sector lenses + committed reports), and daily trends. Each diagram column emits into the
  screen above it; clicking a Model node navigates to its owning screen
  (`resolveStageScreenId`; legacy `group:seals` → outlook). Charts and main readouts come
  first; each stage ends with a **Group nodes → numbers** trace for **active**
  services/pipelines only. Mid-page Model section removed. ViewContext carries
  `activeStageScreenId` + `selectedModelNodeId`. Strip Model uses **screen-group columns**
  with **connection-based spread**: role lanes (x) + barycenter relevance (y); **no node
  overflow cap**; **all intra-screen and inter-screen edges** retained, plus group→group
  backbone edges for cross-column flows. Strip **viewing groups** (`process_cluster`):
  Live bundles source→adapter→analyze (organize/route/score) per kind; Library nests
  per-shelf chains (`shelf_{id}`: lib → lib-adapter → `process:library:*`); Process nests
  shared route clusters with **track lanes** for remaining stages; Capital lanes
  `company_root` left of `execution_split`; Outlook lanes by stage order; Day lanes by
  panel family. Cluster click navigates via `stageScreenId` (not hard-coded Process).
  Every strip content node is stamped with `stageScreenId` and mapped into that screen’s
  emission traces. Strip data-flow is left→right: library adapters use `lib-adapter:`
  (not Live), `providers` lives on Process, positions panel on Outlook, panel edges skip
  backward hops, group backbones are forward-only, and live analysis seeds libraries after
  score. **Capital** = root user-controlled funds only (company pool + holding funds) plus
  engine allocation and position/equity readouts. Extends D-131 / D-147 / D-160 / D-179.
  Docs: ui-spec §4 Market posture. **Status: implemented.**

- **D-185 (left/right panel toggle + layering, 2026-07-19):** Amend D-123: re-clicking an
  already-active left/right rail (or header) tab collapses that panel. Opening the left panel
  auto-collapses the right. Explicitly opening a right view while left remains open layers the
  right panel body over the left (`absolute`/`z-[45]`, rail stays docked; below AST `z-50`).
  Any click on the left rail/body hides the right again. Coordinated via `PanelShellContext`
  inside `CompanyResearchShell`. LIB re-click exits full-height and collapses left; AST
  remains an independent toggle (D-150).   Docs: ui-spec §4.   **Status: implemented.**

- **D-187 (paper honesty UI + multi-share impact proof, 2026-07-19):** Surface
  `simulatorGapTags` as text-first chips on Executions (right panel) and the shell
  ticker (`simHonestyChips` / `simHonestyTickerLabel`). Dispatch records MarketModel
  quote ValueRefs with feed-class provenance (`alpaca_iex_paper:quote:*` /
  `live_api:quote:*`) so fusion stays live-aware. Extend `paper-system-verify` for
  multi-share `square_root_impact_proxy` + child-drain tags and executions-feed tag
  presence. Verify harness hardened (capacity archival, activity∪executions wait,
  fail-fast on dead Next). Extends D-167 / D-177. Docs: experiment-log EXP-2026-07-19-05,
  broker-integration §7, ui-spec §1 shell / §4 panels.
  **Status: implemented (API 25/25 verified).**

- **D-188 (honesty chips on Decisions + TraceTimeline, 2026-07-19):** Extend D-187
  surfaces so BottomPanel Decisions + Lineage execution rows and TraceTimeline modal
  show the same `simHonestyChips` vocabulary (`data-testid` decisions / lineage /
  timeline-honesty-chips). Timeline API returns optional `simulatorGapTags` on
  `TraceTimelineResponse`. Docs: ui-spec §4 panels.
  **Status: implemented.**

- **D-189 (simulation ENGINE templates + exec family placement, 2026-07-19):** New
  create section `simulation` with bespoke templates `sim_gate_strategy_spread` (pre/gate),
  `sim_train_policy_replay` (post/training), `sim_adhoc_paper_desk` (standalone). Execution
  create defaults to **2** child sims (overridable none..N); linked sims require parent
  execution + placement; binding on `setup_snapshot.simulationBinding`. Integrates with
  paper spine (D-122); live remains fail-closed. Spec:
  `docs/superpowers/specs/2026-07-19-simulation-engine-templates-design.md`.
  Docs: product-spec, canvas-engine-group-design, engine-node-family-design, data-model.
  **Status: implemented (templates + create/palette/API wiring).**

- **D-190 (sim subtype fix + honesty e2e hardening, 2026-07-19):** Repair D-189 sim
  trading seeds that used invalid `subtype: 'day_trading'` (create fail-closed on
  `TradingSubtype`). Expand `simHonestyChips` with No queue / Both-verify / Pre-block.
  E2E picks day-trade desk over sim children (`pickPaperPipelineModules`); 
  `waitForFilledActivity` merges executions; paper-loop asserts honesty chip testids.
  Re-verified `paper-system-verify` **25/25**. Docs: ui-spec §4, experiment-log EXP-06.
  **Status: implemented.**

- **D-191 (dual research paths — inline spine + child packs → hub, 2026-07-19):** Each
  **execution ENGINE** keeps an **inline specialty research** module at the spine start
  (`research` → librarian → library) for **internal** desk gathering and processing inside
  the execution family. Child **research ENGINEs** seeded from
  `EXECUTION_ENGINE_RESEARCH_DEPENDENCIES` are separate family members (left column) that
  hydrate the parent **Engine Data Hub** (analyzer emit → hub via `targetLibraryIds` /
  utility binds). **Subtype overlap is intentional** (dual path): e.g. day-trading inline
  `specialty_desk` coexists with `research_market_regime_lab` + `research_desk_aligned`;
  HFT inline `microstructure_context` coexists with `research_microstructure_lab`. **Do NOT**
  strip inline research when adding or refining child packs. Simulation family **pre/post**
  placement (D-189) is target layout under this refinement. `template_input` option anchors
  resolve owners from `templateInput.target.moduleIndex` (e.g. `focus` → trend member).
  Extends D-043 / D-140 / D-159 / D-180 / D-184 / D-189. Spec alignment: engine full
  refinement plan. Docs: canvas-engine-group-design, engine-node-family-design.
  **Status: implemented** (anchors ownership, templates dual-path labels, research↔hub
  binding, sim family pre/post layout, mimicParent, live_api query/schedule/widgets).

- **D-192 (paper trade quote honesty preview, 2026-07-19):** PaperTradeForm previews
  MarketModel quote class before submit via `GET …/trade/quote-preview` (same
  `resolveDispatchMarketQuote` path as dispatch). Returns honesty tags + optional
  markCents for operator display; qty≥2 soft-flags impact proxy. Extends D-187 /
  D-177. Docs: ui-spec §4, broker-integration §7, experiment-log EXP-07.
  **Status: implemented.**

- **D-193 (processing queue modal, company-scoped, 2026-07-19):** Replace the read-only
  global queue chip with a **Processing queue** button on the company ribbon. Opens a
  portal modal board: one column per `QueueClass`, listing this company’s pending /
  active / dead jobs (from `GET …/jobs/pending` + `GET …/jobs/dead`). Chip label uses
  the same company-scoped counts (not `/api/queue/stats`). Bottom Lineage Queue / Dead
  letters unchanged. Spec:
  `docs/superpowers/specs/2026-07-19-processing-queue-modal-design.md`.
  Docs: ui-spec §2. **Status: implemented.**

- **D-194 (paper honesty vocabulary + operator quote hydrate + limit UI, 2026-07-19):**
  Expand `simHonestyChips` with Inline fill / No venue latency / On service.
  Operator path hydrates ad-hoc symbols into `live_api:quote:*` ValueRefs before
  MarketModel resolve (`hydrateOperatorQuoteValueRefs`). PaperTradeForm adds limit
  order type + deep Playwright coverage (`paper-trade-deep.spec.ts`). Extends D-192.
  Docs: ui-spec §4, experiment-log EXP-08.
  **Status: implemented.**

- **D-195 (derived folder hulls after semantic layout, 2026-07-19):** Restructure galaxy
  forces so **tag + semantic springs run first**; folder (and library) wire spheres are
  fitted each tick around the outermost included concepts (`createDerivedFolderHullForce`).
  Remove folderNest / folderShell / folderCohere / nestShell / articleHullOrbit as concept
  attractors. Concepts seed from library/article only — not folder shells. Docs: ui-spec §6,
  research-galaxy-topic-view-design.   **Status: implemented.**

- **D-196 (shell-first company loading, 2026-07-19):** Company route paints app shell
  (header + chrome) immediately via `loading.tsx` and streams canvas/panels behind
  `Suspense` after a fast `getOwnedCompany` identity read. Heavy module/link/engine
  loads + layout mutations run in the Suspense child. Directory lists companies first;
  per-card service coverage streams. Client surfaces show text loading states
  (ExecutionTicker, RightPanel, BottomPanel) until their fetches resolve. Docs: ui-spec §2.
  **Status: implemented.**

- **D-197 (company list metadata cache, 2026-07-19):** Module-memory stale-while-revalidate
  cache of slim company rows (`id`, `name`, `mode`) for `CompanySwitcher` and other
  selection UIs. Warmed on switcher mount and hydrated from the companies directory;
  create / rename / duplicate / archive upsert or remove cache rows so the dropdown
  stays instant. Docs: ui-spec §2. **Status: implemented.**

- **D-198 (rich loading chrome, 2026-07-19):** Shared indeterminate progress bars,
  status dots, and shimmer skeletons (`LoadingChrome` + globals animations) for company
  shell, workspace Suspense, directory cards, ticker, and panel fetches. Text-first
  status labels remain primary; motion reinforces. Extends D-196. Docs: ui-spec §2 / §8.
  **Status: implemented.**

- **D-199 (peer membership hulls — no nested orbit packing, 2026-07-19):** Galaxy concepts
  place via charge + tag/semantic springs only. Library, folder, and article are **peer
  first-class membership objects**; wire spheres are fitted each tick around their members
  (`createDerivedMembershipHullForce`). Remove nest / articleOrbit / foreignRepel /
  libBridge forces and nested packing seeds (article-inside-folder-inside-library).
  `hierarchicalLinkScale` uses similarity bands only. Extends D-195. Docs: ui-spec §6,
  research-galaxy-topic-view-design. **Status: implemented.**

- **D-200 (progressive shell hydration, 2026-07-19):** Company workspace paints interactive
  chrome (header controls, panel rails/buttons) as soon as identity resolves; Suspense
  fallback mounts real Left/Right/Bottom panels with empty graph props while module/link/
  engine lists stream. Layout heal (D-159/D-168 + time hubs) moves to
  `POST …/canvas/family-layout` after paint (fire-and-forget). RightPanel defaults closed
  and fetches only when open with per-field progressive updates; LeftPanel defers
  `refreshShell` until open; LLM ribbon shows `llm: …` placeholder instead of null.
  Extends D-196/D-198. Docs: ui-spec §2. **Status: implemented.**

- **D-201 (slim retro loading chrome, 2026-07-19):** LoadingChrome uses 1–2px flat stepped
  bars (no accent glow / glass gradients), square blink cursor dots, single-line
  `label · detail` status, and quiet border-only region blocks. Inline strips prefer
  text-only (`bar={false}`) in panels/ticker. Extends D-198. Docs: ui-spec §8.
  **Status: implemented.**

- **D-202 (unified decision nodes — options as config, 2026-07-19):** Evolve D-173/D-180
  option-anchor forests into one React Flow **decision node** per deterministic choice
  point. Options live in `options[]` with per-option `option-out:{id}` handles; intakes
  are data + system-control from the owner module. Strategy branches and recovery phases
  collapse into parent options; research/librarian/live-api kinds are sibling decision
  roots (full enum catalogs). Templates seed stable decision kinds; modules declare
  `MODULE_REQUIRED_DECISION_KINDS`. Persistence: `setupSnapshot.decisionNodes` +
  `decisionOptionSelections` (legacy optionAnchors retained). Spec:
  `docs/superpowers/specs/2026-07-19-unified-decision-nodes-design.md`. Extends D-173 /
  D-180 / D-191. Docs: ui-spec §3, canvas-engine-group-design.
  **Status: implemented.**

- **D-203 (wheels for buttons, bars for screens, 2026-07-19):** Loading contract split —
  **buttons / chips / rail slots / shaped controls** use stepped `LoadingWheel`;
  **interface screens** (panels, canvas regions, directory, ticker strips) use flat
  `IndeterminateProgressBar` / `InlineLoadingStrip`. Extends D-201. Docs: ui-spec §8.
  **Status: implemented.**

- **D-204 (palette inventory + unified engines/modules chrome, 2026-07-19):** Canvas
  top-left launcher is one segmented control (**Engines** first, then **Modules**).
  Default panel lists structures already on the canvas; **Add new** opens the existing
  store catalog. Inventory click focuses the node. Extends D-023 / D-088 / D-176.
  Docs: ui-spec §3. **Status: implemented.**

- **D-205 (BookDelta → participation valve training, 2026-07-19):** Close the
  observation-only BookDelta loop: aggregate unapplied `training_feedback.book_delta`
  rows (fill-price bps and/or provider rejects) into a bounded
  `participation_rate_band` step via `proposeBandPositionFromBookDeltas` →
  `applyControlSnapshotDelta` → `persistControlSnapshot`. Handler
  `maintenance.book_delta_valves`; HTTP `GET …/book-deltas` +
  `POST …/training/book-delta-valves`. Verify opt-in:
  `HFTR_BOTH_VERIFY_SMOKE=1`, `HFTR_REQUIRE_RTH_FRESH=1` (weekday RTH). Extends D-122
  Phase 4. Docs: data-model, broker-integration, experiment-log EXP-09.
  **Status: implemented.**

- **D-206 (lightweight execution ticker feed, 2026-07-19):** Header `ExecutionTicker`
  uses `GET …/executions/ticker` (traces + ledger only, limit 20) instead of the
  enriched `/executions` causation walk. Chrome always paints (`Executions · …`);
  rows fill when ready; 8s abort; poll keeps prior rows on refresh failure. Full
  `/executions` still serves panels and parallelizes ledger+tasks after traces.
  Docs: ui-spec §2. **Status: implemented.**

- **D-207 (engine decision palettes by desk category, 2026-07-19):** Every
  `ENGINE_TEMPLATES` entry declares `decisionNodes` (helpers for execution /
  research / sim desks; custom arrays for dual/triple research layouts).
  `CATEGORY_STRATEGY_PALETTE` + `resolveStrategyFamiliesForTrader` map desks onto
  seeded-strategy-catalog: day ORB/gap/VWAP (`001/002/005`), HFT market-making
  (`007`), crypto trend/reversion/pairs (`003/005/008`), long-term
  trend/compression/lead-lag (`003/004/009`), prediction interim reversion+RV
  (`005/008`). Builder applies seed `optionRefs` / `defaultSelectedRef`. Extends
  D-174 / D-202. Docs: canvas-engine-group-design, `engine-decision-seeds.ts`.
  **Status: implemented.**

- **D-208 (decision nodes as single multi-port units, 2026-07-19):** Stop rendering
  choice points as compound forests. Each canvas decision is **one** React Flow
  node with labeled intake ports (data / system / clock) and **one source port per
  option**. Strategy palette is a single `strategy_family` node (families = outs);
  branch taxonomy is a sibling `branch_role` node — never one card per family or
  per option leaf. Template inputs stay inspector-only; auto-bind is one data
  intake edge per decision. Extends D-202 / D-207. Docs: ui-spec §3,
  canvas-engine-group-design, DecisionNode.tsx.
  **Status: implemented.**

- **D-209 (per-engine canvas loading shells, 2026-07-19):** ENGINE envelopes paint
  as soon as `listEngineInstances` (+ utility buses) resolve; nested Suspense streams
  modules/links afterward. `EngineGroupNode` keeps category chrome + label while
  `hydrationPhase: 'loading'` shows screen-style `InlineLoadingStrip`; setup fields
  and bus chips wait for ready. Palette `insertEngine` paints a provisional shell
  before each `POST …/engines` and swaps on success (strips pending on failure).
  Extends D-196 / D-200 / D-203. Docs: ui-spec §2, canvas-engine-group-design.
  **Status: implemented.**

- **D-210 (execution child-dependency defaults + validation, 2026-07-19):** Contracts
  `requiredChildDependenciesForExecution` / `missingChildDependenciesForExecution` /
  `presentChildTemplateIdsForExecution` / `seedEngineDecisionSnapshot` derive required
  research packs + default gate/training sims from `EXECUTION_ENGINE_*_DEPENDENCIES`
  and persist `decisionNodes` + `decisionOptionSelections` on engine create (POST +
  company create). `setup_snapshot.researchLibraryBinding` is now stamped at insert
  (with resolved parent id) alongside `simulationBinding` so presence is
  **parent-scoped**, not canvas-wide template coincidence. Execution chrome shows
  text-first **Required** warn chips for missing child engines; inspector lists
  required vs present with **Add missing** (same bindings as palette insert).
  Save setup stays allowed when deps missing. Docs: ui-spec §3, canvas-engine-group-design.
  **Status: implemented.**

- **D-211 (engines inventory parent-child outline, 2026-07-19):** Floating Engines
  inventory (top-left hover chrome) nests research packs and linked sims under their
  parent execution using attach_execution / parentExecutionEngineId bindings.
  Nested `<ul>` with left-rule indent + └ marker; badges show Research / Sim · gate|
  train. Orphans (no parent on canvas) stay roots. Extends D-204 / D-210.
  Docs: ui-spec §3. **Status: implemented.**

- **D-212 (engine member lane-row hard bands, 2026-07-19):** `rankEngineMembers`
  treats `MODULE_LANE_ROW` as a hard vertical ordering constraint within a column
  (research above librarian, library above live_api, analyzer above policy).
  Barycenter sweeps may only reorder peers sharing the same lane row; a post-sweep
  finalize pass stable-partitions by lane row and preserves within-band barycenter
  order. Fixes inversion when cross-column neighbors lack median targets
  (`median ?? Infinity`). Create-form preview uses `layoutEngineTemplateAtOrigin`
  (not scaled template JSON positions). Option-anchor docking uses per-`dockX`
  cursors so owners in different columns stack independently. Docs: canvas-layout-
  and-dedicated-math-design, canvas-engine-group-design. **Status: implemented.**

- **D-213 (canvas-primary decisions + sector template prefill, 2026-07-19):**
  `CANVAS_PRIMARY_DECISION_KINDS` limits canvas decision cards to desk-level
  choices (subtype, strategy family, branch role, recovery, emit/feed class, etc.).
  Secondary module tuning (`curiosity_band`, `admission_mode`, `cadence_band`,
  `query_policy`, `schedule_policy`) and `philosophy_axis` stay inspector/lever-tree
  only. `seedTemplateInputsFromSectorFocus` prefills `topicScope` / `focus` from
  company sector focus on create-form seeds, palette insert, and auto research/sim
  deps. `EngineGroupNode` always renders template input fields from
  `template.inputs` (not stored-keys only) and shows muted **Attached:** chips for
  present child research/sim engines alongside **Missing:** warn chips.
  Docs: canvas-engine-group-design, ui-spec §3. **Status: implemented.**

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
- **OQ-12 (resolved 2026-07-18, D-134):** Commit policy — workspace **requires** commits
  after every session and every verified update; do not wait for an explicit “please commit.”
  Push remains user-request-only. Generic user-rule “commit only when asked” does **not**
  apply inside hftr-v2 for verified work.
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
- **OQ-13 (resolved 2026-07-18, D-122):** Dual paper books + engine→service binding —
  resolved: per-engine bind; unbound → paper functions; bound → provider ledger as funds
  source; switchable routing with `funds_only` default; `both_verify` for provider-fill
  deltas; live market model only as `funds_only` teacher; flexible awareness substrate
  (D-120 + D-126 + extensible); **engine-allocated capital with no cross-engine spend
  unless explicitly shared**; main book = rollup.
