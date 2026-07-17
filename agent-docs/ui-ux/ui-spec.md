# hftr-v2 UI/UX Specification & Design Standards

## 1. Visual identity (universal standards)

- **Theme:** financial-terminal dark. Near-black blue-tinted base (`#0a0e14`-family), high-contrast
  data text, one accent per semantic state. Light mode deferred.
- **Design tokens** (`tokens.css` / Tailwind theme): color scale, spacing, radii (small, 4–8px —
  terminal, not bubbly), mono font for numbers (tabular-nums), sans for prose.
  Semantic state colors: positive/negative PnL, watch (amber), blocked (red), overnight
  (violet), paper (cyan badge), live (red badge). **Text-first status rule carried from v1:**
  every state must be readable as text; color only reinforces.
- **Icons:** Lucide, monochrome outline (v1's `hftr_symbolic_mono` mapping). No emojis.
- **Density:** Bloomberg-leaning; standardized cards for trends/leads/strategies/actions/
  guardrails; charts/tables with per-data-type defaults; modals for entity detail.
- **Hybrid playfulness (user decision):** inside canvas nodes only — small animated worker
  sprites/activity pulses reflecting real queue/job state. Panels and data surfaces stay clean.

## 2. Application shell

- **Top ribbon (L→R, implemented 2026-07-17 per DevSpecs/ui-ux.spec.md):** logo → company
  switcher dropdown (`CompanySwitcher`) → top-drawer toggle (`TopDrawer`: Ledger/PnL,
  Trading profile, Settings, Philosophy tabs) → executions ticker tape (`ExecutionTicker`,
  marquee of recent fills/blocks with amounts, pauses on hover) → paper/live master switch
  (`ModeSwitch`, live gated with an explanation popover — fails closed until the broker
  milestone) → queue chip → **User settings** modal (`UserSettingsLauncher`: six LLM
  providers + Anthropic ZDR attestation + Alpaca paper connect/verify — D-027) → Clerk
  user button. TopDrawer LLM/operating tab: **trading capital caps** (virtual / broker buying
  power / effective min when bound, else paper sim), provider budgets + **provider health**
  strip (credential configured + last failure from recent calls), company `llm_policy` with tier
  model cost/privacy labels from `MODEL_CAPABILITY_REGISTRY`, broker bind + feed entitlement,
  recent `llm_calls` metadata (request id truncated, retention class — no prompts/outputs).
  User settings: per-provider **Verify** (`POST /api/settings/keys/:provider/verify`) and
  Alpaca paper connect/verify with capability readout + bound company id.
- **Canvas-centric layout** per company beneath the ribbon: slim collapsible strips on the
  left (Research · Data), bottom (Trends · Scenarios · Watch lists · Decisions), and right
  (Verify · Executions · Ledger · Sims · Values) expand into panels; the canvas keeps the
  remaining space. The earlier "full slide-over" model is deferred; current panels are
  docked flex children so canvas context is never fully hidden.
- **Companies directory (`/companies`):** card grid with paper (cyan) / live (red) text-first
  mode badges, included engine labels, link into the company canvas, and a ⋯ menu for rename,
  duplicate (always a zero-capital paper copy of topology with non-Math modules reset to draft),
  and archive/delete (fail-closed: leaves directory, stops schedules, clears live/broker bind;
  traces kept).

## 3. Canvas (React Flow)

- Modules as nodes, laid out left→right by column: research | data (libraries, live APIs, math,
  holding fund) | trend | trading (incl. fund router) | policy. Edges = `module_links`, rendered
  as **rounded elbow** `smoothstep` paths (DevSpecs/ui-ux.spec.md §Connections), animated when
  data is flowing (projection of job activity), colored by link kind. Policy nodes (rightmost)
  bind policy envelopes to the trading modules linked into them. Company creation seeds one Math
  module (`Deterministic Math Calculator`); D-028 adds repeatable Math **tools** multi-attachable
  to consumers (see below).
- **ENGINE groups (D-028 / D-035 / `canvas-engine-group-design.md`):** insertable engine templates
  persist as `engine_instances` with a dashed React Flow **parent** chrome (`EngineGroupNode`):
  template label, **Reflow**, delete, and **full shared setup** (topic/sector, total capital
  envelope, overall exit) plus editable template inputs. Member modules are child nodes
  (`engine_instance_id`); Math is never a member. Shared setup cascades to members until
  overridden (`topic_sectors_overridden`); capital splits equally across capital-bearing
  members; exit is the same overall deadline. Inspector/module PATCH supports **Restore
  engine topic** (`restoreEngineTopic`). Delete engine: modal offers **cascade** (remove
  members + links) vs **ungroup** (keep modules, clear membership).
- **Math tools (D-028 / D-033):** additional Math modules may be created from the palette and
  deleted; each may `data_feed`-attach to allowed consumer types. Dedicated Math tools render as
  compact nodes with **data handles on top** (owner connection) and **fund handles left→right**.
  Fund routes never attach to LLM / model-bearing nodes — capital terminates at Math.
- **Edge routing (implemented D-023):** stored and newly created edges use React Flow
  `type: 'smoothstep'`; connection drag preview uses `ConnectionLineType.SmoothStep`. This yields
  rounded right-angle routing with column spacing as the primary collision control. **Not**
  arbitrary obstacle avoidance — advanced ELK/pathfinding that routes around nodes is deferred.
  Canonical intent: edges "should generally be structured to avoid nodes."
- **Node anatomy (dashboard card — design D-026 / `canvas-node-dashboard-design.md`):** fixed-size
  card (no expand-on-select). Header: type chip + function-specific name + text-first status.
  Body: always-visible editable high-level fields for that type (topic/sector, capital
  allocation, target exit where required). Missing fields have **per-field Required chips** and
  warn borders; confirmed fields have neutral borders and subtle green checks inside the trailing
  field edge. Validation stays on the corresponding control, not in a detached banner. Setup commits
  via an explicit **Save setup** button on the node (PATCH `setup`); fields are not auto-saved
  on blur/Enter. Activity / status line remains text-first. Clicking card chrome opens the
  floating inspector (full / secondary settings); interacting with inline fields does not open
  the inspector or change card geometry.
- **Labeled ports (per accepted `LinkKind`):** separate left (inbound) / right (outbound)
  handles for each link kind the module type can use (`data_feed`, `directive`, `verification`,
  `fund_route`), each with a visible text label. Connections require matching kind +
  `LINK_RULES`. (Replaces the prior four anonymous data/control/tools handles.)
- **Names:** auto-derived from function base + connected neighbors until the operator
  customizes; inspector offers **Restore generated name**. Seeded/palette bases stay
  function-specific (D-023).
- **Inspector:** always available when a node is selected (including incomplete setup). Owns
  rename/restore, status, delete, and type-specific advanced controls. **Supersedes D-024 §(c)**
  expand-selected-node / suppress-inspector-while-incomplete for setup UX.
- **Deferred:** old “expanded info view” (node grows ~2× with live mini-log) — replaced by
  fixed dashboard + inspector; deep jump to owning side panel remains a later affordance.
- Minimap + zoom controls bottom-right; fit-view on load; LOD: below zoom threshold, node bodies
  simplify to icon+status dot (perf + readability).
- Empty state: company template picker rendered as ghost-nodes.
- **Module store (D-023, engines D-028):** floating palette (top-left) with **Modules**
  (category-grouped singles with function-specific default names; Math repeatable as TOOL per
  D-028) and **Engines** (insertable end-to-end templates from `ENGINE_TEMPLATES` → persisted
  `engine_instances` group). Company creation still auto-seeds one Math module.
- **Inline setup validation (D-024, refined D-026):** company and engine template forms render
  topic/sector, trading-capital allocation (USD or percentage), and target-exit controls **per
  module**. Company create lists one setup card per seeded template module and lets operators add
  multiple extra modules/engines with the same inline fields. The USD/percent mode control is
  compact beside a usable amount input (not full-width). Missing fields have inline **Required**
  chips and warn borders; confirmed fields return to neutral borders with subtle green checks
  inside their trailing edges. Skip opens the draft graph. On the canvas, required controls are
  **always visible** on the fixed node body; the inspector is not suppressed for incomplete nodes.
- **D-026 + D-034 verified (2026-07-17):** migration `0011_canvas_node_generated_names`
  (`generated_name_base`, `name_customized`); focused Playwright `canvas-node-dashboard.spec.ts`
  (1 test: missing Required chips, confirmed in-field checks with neutral borders, labeled ports,
  fixed card geometry on chrome-click, explicit **Save setup**, rename + restore generated name).
  IronBee on the seeded day-trading company confirmed per-kind handles, always-visible fields,
  inspector Name + generated connection/base text, all three `Confirmed:` statuses, and cropped
  in-field check placement including native calendar spacing; incremental console check after
  sequence 1427 returned no new errors. Customize/restore verified in Playwright only — not in
  IronBee (pre-migration sample). `company-workspace.spec.ts` exercised the D-026/D-034 setup
  assertions successfully after exact-label hardening; its full run remains red later at the
  unrelated bottom-panel collapse/expand assertion.
- **Separate operating meter (D-024):** Company → LLM / operating shows provider credential source,
  call admission, and provider-cost counters for Anthropic/Mistral/Groq. Copy explicitly states
  that this meter is separate from module trading-capital allocation.
- **Capital caps (D-027):** same tab surfaces virtual cap, broker buying power, and effective cap
  (`min(virtual, brokerBp)` when bound; paper sim when unbound) via `GET /api/companies/:id/broker`.
- **Seeded `day_trading_starter` topology (paper-safe, D-023):** ten nodes —
  `Market Regime Research` → `Strategy Evidence Library` + `Paper Market & Runtime Feed` →
  `Market Trend Scanner` → `Paper Day-Trade Execution`, plus `Paper Seed Holding Fund` →
  `Deterministic Math Calculator` → `Deterministic Fund Router` → trading desk, with
  `Transaction Execution Monitor` and `Paper Trading Policy` verification links. Ten
  `smoothstep` edges. `trend_research_lab` seeds research → library → trend only.
- Performance rules (mandatory): memoized custom nodes/edges, nodeTypes defined at module scope,
  Zustand + `useShallow` selectors, no components subscribing to whole nodes/edges arrays.

## 4. Panels

Implemented today as docked collapsible panels (`components/panels/`): `LeftPanel`
(Research | Data sources), `BottomPanel` (Trends | Scenario engine | Watch lists |
Decisions + traces, with an all/per-module selector), `RightPanel` (Verify | Executions |
Ledger — with open positions — | Sims | Values). Full slide-over behavior with deep-link
routes remains the target below.

**Keyboard + persistence (shipped 2026-07-17, D-022):** `[` toggles left, `]` toggles right,
`` ` `` toggles bottom; `Esc` collapses the active panel (bottom defers when `TraceTimeline`
is open). Per-company `localStorage` keys `hftr:{companyId}:panel:{left|bottom|right}` restore
open state, active tab, and bottom module filter on return visits. Shortcuts are suppressed in
editable fields.

### LEFT — Research + Data + Trends
- Tabs: **Research** | **Data sources** | (contextual third tab when opened from a trend module).
- Research tab: module progress (topics tree, coverage), concept browser (search/tag filter),
  wikis/documentation view (rendered markdown), **galaxy view toggle** (full-panel 3D graph,
  see §6), library management + Obsidian export buttons.
- Data sources tab: connected live APIs with freshness/entitlement labels, create-new-source
  flow, library list with curation status.

### MIDDLE BOTTOM — Exploration + Analysis + Choice (the main control panel)
- Slides up from bottom; ~70% height default, expandable to full.
- Shows the trend→policy→decision translation dynamically: columns Trends → Directives/Policies
  → Candidate decisions → Queued instructions, with lineage lines between selected items
  (click a trade to highlight its full ancestry).
- Data structures & watchlists browser, **scoped by creation node** with a scope switcher;
  shared-structure indicators: avatar-chips of other modules currently reading/analyzing/editing
  each structure (from `watchlist_access` + active job projections).
- Approval inbox (fund requests, live-gate confirmations, assistant edits pending).

### RIGHT — Execution + Verification + Simulation results
- Ledger of all trades/results/responses: filterable table (module, venue, mode, outcome),
  immutable trace rows → trace inspector modal (full ActionTrace lineage: lead → tree →
  instruction → task → fills → verification, rendered as a vertical timeline).
- Simulation results: run groups, side-by-side comparisons (PnL/drawdown/slippage), divergence
  tags, "feed results to module" action.
- Verification dashboard: pass-rate, blocked reasons breakdown, recovery ladder activity.

## 5. Assistant surface

**M1 (shipped D-022; hardened D-023):** docked pill bottom-right of canvas → expands to a chat
column overlay. `AssistantDock` loads/sends via `GET/POST /api/companies/:companyId/assistant`.
History is append-only `assistant_messages` in Postgres (company + user scoped). Responses are
**deterministic read-only lookups** — six regex-routed intents, **no model calls**. Persisted
`tool_results` are summary cards (`tool`, `summary`, `status`); capabilities and failed lookups
render as explicit cards. Rate limit: 20 user messages/min/company. Chrome: "Read-only · no model
calls". `Esc` closes the dock. Retention/erasure policy unresolved (OQ-10).

**Later milestones:** messages may carry structured edit-proposal cards (diff-style: field,
old → new) with Confirm/Reject; applied edits link to `assistant_edits` audit entries (M4).
Mistral conversational chat lands with the research/assistant LLM budget work (M2+).

## 6. Galaxy view (MVP, signature feature)

- `react-force-graph-3d`: concepts as glowing nodes (size = degree/importance, color = dominant
  tag group), typed links, tag-cluster nebulae (cluster hulls or filament links), background
  starfield + bloom for the "galaxy" feel.
- Interactions: orbit/zoom, hover label, click → concept card (side overlay with body markdown,
  tags, linked concepts, provenance), search-focus fly-to, tag filter chips, time scrubber
  (concept creation over time) phase-gated.
- Performance ladder documented in tech-decisions TD-09; 2D fallback toggle.

## 7. Key flows (must be Playwright-covered)

**M1 coverage (shipped 2026-07-17, D-022; expanded topology D-023):** `apps/web/e2e/` runs
against a local Next dev server on port 3001 with `DEV_AUTH_BYPASS=1` and Clerk keys cleared
(`playwright.config.ts`). Fixtures archive test companies via `DELETE /api/companies/:id` on
teardown.

| Spec | What it exercises |
|---|---|
| `companies.spec.ts` | Companies directory; template choices; day-template Required chips and Skip action; card mode/engines + navigate/rename/duplicate/archive |
| `company-workspace.spec.ts` | skipped `day_trading_starter` setup → missing node chips → collapse info panel → complete trading setup inline through ValueRef route (type-scoped node under generated titles) → separate LLM/operating view → full seeded names + **10** `smoothstep` edges → panels/shortcuts/store → assistant persistence → archive cleanup |
| `canvas-node-dashboard.spec.ts` | **D-026/D-034:** skip setup → always-visible trading fields + missing Required chips → confirmed in-field checks with neutral borders → labeled LinkKind handles → chrome-click inspector without geometry change → explicit **Save setup** → rename + restore generated name |
| `service-settings.spec.ts` | user settings (six LLM providers + Brokers/Alpaca fields + verify affordance) → company operating tab (capital caps, provider health, LLM policy, broker bind, recent calls) → broker GET shape without real keys |
| `paper-intent-alignment.spec.ts` | philosophy save/reload → live gate text → three-company min/typical/max trend→promote→compile→paper dispatch → company-scoped provenance/verification → right-panel fill → unsupported short block |

**Verification status (2026-07-17, D-024 + paper-intent closeout):** migrations through
`0008` applied locally for D-024 E2E; typecheck and unit/contract tests pass for the
paper/engine packages under test; Playwright pass for `companies`, `paper-intent-alignment` ×2.
IronBee verified Philosophy drawer axes + Save philosophy and text-first **Live trading
(gated)**. Clerk test-account password remains unavailable; app-flow verification used the
existing local dev-auth bypass.

**D-026 verification (2026-07-17):** migration `0011_canvas_node_generated_names` applied
locally after `0010`; `pnpm typecheck`/`lint`/`test` pass (7/7 packages; contracts 39, adapters
20, secrets 5, llm 13, engine 44); focused Playwright `canvas-node-dashboard.spec.ts` **1/1**
pass. IronBee on seeded day-trading company: per-kind handles, always-visible fields,
chrome→inspector naming, no new console errors (customize/restore not exercised in IronBee).
`company-workspace.spec.ts` reached and passed its D-026/D-034 setup assertions after exact-label
hardening; the full spec remains red later at an unrelated bottom-panel expansion assertion.

**Not yet covered by Playwright:** Clerk sign-up (flow 1 full), credits/Stripe, real-model and
live-data variants of flow 3, broker connect (flow 4), assistant write proposals (flow 5), and
Math lineage drill-down (flow 7). The shipped deterministic synthetic flow 3 and text-first
live-gate block (flow 6) are covered. CI optional `e2e` runs the specs against service Postgres
after applying SQL migrations.

1. Sign up (Clerk) → create company via wizard → canvas renders template graph. *(M1 subset:
   auth-bypass create + canvas — not Clerk sign-up.)*
2. Buy credits (Stripe test) → seed paper company → allocations visible on trading nodes.
3. Run pipeline: trigger research module → concepts appear (left panel + galaxy) → trend module
   emits trend → lead → tree → compiled instruction → paper dispatch → trace in right panel,
   with canvas edges animating during each hop.
4. Connect Alpaca paper keys → verify handshake → switch a company to Alpaca paper → dispatch
   reaches Alpaca sandbox → reconciliation trace.
5. Assistant: "add a day-trading module linked to my main library" → proposal card → confirm →
   node appears on canvas. *(M1: read-only lookup assistant only — no proposal cards.)*
6. Live-gate attempt without passing checks → visibly blocked with text-first reasons.
7. Math module: open node → k/v browser shows live values → click a trade's quantity in the
   right-panel trace inspector → lineage graph resolves to its live-source roots and calc ops.

## 8. Accessibility & quality bar

- Keyboard: panel toggles (`[`, `]`, `` ` ``) and Esc collapse **shipped**; canvas node focus
  cycling remains open.
- All interactive elements labeled (ARIA); status conveyed in text (already the rule).
- 60fps canvas pan/zoom on a mid-tier laptop; panel animation ≤300ms; no layout shift on data
  refresh (skeletons + stable row heights).
