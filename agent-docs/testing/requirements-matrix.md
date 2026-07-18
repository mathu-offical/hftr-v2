# hftr-v2 Requirements → Evidence Matrix

**Program:** paper intent-alignment  
**Generated:** 2026-07-17  
**Total rows:** 170

## Status summary

| Status | Count |
|---|---:|
| implemented | 111 |
| stub | 11 |
| doc-only | 0 |
| deferred | 43 |
| partial | 1 |
| specified | 4 |

## Doc-drift flags

- **REQ-FND-002** — E2E uses DEV_AUTH_BYPASS; Clerk sign-up flow not Playwright-covered (doc-drift vs ui-spec flow 1).
- **REQ-SAF-003** — doc-drift: master-build-plan cites ≥294 v1 tests; current engine+contracts ~57 vitest cases only.
- **REQ-TST-006** — doc-drift: flow 1 claimed in spec table but explicitly marked not Clerk-covered.

Additional drift (not in JSON flag list):
- none currently (REQ-TST-007 synthetic spine covered by `paper-intent-alignment.spec.ts`;
  real-model/live-data variants remain deferred in the REQ-TST-007 row notes).
- **REQ-TST-008** — ui-spec flow 7 (Math lineage) listed but not Playwright-covered.
- **ui-spec §7** claims IronBee verification; master-build-plan G1 notes IronBee was unavailable for formal sign-off — treat browser claims as environment-dependent.

## Column legend

| Column | Values |
|---|---|
| status | `implemented` = shipped & evidenced; `stub` = honest placeholder; `doc-only` = spec only; `deferred` = M2–M6 or future; `partial` / `specified` = in progress or design-locked |
| venues | Trading/runtime venue or `platform` for app-wide |
| philosophy_axes | Co-equal product objectives (v1 compliance baseline) |
| safety_class | Review priority for paper→live promotion |

## Harvest sources

- `agent-docs/product/product-spec.md`
- `agent-docs/architecture/*.md` (6 files)
- `agent-docs/ui-ux/ui-spec.md`
- `agent-docs/plans/master-build-plan.md` (read for requirements; not edited by this matrix)
- `apps/web/app/api/**/route.ts` (32 routes)
- `packages/engine/src/handlers/` (6 handlers + registry)
- `packages/adapters/`
- `packages/contracts/src/` (12 modules)
- `packages/db/src/seed/catalogs/` (9 JSON catalogs)

---

## Foundation (M0) (10)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-FND-001 | Monorepo scaffold (pnpm + turbo) | agent-docs/plans/master-build-plan.md §M0 | **implemented** | package.json; turbo.json… | pnpm typecheck; pnpm test | platform | operator_transparency | operational |
| REQ-FND-002 ⚠ | Clerk auth middleware and user bootstrap | agent-docs/plans/master-build-plan.md §M0 | **implemented** | apps/web/middleware.ts; apps/web/app/layout.tsx… | Clerk sign-in (manual); DEV_AUTH_BYPASS E2E | platform | compliance_posture | safety_critical |
| REQ-FND-003 | Neon Postgres + Drizzle migrations | agent-docs/architecture/data-model.md | **implemented** | packages/db/migrations/; packages/db/src/schema/ | migrations apply from zero | platform | operator_transparency | operational |
| REQ-FND-004 | Health endpoint and deploy skeleton | agent-docs/architecture/system-architecture.md §6 | **implemented** | apps/web/app/api/health/route.ts | GET /api/health | platform | operator_transparency | operational |
| REQ-FND-005 | CI typecheck, lint, vitest | agent-docs/plans/master-build-plan.md §M0 | **implemented** | .github/workflows/; package.json scripts | pnpm typecheck; pnpm lint; pnpm test | platform | operator_transparency | operational |
| REQ-FND-006 | Contracts package with v1 carryover types | packages/contracts/src/ | **implemented** | packages/contracts/src/foundation.ts; packages/contracts/src/pipeline.ts… | packages/contracts vitest | all | compliance_posture, risk_controls | safety_critical |
| REQ-FND-007 | Ownership scoping on all API queries | agent-docs/architecture/data-model.md §Integrity | **implemented** | packages/db/src/scoping.ts; apps/web/lib/api.ts | scoping unit tests | platform | compliance_posture | safety_critical |
| REQ-FND-008 | ENV contract (.env.example ↔ contracts) | packages/contracts/src/env.ts | **implemented** | packages/contracts/src/env.ts; .env.example | env schema parse | platform | operator_transparency | operational |
| REQ-FND-009 | Append-only audit tables (no UPDATE/DELETE) | agent-docs/architecture/data-model.md | **implemented** | packages/db/src/schema/; action_traces… | schema review | platform | compliance_posture | safety_critical |
| REQ-FND-010 | Engine package pure (no Next/React imports) | agent-docs/architecture/system-architecture.md §1 | **implemented** | packages/engine/src/; packages/engine/package.json | import boundary review | all | risk_controls | safety_critical |

## Companies (10)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-CMP-001 | Company list and create API | apps/web/app/api/companies/route.ts | **implemented** | apps/web/app/api/companies/route.ts; packages/contracts/src/modules.ts CreateCompanyInput | companies.spec.ts; POST /api/companies | platform | operator_transparency | operational |
| REQ-CMP-002 | Company create engines (≥1; quick-add day/trend) | agent-docs/product/product-spec.md §2 | **implemented** | packages/contracts/src/templates.ts ENGINE_TEMPLATES; CreateCompanyForm quick-add | companies.spec.ts engine cards | paper_sim | strategy_outcome | operational |
| REQ-CMP-003 | Company creation wizard UI (engine-centric D-043) | agent-docs/ui-ux/ui-spec.md §3 | **implemented** | apps/web/components/CreateCompanyForm.tsx; apps/web/app/companies/page.tsx | companies.spec.ts | platform | operator_transparency | operational |
| REQ-CMP-004 | Template setup Required chips + confirmed in-field checks | agent-docs/product/product-spec.md §2 (D-024) | **implemented** | apps/web/components/canvas/ModuleSetupFields.tsx; apps/web/lib/module-setup.ts | companies.spec.ts Required chips; company-workspace.spec.ts inline save | paper_sim | operator_transparency, risk_controls | financial |
| REQ-CMP-005 | Skip setup opens draft canvas with missing chips | agent-docs/product/product-spec.md §2 | **implemented** | apps/web/components/CreateCompanyForm.tsx; company-workspace.spec.ts | company-workspace.spec.ts Skip flow | paper_sim | operator_transparency | operational |
| REQ-CMP-006 | Company philosophy, goals, policies fields | agent-docs/product/product-spec.md §2 | **implemented** | packages/db/src/schema/companies.ts; CreateCompanyInput | company create form | platform | strategy_outcome | operational |
| REQ-CMP-007 ⚠ | Paper/live mode per company | agent-docs/product/product-spec.md §2 | **implemented** | companies.mode column; apps/web/components/shell/ModeSwitch.tsx | company-workspace paper chip | paper_sim, alpaca | compliance_posture, risk_controls | safety_critical |
| REQ-CMP-008 | Company GET/PATCH/DELETE (archive) | apps/web/app/api/companies/[companyId]/route.ts | **implemented** | apps/web/app/api/companies/[companyId]/route.ts; apps/web/e2e/fixtures.ts archiveCompany | E2E teardown archive | platform | operator_transparency | operational |
| REQ-CMP-009 | Per-module capital allocation via ValueRef | agent-docs/architecture/number-handling.md | **implemented** | modules.capital_allocation_ref; apps/web/lib/module-setup.ts… | company-workspace trading node setup | paper_sim | risk_controls, operator_transparency | financial |
| REQ-CMP-010 | Target exit temporal ref at module setup | agent-docs/architecture/number-handling.md §4c | **implemented** | modules.target_exit_ref; ModuleSetupFields.tsx | company-workspace target exit fill | paper_sim | risk_controls | financial |

## Modules & canvas graph (12)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-MDL-001 | Module list/create API | apps/web/app/api/companies/[companyId]/modules/route.ts | **implemented** | modules/route.ts; MODULE_CONFIG_SCHEMAS | module store insert | paper_sim | operator_transparency | operational |
| REQ-MDL-002 | Module GET/PATCH/DELETE | apps/web/app/api/companies/[companyId]/modules/[moduleId]/route.ts | **implemented** | modules/[moduleId]/route.ts | PATCH setup save | paper_sim | operator_transparency | operational |
| REQ-MDL-003 | Module links CRUD (canvas edges) | apps/web/app/api/companies/[companyId]/links/ | **implemented** | links/route.ts; links/[linkId]/route.ts… | canvas edge count assertion | paper_sim | operator_transparency | operational |
| REQ-MDL-004 ⚠ | holding_fund module type (topology) | agent-docs/product/product-spec.md §3 | **implemented** | packages/contracts/src/modules.ts; day_trading_starter template | company-workspace Paper Seed Holding Fund node | paper_sim | operator_transparency | financial |
| REQ-MDL-005 ⚠ | fund_router module type (topology) | agent-docs/product/product-spec.md §3 | **implemented** | templates.ts; Deterministic Fund Router node | company-workspace 10-edge topology | paper_sim | risk_controls | financial |
| REQ-MDL-006 | Math module auto-created non-deletable | agent-docs/architecture/data-model.md | **implemented** | companies POST seeds math; ModuleNode.tsx | Deterministic Math Calculator visible | paper_sim | operator_transparency | financial |
| REQ-MDL-007 | day_trading_starter 10-node engine topology | agent-docs/ui-ux/ui-spec.md §3 | **implemented** | packages/contracts/src/templates.ts; company-workspace.spec.ts | 10 smoothstep edges; all node names | paper_sim | strategy_outcome, execution_quality | operational |
| REQ-MDL-008 | trend_research_lab template (research→library→trend) | packages/contracts/src/templates.ts | **implemented** | templates.ts COMPANY_TEMPLATES | companies.spec.ts Trend research lab button | paper_sim | research_quality | operational |
| REQ-MDL-009 | ENGINE_TEMPLATES with honest gating | packages/contracts/src/templates.ts | **implemented** | templates.ts ENGINE_TEMPLATES; Palette.tsx | module store Engines tab | paper_sim | compliance_posture | operational |
| REQ-MDL-010 | Canvas GET projection API | apps/web/app/api/companies/[companyId]/canvas/route.ts | **implemented** | canvas/route.ts; CompanyCanvas.tsx | canvas render on load | paper_sim | operator_transparency | operational |
| REQ-MDL-011 ⚠ | Policy nodes bind envelopes to trading modules | agent-docs/architecture/system-architecture.md §3 | **stub** | policy module type in schema; Paper Trading Policy link in template | topology visible | paper_sim | compliance_posture, risk_controls | safety_critical |
| REQ-MDL-012 | Trading presets (crypto, prediction, HFT, long-term) | agent-docs/product/product-spec.md §3 | **deferred** | templates.ts unavailableReason fields | M5 preset delivery | alpaca, kalshi | strategy_outcome | operational |
| REQ-ENG-001 | Engine utility buses on group chrome (D-091) | architecture/engine-motherboard-io-design.md | **implemented** | packages/contracts/src/engines.ts EngineUtilityBus; EngineGroupNode utility rail | utility rail handles per category | paper_sim | operator_transparency | operational |
| REQ-ENG-002 | engine_utility_links persistence + API | architecture/data-model.md | **implemented** | migration 0037; EngineUtilityLink contract; engine-utility-links route | POST/GET utility links | paper_sim | operator_transparency | operational |
| REQ-ENG-003 | Inter-engine data_out→data_in streams | architecture/engine-motherboard-io-design.md | **implemented** | stream_id + stream_descriptor contract; utility link API | engine↔engine edge on canvas | paper_sim | research_quality | operational |
| REQ-ENG-004 | Engine insert auto-hydration (clock, analyzer, names) | architecture/engine-motherboard-io-design.md §Auto-hydration | **implemented** | engines route hydration; analyzer templates; deriveLibraryDisplayName | research ENGINE terminal analyzer | paper_sim | operator_transparency | operational |
| REQ-ENG-005 | Engine clock utility bind (deprecate clock→member) | architecture/number-handling.md §8a | **implemented** | engine_utility_links clock bind on insert | clock bus on utility rail | paper_sim | compliance_posture | safety_critical |

## Canvas UI (10)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-CNV-001 | React Flow canvas with custom nodes | agent-docs/ui-ux/ui-spec.md §3 | **implemented** | apps/web/components/canvas/CompanyCanvas.tsx; ModuleNode.tsx | company-workspace canvas visible | paper_sim | operator_transparency | operational |
| REQ-CNV-002 | smoothstep rounded-elbow edges | agent-docs/ui-ux/ui-spec.md §3 (D-023) | **implemented** | CompanyCanvas.tsx ConnectionLineType.SmoothStep; company-workspace 10 edges | .react-flow__edge-smoothstep count | paper_sim | operator_transparency | operational |
| REQ-CNV-003 | Text-first node status lines | agent-docs/ui-ux/ui-spec.md §3 | **implemented** | ModuleNode.tsx status rendering | visual inspection | paper_sim | compliance_posture | compliance |
| REQ-CNV-004 | Module store palette (Modules + Engines) | agent-docs/ui-ux/ui-spec.md §3 | **implemented** | apps/web/components/canvas/Palette.tsx | company-workspace module store | paper_sim | operator_transparency | operational |
| REQ-CNV-005 | Minimap and zoom controls | agent-docs/ui-ux/ui-spec.md §3 | **implemented** | CompanyCanvas.tsx ReactFlow controls | manual canvas pan/zoom | paper_sim | operator_transparency | informational |
| REQ-CNV-006 ⚠ | Expanded in-canvas node detail view | agent-docs/ui-ux/ui-spec.md §3 | **stub** | ModuleNode selection + setup fields | partial: inline setup on select | paper_sim | operator_transparency | operational |
| REQ-CNV-007 | Edge animation during job activity | agent-docs/ui-ux/ui-spec.md §3 | **stub** | CompanyCanvas edge animated prop | activity API projection | paper_sim | operator_transparency | informational |
| REQ-CNV-008 | Hybrid activity sprites in nodes | agent-docs/ui-ux/ui-spec.md §1 | **stub** | ModuleNode activity layer references | queue projection hook | paper_sim | operator_transparency | informational |
| REQ-CNV-009 | ELK obstacle-avoiding edge routing | agent-docs/ui-ux/ui-spec.md §3 | **deferred** | ui-spec defers ELK/pathfinding | M6 polish | paper_sim | operator_transparency | informational |
| REQ-CNV-010 | LOD simplification below zoom threshold | agent-docs/ui-ux/ui-spec.md §3 | **deferred** | ui-spec requirement only | M6 perf pass | paper_sim | operator_transparency | informational |

## Application shell (8)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-SHL-001 | Top ribbon layout (logo → switcher → drawer → ticker) | agent-docs/ui-ux/ui-spec.md §2 | **implemented** | apps/web/app/companies/[companyId]/page.tsx | company-workspace ribbon | platform | operator_transparency | operational |
| REQ-SHL-002 | Company switcher dropdown | agent-docs/ui-ux/ui-spec.md §2 | **implemented** | CompanySwitcher component | Company ▾ button | platform | operator_transparency | operational |
| REQ-SHL-003 | TopDrawer (Ledger, Trading profile, Settings, Philosophy) | apps/web/components/shell/TopDrawer.tsx | **implemented** | TopDrawer.tsx | LLM / operating tab | platform | operator_transparency | operational |
| REQ-SHL-004 | ExecutionTicker marquee | apps/web/components/shell/ExecutionTicker.tsx | **implemented** | ExecutionTicker.tsx; executions API | ticker renders when fills exist | paper_sim | execution_quality | informational |
| REQ-SHL-005 | ModeSwitch with live gate popover | apps/web/components/shell/ModeSwitch.tsx | **implemented** | ModeSwitch.tsx | live blocked until broker milestone | paper_sim, alpaca | compliance_posture, risk_controls | safety_critical |
| REQ-SHL-006 | Queue status chip | agent-docs/ui-ux/ui-spec.md §2 | **implemented** | queue/stats route; shell queue chip | GET /api/queue/stats | platform | operator_transparency | operational |
| REQ-SHL-007 ⚠ | User API key settings (Anthropic/Mistral/Groq) | apps/web/app/api/settings/keys/ | **implemented** | settings/keys/route.ts; userApiKeys schema | UserSettingsLauncher modal | platform | operator_transparency | operational |
| REQ-SHL-008 | Separate LLM operating budget meter (D-024) | apps/web/app/api/companies/[companyId]/llm-budgets/route.ts | **implemented** | llm-budgets/route.ts; operating-budget.ts contracts | company-workspace LLM / operating view | platform | operator_transparency, risk_controls | financial |

## Panels (8)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-PAN-001 | Left panel Research + Libraries / Market posture / Data sources tabs | apps/web/components/panels/LeftPanel.tsx | **implemented** | LeftPanel.tsx; MarketPosturePanel; market-hub route | company-workspace [ shortcut | paper_sim | research_quality | operational |
| REQ-PAN-002 | Bottom panel Trends/Scenarios/Watchlists/Decisions (+ Lineage/Approvals/Dead); persistent ribbon tabs; execution-engine scope (D-097) | apps/web/components/panels/BottomPanel.tsx | **implemented** | BottomPanel.tsx | ` shortcut + ribbon tab click; engine dropdown | paper_sim | strategy_outcome | operational |
| REQ-PAN-003 | Right panel Verify/Executions/Ledger/Sims/Values | apps/web/components/panels/RightPanel.tsx | **implemented** | RightPanel.tsx; Paper balance label | ] shortcut; ledger tab | paper_sim | execution_quality, operator_transparency | financial |
| REQ-PAN-004 | Panel keyboard shortcuts ([, ], `) | agent-docs/ui-ux/ui-spec.md §4 | **implemented** | panel components key handlers | company-workspace keyboard section | paper_sim | operator_transparency | operational |
| REQ-PAN-005 | Per-company panel localStorage persistence | agent-docs/ui-ux/ui-spec.md §4 | **implemented** | hftr:{companyId}:panel:{left|bottom|right} keys | return visit state restore | paper_sim | operator_transparency | informational |
| REQ-PAN-006 | Trace timeline inspector modal | apps/web/app/api/companies/[companyId]/traces/[traceId]/timeline/route.ts | **implemented** | timeline/route.ts; TraceTimeline component | trace row click | paper_sim | execution_quality, compliance_posture | compliance |
| REQ-PAN-007 | Watchlists CRUD in bottom panel | apps/web/app/api/companies/[companyId]/watchlists/ | **implemented** | watchlists/route.ts; watchlist_items schema | watchlist API tests | paper_sim | strategy_outcome | operational |
| REQ-PAN-008 | Middle-bottom lineage columns (Trends→Decisions) | agent-docs/ui-ux/ui-spec.md §4 | **partial** | BottomPanel.tsx Lineage tab; data-testid=bottom-lineage-columns | lineage click-highlight | paper_sim | operator_transparency, strategy_outcome | operational |

## API routes (15)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-API-001 | POST modules/:id/trade operator paper trade | apps/web/app/api/companies/[companyId]/modules/[moduleId]/trade/route.ts | **implemented** | trade/route.ts; dispatch.paper_trade handler | manual trade enqueue+drain | paper_sim | execution_quality | financial |
| REQ-API-002 | POST modules/:id/scan trend scan trigger | apps/web/app/api/companies/[companyId]/modules/[moduleId]/scan/route.ts | **implemented** | scan/route.ts; trend.scan handler | trend.scan job | paper_sim | strategy_outcome | operational |
| REQ-API-003 | POST modules/:id/promote lead promotion spine | apps/web/app/api/companies/[companyId]/modules/[moduleId]/promote/route.ts | **implemented** | promote/route.ts; trend.promote handler | pipeline.test.ts promote path | paper_sim | strategy_outcome, risk_controls | safety_critical |
| REQ-API-004 | POST modules/:id/curate research curation | apps/web/app/api/companies/[companyId]/modules/[moduleId]/curate/route.ts | **implemented** | curate/route.ts; research.curate handler | research.curate job | paper_sim | research_quality | operational |
| REQ-API-005 | GET trends + POST create trend | apps/web/app/api/companies/[companyId]/trends/route.ts | **implemented** | trends/route.ts | trends panel data | paper_sim | strategy_outcome | operational |
| REQ-API-006 | GET leads projection | apps/web/app/api/companies/[companyId]/leads/route.ts | **implemented** | leads/route.ts; lead_packages table | leads panel | paper_sim | strategy_outcome | operational |
| REQ-API-007 | GET decision trees projection | apps/web/app/api/companies/[companyId]/trees/route.ts | **implemented** | trees/route.ts | tree inspector | paper_sim | strategy_outcome | operational |
| REQ-API-008 | GET executions feed | apps/web/app/api/companies/[companyId]/executions/route.ts | **implemented** | executions/route.ts | ExecutionTicker; right panel | paper_sim | execution_quality | financial |
| REQ-API-009 | GET verifications dashboard data | apps/web/app/api/companies/[companyId]/verifications/route.ts | **implemented** | verifications/route.ts | verify tab | paper_sim | compliance_posture | compliance |
| REQ-API-010 | GET positions snapshot | apps/web/app/api/companies/[companyId]/positions/route.ts | **implemented** | positions/route.ts; dispatch/positions.ts | dispatch.test.ts positions | paper_sim | risk_controls | financial |
| REQ-API-011 | GET numeric values (k/v browser API) | apps/web/app/api/companies/[companyId]/values/route.ts | **implemented** | values/route.ts; numeric_values schema | values tab API | paper_sim | operator_transparency | financial |
| REQ-API-012 | GET concepts (research) | apps/web/app/api/companies/[companyId]/concepts/route.ts | **implemented** | concepts/route.ts | left panel concepts | paper_sim | research_quality | operational |
| REQ-API-013 | GET activity projection for canvas | apps/web/app/api/companies/[companyId]/activity/route.ts | **implemented** | activity/route.ts | node activity badges | paper_sim | operator_transparency | informational |
| REQ-API-014 ⚠ | GET simulations list | apps/web/app/api/companies/[companyId]/simulations/route.ts | **stub** | simulations/route.ts returns empty/stub | sims tab placeholder | paper_sim | strategy_outcome | operational |
| REQ-API-015 | GET catalogs/:catalog seeded data | apps/web/app/api/catalogs/[catalog]/route.ts | **implemented** | catalogs route; catalog_entries | catalog browser | platform | research_quality | operational |

## Queue & orchestration (6)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-QUE-001 | Postgres SKIP LOCKED job queue | agent-docs/architecture/job-orchestration.md §2 | **implemented** | packages/engine/src/queue/queue.ts; jobs schema | queue claim tests | platform | execution_quality | operational |
| REQ-QUE-002 | Handler registry by job kind | packages/engine/src/handlers/registry.ts | **implemented** | registry.ts; registeredKinds() | handler unit tests | all | risk_controls | safety_critical |
| REQ-QUE-003 | POST /api/queue/drain time-boxed worker | apps/web/app/api/queue/drain/route.ts | **implemented** | queue/drain/route.ts; packages/engine/src/queue/drain.ts | trade route drain | platform | execution_quality | operational |
| REQ-QUE-004 | GET /api/queue/stats HUD projection | apps/web/app/api/queue/stats/route.ts | **implemented** | queue/stats/route.ts | assistant queue_status lookup | platform | operator_transparency | operational |
| REQ-QUE-005 | LLM budget admission on job claim | agent-docs/architecture/job-orchestration.md §2 | **deferred** | job-orchestration.md join spec; llm_budgets table exists | M2 admission wiring | platform | risk_controls | financial |
| REQ-QUE-006 | job_schedules cron materialization | agent-docs/architecture/job-orchestration.md §3 | **deferred** | job_schedules schema; maintenance.sweep stub | M2 module cadences | platform | execution_quality | operational |

## Synthetic paper pipeline (12)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-PIP-001 ⚠ | research.curate deterministic placeholder | packages/engine/src/handlers/research.ts | **stub** | research.ts; sourceClass deterministic_placeholder | curate API trigger | paper_sim | research_quality | operational |
| REQ-PIP-002 | trend.scan deterministic drift candidates | packages/engine/src/handlers/trend.ts | **implemented** | trend.ts; trend_candidates table… | scan API | paper_sim | strategy_outcome | operational |
| REQ-PIP-003 ⚠ | trend.promote full synthetic spine | packages/engine/src/handlers/promote.ts | **implemented** | promote.ts; pipeline.test.ts | promote→trade chain | paper_sim | strategy_outcome, execution_quality | safety_critical |
| REQ-PIP-004 | Six-gate lead activation | packages/engine/src/pipeline/gates.ts | **implemented** | gates.ts; lead_packages.activation | pipeline.test.ts gates | paper_sim | risk_controls, compliance_posture | safety_critical |
| REQ-PIP-005 ⚠ | Decision tree tactical decomposition | packages/engine/src/pipeline/tree.ts | **stub** | tree.ts; decision_trees table | pipeline.test.ts tree build | paper_sim | strategy_outcome | safety_critical |
| REQ-PIP-006 ⚠ | Groq compile stage (deterministic stand-in) | packages/engine/src/pipeline/compile.ts | **stub** | compile.ts; sizingBasisBps from philosophyProfile | execution_quality | safety_critical | Reads philosophyProfile risk_appetite; real Groq deferred M3 |
| REQ-PIP-007 | dispatch.paper_trade execution | packages/engine/src/handlers/dispatch.ts | **implemented** | dispatch.ts; dispatch/paper-trade.ts… | trade API end-to-end | paper_sim | execution_quality | financial |
| REQ-PIP-008 | paper_sim broker adapter | packages/adapters/src/paper-sim.ts | **implemented** | paper-sim.ts; paper-sim.test.ts | adapter unit tests | paper_sim | execution_quality | financial |
| REQ-PIP-009 | Immutable action_traces audit rows | packages/db/src/schema/ | **implemented** | action_traces schema; paper-trade writes traces | executions API; timeline route | paper_sim | compliance_posture | compliance |
| REQ-PIP-010 | verification_records pass/fail/blocked | packages/engine/src/verification/ | **implemented** | verification README; verifications API | dispatch.test.ts verification | paper_sim | compliance_posture | compliance |
| REQ-PIP-011 | Positions and ledger at fill time | packages/engine/src/dispatch/positions.ts | **implemented** | positions.ts; ledger_entries schema | dispatch.test.ts; no shorting block | paper_sim | risk_controls | financial |
| REQ-PIP-012 ⚠ | Synthetic quote source for paper loop | packages/engine/src/dispatch/quotes.ts | **implemented** | quotes.ts bounded random walk | trend.scan drift | paper_sim | execution_quality | operational |

## Numeric reference architecture (8)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-NRA-001 | numeric_values append-only store | agent-docs/architecture/number-handling.md §2 | **implemented** | packages/db/src/schema/numeric.ts; packages/engine/src/calc/store.ts | calc.test.ts record | all | operator_transparency, risk_controls | safety_critical |
| REQ-NRA-002 | calc_operations audit log | agent-docs/architecture/number-handling.md §4 | **implemented** | calc_operations schema; calc/evaluate.ts | calc.test.ts audit rows | all | operator_transparency | safety_critical |
| REQ-NRA-003 | Calculator evaluate with unit algebra | packages/engine/src/calc/ | **implemented** | evaluate.ts; units.ts… | 17 calc unit tests | all | risk_controls | safety_critical |
| REQ-NRA-004 | Leak linter on model outputs | packages/engine/src/calc/leak-lint.ts | **implemented** | leak-lint.ts; packages/llm/src/call.ts step 5 | leak lint unit tests | all | compliance_posture | safety_critical |
| REQ-NRA-005 | Injectable clock authority | packages/engine/src/clock.ts | **implemented** | clock.ts; createSystemClock… | handler tests frozen clock | all | compliance_posture | safety_critical |
| REQ-NRA-006 | Market calendar session service | packages/engine/src/calendar/calendar.ts | **implemented** | calendar.ts; session-constraint-catalog.json | gates.ts sessionPhase | paper_sim, alpaca | compliance_posture | safety_critical |
| REQ-NRA-007 ⚠ | Math module UI k/v browser + lineage | agent-docs/product/product-spec.md §3 Math | **stub** | values API; RightPanel Values tab | ui-spec flow 7 | paper_sim | operator_transparency | financial |
| REQ-NRA-008 | LLM numeric substitution pass before provider call | agent-docs/architecture/llm-pipeline.md §3 | **deferred** | llm-pipeline.md step 2; call.ts expects pre-substituted input | M2 NRA integration gate | platform | risk_controls | safety_critical |

## LLM stack (M2+) (8)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-LLM-001 | callSchema provider wrapper | packages/llm/src/call.ts | **stub** | call.ts implemented but no production job invokes it | requires API keys + M2 jobs | platform | risk_controls | safety_critical |
| REQ-LLM-002 | Claude strategic research_synthesize | agent-docs/architecture/llm-pipeline.md §6 | **deferred** | llm-pipeline tier table | M2 G2 gate | platform | research_quality | safety_critical |
| REQ-LLM-003 | Mistral tactical orchestration + trend_emit | agent-docs/architecture/llm-pipeline.md §6 | **deferred** | master-build-plan M2 | M2 research module | platform | strategy_outcome | safety_critical |
| REQ-LLM-004 | Groq execution compile tier | agent-docs/architecture/llm-pipeline.md §1 | **deferred** | master-build-plan M3 | M3 trading loop | paper_sim | execution_quality | safety_critical |
| REQ-LLM-005 | llm_calls ledger persistence + leak audit evidence | agent-docs/architecture/data-model.md | **partial** | llm_calls schema; `writeLlmCall` via invoke; GET llm-calls + `/llm-calls/audit` aggregate (metadata + artifact re-scan); TopDrawer `llm-leak-audit` badge | M2 admission; G2/G3 ledger evidence | platform | operator_transparency | financial |
| REQ-LLM-006 | llm_budgets consumption + admission | packages/contracts/src/operating-budget.ts | **stub** | llm-budgets API read; llm_budgets table | M2 budget-queued UI | platform | risk_controls | financial |
| REQ-LLM-007 | Budget-queued jobs visible on canvas | agent-docs/architecture/llm-pipeline.md §4 | **partial** | canvas route counts `BUDGET_QUEUED_ERROR` pending separately; status `budget held · N`; `budgetQueuedJobs` on projection; ModuleNode warn styling | M2 UI surfacing | platform | operator_transparency | operational |
| REQ-LLM-008 | escalate_to_strategic Claude delegation | agent-docs/architecture/llm-pipeline.md §6 | **deferred** | llm-pipeline.md Claude policy | M2 orchestration | platform | research_quality, risk_controls | safety_critical |

## Brokers & live data (7)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-BRK-001 | Alpaca adapter (paper then live) | agent-docs/architecture/broker-integration.md §2 | **deferred** | broker.ts Venue enum; env ALPACA_* placeholders | M4 G4 gate; Playwright flow 4 | alpaca | execution_quality | safety_critical |
| REQ-BRK-002 | Kalshi prediction markets adapter | agent-docs/architecture/broker-integration.md §2 | **deferred** | master-build-plan M5 | M5 G5 gate | kalshi | strategy_outcome | safety_critical |
| REQ-BRK-003 | Polymarket CLOB adapter | agent-docs/architecture/broker-integration.md §2 | **deferred** | OQ-5 key custody; M5/M6 plan | M6 capacity | polymarket | compliance_posture | safety_critical |
| REQ-BRK-004 | Coinbase Advanced crypto adapter | agent-docs/architecture/broker-integration.md §2 | **deferred** | master-build-plan M6 | post-launch evaluation | coinbase | execution_quality | safety_critical |
| REQ-BRK-005 | Broker connect UX + encrypted credentials | agent-docs/architecture/broker-integration.md §3 | **deferred** | broker_connections schema only | M4 connect flow | alpaca, kalshi | compliance_posture | safety_critical |
| REQ-BRK-006 | Live gate checklist before live mode | agent-docs/architecture/broker-integration.md §4 | **deferred** | ModeSwitch popover; master-build-plan M5 §3 | Playwright flow 6 | alpaca | compliance_posture, risk_controls | safety_critical |
| REQ-BRK-007 | Live Alpaca market data feeds in data modules | agent-docs/product/product-spec.md §3 Data | **deferred** | live_api module type; quotes.ts synthetic only | M3 trend module fixtures | alpaca | execution_quality | operational |

## Billing (M4) (4)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-BIL-001 | Stripe one-click credit packs | agent-docs/product/product-spec.md §6 | **deferred** | credit_ledger schema; STRIPE_* env vars | Playwright flow 2 | platform | operator_transparency | financial |
| REQ-BIL-002 | Clerk Billing subscription tiers | agent-docs/product/product-spec.md §6 | **deferred** | subscriptions table; OQ-4 pricing | M4 gate | platform | compliance_posture | operational |
| REQ-BIL-003 | Platform credits seed paper companies | agent-docs/product/product-spec.md §4 | **deferred** | platform_credits schema | paper seed purchase | platform | risk_controls | financial |
| REQ-BIL-004 | LLM usage metering debits credits | agent-docs/architecture/data-model.md | **deferred** | credit_ledger reason llm_usage | M2+M4 billing | platform | operator_transparency | financial |

## Assistant (6)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-AST-001 | M1 deterministic regex intent routing | apps/web/app/api/companies/[companyId]/assistant/route.ts | **implemented** | assistant/route.ts; packages/contracts/src/assistant.ts | company-workspace assistant | paper_sim | operator_transparency | operational |
| REQ-AST-002 | Six read-only lookup tools | agent-docs/product/product-spec.md §5 | **implemented** | assistant route lookup handlers | queue status + capabilities cards | paper_sim | operator_transparency | operational |
| REQ-AST-003 | 20 user messages/min/company rate limit | agent-docs/architecture/data-model.md Assistant | **implemented** | assistant POST admission | rate limit unit behavior | platform | risk_controls | operational |
| REQ-AST-004 ⚠ | Append-only assistant_messages persistence | packages/db/migrations/0007_left_firestar.sql | **implemented** | assistant_messages schema; reload persistence test | company-workspace reload history | platform | compliance_posture | compliance |
| REQ-AST-005 | Mistral conversational assistant chat | agent-docs/product/product-spec.md §5 Target | **deferred** | master-build-plan M2 | M2+ chat | platform | operator_transparency | operational |
| REQ-AST-006 | Write tools + assistant_edits audit (M4) | agent-docs/architecture/llm-pipeline.md §7 | **deferred** | assistant_edits schema; Playwright flow 5 | proposal cards | platform | compliance_posture, risk_controls | safety_critical |

## Research & galaxy (M2) (10)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-RES-001 | Galaxy 3D concept graph (react-force-graph-3d) | agent-docs/ui-ux/ui-spec.md §6 | **partial** | MVP GalaxyView + TD-09; D-040 nested nests / topic focus / tag layer specified | M2 G2 gate | platform | research_quality | informational |
| REQ-RES-002 | Obsidian zip export per library | agent-docs/product/product-spec.md §3 | **partial** | Library zip export route + D-040 topic notes (`exportObsidianTopicNotes`); Playwright research-library | export download | platform | research_quality | operational |
| REQ-RES-003 | concept_links typed galaxy edges | agent-docs/architecture/data-model.md | **partial** | Graph API returns typed links; GalaxyView renders edges; full curation UI still thin | M2 graph API | platform | research_quality | operational |
| REQ-RES-004 | Library curation UI + management | agent-docs/ui-ux/ui-spec.md §4 LEFT | **partial** | Left panel bulk admit/reject + library filters; deeper library CRUD still open | M2 research tab | platform | research_quality | operational |
| REQ-RES-005 | pgvector concept embeddings | agent-docs/architecture/data-model.md | **deferred** | embedding column nullable phase-gated | M2+ search | platform | research_quality | informational |
| REQ-RES-006 | Scoped web research (Brave optional) | agent-docs/product/product-spec.md §3 Research | **partial** | D-039 research bus Brave/SEC/market-news; credentialed soak remaining | M2 autonomous research | platform | research_quality | compliance |
| REQ-RES-007 | Topics as agent organizations + left-panel nav | agent-docs/ui-ux/research-galaxy-topic-view-design.md | **partial** | D-040; migration `0022` + APIs + left topics + overlay select | M2 research overlay | platform | research_quality | operational |
| REQ-RES-008 | Hard nested library galaxy + topic focus (dim+path) | agent-docs/ui-ux/ui-spec.md §6 | **partial** | D-040 GalaxyView nest clamp + dim/path + include-neighbors; IronBee/Playwright overlay | M2 G2 | platform | research_quality | informational |
| REQ-RES-009 | Hybrid topic Article tab (synopsis + concept sections) | agent-docs/ui-ux/research-galaxy-topic-view-design.md §5 | **partial** | Article tab + synopsis PATCH + `[[wikilink]]` resolve + leak lint | M2 research overlay | platform | research_quality | operational |
| REQ-RES-010 | Concept/topic query + reference telemetry | agent-docs/architecture/data-model.md | **partial** | D-040 columns + bump on topic GET / graph optional | M2+ librarian ranking | platform | research_quality | operational |

## Seed catalogs (8)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-CAT-001 | Vendored v1 JSON catalogs in-repo | packages/db/src/seed/catalogs/ | **implemented** | 9 catalog JSON files; catalogs/README.md | D-015 independence | platform | research_quality | operational |
| REQ-CAT-002 | seed-catalogs.ts upsert script | packages/db/src/seed/seed-catalogs.ts | **implemented** | seed-catalogs.ts | pnpm db seed catalogs | platform | operator_transparency | operational |
| REQ-CAT-003 | catalog_entries generic store | packages/db/src/schema/research.ts | **implemented** | catalog_entries table; 97 entries per data-model | GET /api/catalogs/:catalog | platform | research_quality | operational |
| REQ-CAT-004 | Strategy families catalog consumption | packages/db/src/seed/catalogs/seeded-strategy-catalog.json | **implemented** | research.curate reads strategy_families | curate job | paper_sim | strategy_outcome | operational |
| REQ-CAT-005 | Guardrail + recovery package catalogs | packages/db/src/seed/catalogs/guardrail-recovery-package-catalog.json | **implemented** | catalog seeded; pipeline gates reference versions | gates policy envelope | paper_sim | risk_controls, compliance_posture | safety_critical |
| REQ-CAT-006 | Session constraint catalog for legality | packages/db/src/seed/catalogs/session-constraint-catalog.json | **implemented** | calendar.ts; session-constraint-catalog.json | gates session checks | paper_sim, alpaca | compliance_posture | safety_critical |
| REQ-CAT-007 | Broker policy envelope catalog | packages/db/src/seed/catalogs/broker-policy-envelope-catalog.json | **implemented** | promote.ts POLICY_ENVELOPE_VERSION | paper_balanced_general_v1 | paper_sim | risk_controls | safety_critical |
| REQ-CAT-008 | Compliance policy package catalog | packages/db/src/seed/catalogs/compliance-policy-package-catalog.json | **implemented** | catalog file seeded | compliance copy baseline | platform | compliance_posture | compliance |

## Philosophy control plane (6)

| REQ-ID | Title | Source | Status | Evidence | philosophy_axes | safety_class | Notes |
|---|---|---|---|---|---|---|---|
| REQ-PHIL-001 | PhilosophyProfile contract (10 axes) | packages/contracts/src/philosophy.ts | **implemented** | philosophy.ts; PHILOSOPHY_AXIS_CATALOG | risk, concentration, horizon, execution_urgency, regime, recovery, capital, compliance, evidence_bar, research_breadth | safety_critical | Maps to LeverSetting band mode |
| REQ-PHIL-002 | philosophyProfile column on companies | packages/db/src/schema/companies.ts | **implemented** | companies.philosophy_profile jsonb default | compliance | safety_critical | Seeded DEFAULT on create |
| REQ-PHIL-003 | Top drawer Philosophy axis sliders UI | apps/web/components/shell/TopDrawer.tsx | **implemented** | TopDrawer Philosophy tab; PATCH company | risk, horizon, aggression | operational | Saves profile + prompt together |
| REQ-PHIL-004 | promote reads philosophyProfile → lever state | packages/engine/src/handlers/promote.ts | **implemented** | resolvePhilosophyControl in promote spine | risk, regime, exit_discipline | safety_critical | Deterministic placeholder tier labeled |
| REQ-PHIL-005 | compile sizing from risk_appetite axis | packages/engine/src/pipeline/compile.ts | **implemented** | sizingBasisBps; philosophySizingBasisBps | risk | safety_critical | LAST model stage boundary preserved (stub Groq) |
| REQ-PHIL-006 | Full S_axis alignment scoring on bands | agent-docs/testing/intent-alignment-scoring.md §2 | **deferred** | M3 lever resolver + chooseLeverSettings | all taxonomy axes | safety_critical | Profile maps bands; scoring automation unwired |

## Safety & compliance (8)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-SAF-001 | Model-free dispatch and verification | AGENTS.md Safety invariants | **implemented** | dispatch handlers; no llm in engine dispatch | architecture review | all | compliance_posture | safety_critical |
| REQ-SAF-002 | Guardrail packages immutable at runtime | AGENTS.md | **implemented** | seeded guardrail catalogs; training_feedback mutation_class | contract tests | all | risk_controls | safety_critical |
| REQ-SAF-003 ⚠ | enforceScopeStrict fail-closed levers | agent-docs/architecture/llm-pipeline.md §2 | **deferred** | v1 carryover spec; M3 port target | M3 ≥294 tests claim | all | risk_controls | safety_critical |
| REQ-SAF-004 | No guaranteed-returns language in product | agent-docs/product/product-spec.md §8 | **implemented** | compliance-policy catalog; ui copy review | copy audit | platform | compliance_posture | compliance |
| REQ-SAF-005 | Entitlement truthfulness on data feeds | agent-docs/product/product-spec.md §8 | **deferred** | live_api config spec; no live feeds yet | M3 feed labels | alpaca | compliance_posture | compliance |
| REQ-SAF-006 | Session legality matrix enforcement | packages/engine/src/pipeline/gates.ts | **implemented** | gates.ts sessionPhase; session catalog | pipeline.test.ts session block | paper_sim | compliance_posture | safety_critical |
| REQ-SAF-007 ⚠ | Paper/live engine parity (one engine) | AGENTS.md | **implemented** | paper_sim adapter; mode field on traces | architecture review | paper_sim, alpaca | risk_controls | safety_critical |
| REQ-SAF-008 | Trace retention 90d hot / 1y archive | agent-docs/product/product-spec.md §8 | **deferred** | data-model retention note; M6 jobs | M6 retention jobs | platform | compliance_posture | compliance |

## Testing & verification (8)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-TST-001 | Contracts package vitest suite | packages/contracts/src/contracts.test.ts | **implemented** | contracts.test.ts 39 cases | pnpm test contracts | platform | operator_transparency | operational |
| REQ-TST-002 | Engine pipeline + dispatch + calc tests | packages/engine/src/ | **implemented** | pipeline.test.ts; philosophy.test.ts; dispatch.test.ts; calc.test.ts | 39 engine test cases | paper_sim | risk_controls | safety_critical |
| REQ-TST-003 | paper-sim + broker adapter tests | packages/adapters/src/ | **implemented** | paper-sim, Alpaca mapping, and resolver tests: 18 cases | pnpm test adapters | paper_sim, alpaca | execution_quality | financial |
| REQ-TST-004 | companies.spec.ts Playwright | apps/web/e2e/companies.spec.ts | **implemented** | companies.spec.ts | template form | platform | operator_transparency | operational |
| REQ-TST-005 | company-workspace.spec.ts Playwright | apps/web/e2e/company-workspace.spec.ts | **implemented** | company-workspace.spec.ts; collapses info panel before Save setup; type-scoped trading node under generated titles | canvas/panels/assistant | paper_sim | operator_transparency | operational |
| REQ-TST-006 ⚠ | Clerk sign-up E2E (flow 1 full) | agent-docs/ui-ux/ui-spec.md §7 flow 1 | **deferred** | ui-spec: M1 subset auth-bypass only | Clerk test account needed | platform | compliance_posture | operational |
| REQ-TST-007 | Deterministic synthetic pipeline flow 3 Playwright | agent-docs/ui-ux/ui-spec.md §7 flow 3 | **implemented** | paper-intent-alignment.spec.ts: 3 companies, trend→promote→compile→dispatch→right panel | min/typical/max risk cohort + blocked short | paper_sim | execution_quality, strategy_outcome, risk_controls | safety_critical |
| REQ-TST-008 | Math lineage flow 7 Playwright | agent-docs/ui-ux/ui-spec.md §7 flow 7 | **deferred** | ui-spec Not yet covered | k/v browser lineage click | paper_sim | operator_transparency | financial |

## M3+ deferred utilities (6)

| REQ-ID | Title | Source | Status | Evidence | Scenarios | Venues | Axes | Safety |
|---|---|---|---|---|---|---|---|---|
| REQ-DEF-001 | Fund router ledger transfers + approval inbox | agent-docs/product/product-spec.md §3 Fund router | **partial** | `fund-route-walker.ts` + propose API (`commit` optional); `fundTransferRowsFromProposals`; fund_transfers schema; approval inbox UI | M3 fund model v1 | paper_sim | risk_controls | financial |
| REQ-DEF-002 | Simulator parallel paper runs + comparison UI | agent-docs/product/product-spec.md §3 Simulator | **deferred** | simulation_runs schema; M4 gate | M4 simulator module | paper_sim | strategy_outcome | operational |
| REQ-DEF-003 | Analyzer emit modes + research terminal (D-091) | architecture/engine-motherboard-io-design.md; product-spec §3 Analyzer | **implemented** | packages/contracts/src/modules.ts AnalyzerModuleConfig; analyzer-concat handler; ENGINE templates | to_desk_stream/to_library on research ENGINE; verify_loopback loopback | paper_sim | execution_quality, research_quality | operational |
| REQ-DEF-004 | Module generator conversational create | agent-docs/product/product-spec.md §3 | **deferred** | generator module type | M4+ assistant tools | platform | operator_transparency | operational |
| REQ-DEF-005 | Training feedback bounded band retunes | agent-docs/architecture/system-architecture.md §4 | **deferred** | training_feedback schema | M3+ training loop | paper_sim | strategy_outcome, risk_controls | safety_critical |
| REQ-DEF-006 | Dedicated queue worker (OQ-2 escalation) | agent-docs/architecture/job-orchestration.md §4 | **deferred** | OQ-2 open question | M5 latency measurement | platform | execution_quality | operational |

## Notes column (⚠ rows)

- **REQ-FND-002**: E2E uses DEV_AUTH_BYPASS; Clerk sign-up flow not Playwright-covered (doc-drift vs ui-spec flow 1).
- **REQ-CMP-007**: Live switch UI present; live dispatch deferred (REQ-BRK-006).
- **REQ-MDL-004**: Topology only — no ledger transfers (REQ-DEF-001).
- **REQ-MDL-005**: Transfer execution deferred M3+.
- **REQ-MDL-011**: Envelope binding UI/runtime enforcement partial; full policy activation M3.
- **REQ-CNV-006**: Full 2× growth card with mini-log not shipped; inline setup covers subset.
- **REQ-SHL-007**: Keys stored; not yet wired into live LLM job path (M2).
- **REQ-API-014**: Simulator module deferred M4.
- **REQ-PIP-001**: Honest placeholder until M2 Claude synthesis.
- **REQ-PIP-003**: Model tiers replaced by deterministic placeholders; schema-ready for M2/M3.
- **REQ-PIP-005**: Deterministic placeholder; Mistral tree_expand deferred M3.
- **REQ-PIP-006**: Reads `philosophyProfile.risk_appetite` for sizing; real Groq deferred M3.
- **REQ-PHIL-006**: Automated S_axis scoring deferred until M3 lever resolver.
- **REQ-PIP-012**: Replaced by Alpaca live_api feeds in M3 (REQ-DEF-006).
- **REQ-NRA-007**: API exists; full lineage graph UI deferred M3 (flow 7 not Playwright-covered).
- **REQ-AST-004**: Retention/erasure policy unresolved OQ-10.
- **REQ-SAF-003**: doc-drift: master-build-plan cites ≥294 v1 tests; current engine+contracts ~57 vitest cases only.
- **REQ-SAF-007**: Live adapter path not built; parity design only.
- **REQ-TST-006**: doc-drift: flow 1 claimed in spec table but explicitly marked not Clerk-covered.
- **REQ-TST-007**: Current deterministic synthetic spine is E2E-covered; real model-bearing and live-data variants remain deferred to M2/M3.

## Machine-readable export

Full row payloads (all evidence paths, optional notes): [`requirements-matrix.json`](./requirements-matrix.json)
