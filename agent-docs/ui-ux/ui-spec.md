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
  switcher dropdown (`CompanySwitcher`, D-197: slim id/name/mode list cache,
  stale-while-revalidate; warmed on mount / directory hydrate; create/rename/duplicate/
  archive keep the cache coherent) → top-drawer toggle (`TopDrawer`: **Desk / PnL**,
  **Philosophy & sectors**, LLM/operating, Settings — D-115; layered overlay under the ribbon
  with dimmed backdrop, centered `w-[min(42rem,…)]`, rounded bottom edge — not full-bleed; SWR
  per-tab cache with lazy refresh on view; ribbon toggle labeled **Company profile**) → executions ticker tape (`ExecutionTicker`,
  D-206: stable `Executions · …` chrome then marquee from lightweight
  `GET …/executions/ticker`; recent fills/blocks with amounts + **paper/live capital chips** on fill dollars
  (D-167; venue honesty e.g. `paper sim`) + **sim honesty ticker labels** from
  `simulatorGapTags` (Live mark / Prior session / Impact proxy / Child drain / Funds-only —
  D-187), pauses on hover) → paper/live master switch
  (`ModeSwitch`, live gated with an explanation popover — fails closed until the broker
  milestone) → **LLM connection chip** (`LlmRibbonStatusChip`: `llm: n/6` from shell
  `LlmConnectionStatusProvider`, refreshed on settings save — not re-fetched per panel) →
  **Processing queue** button (`ProcessingQueueChip`, D-193: fixed label
  “Processing queue”; textured ribbon control opens portal modal with one column per
  `queueClass` from company `jobs/pending` + `jobs/dead`; Lineage Queue / Dead letters
  in the bottom panel stay) →
  **User settings** modal (`UserSettingsLauncher`: tabs **LLM
  providers** | **Research** | **Brokers** — six LLM providers + Anthropic ZDR attestation,
  research gather keys, Alpaca paper Key ID + Secret via **Save & verify** — D-027) → Clerk
  user button. TopDrawer **Desk / PnL**: company identity + seed, **Paper balance** /
  **Paper realized|unrealized PnL** (mode-aware labels), equity chart titled **Paper equity**
  (taller), allocation/trend charts from market-hub, positions + ledger tables (trading profile +
  ledger condensed). **Philosophy & sectors**: free-text + axes + directives above sector
  group/specific refinement and `universe_excludes` (D-106); overlaps as text-first peer hints.
  TopDrawer LLM/operating tab: **trading capital caps** (virtual paper ledger /
  **Paper|Live broker buying power** / effective min when bound, else paper sim), provider
  budgets + **provider health**
  chips (same shell connection status; last failure from recent calls when operating tab
  loads), company `llm_policy` with tier
  model cost/privacy labels from `MODEL_CAPABILITY_REGISTRY`, broker bind + feed entitlement,
  recent `llm_calls` metadata (request id truncated, retention class — no prompts/outputs).
  User settings modal chrome is **fixed height** (`min(36rem, 90vh)`) with a scrollable tab panel only — short tabs do not shrink the dialog.   User settings: per-provider **Verify** status badge + **Save & verify** (`POST …/verify` before persist — fail-closed; Anthropic format-ok deferred ping). **D-172:** existence rows (keyHint / broker summaries) and verify badges persist in a module cache across open/close; re-open does **not** wipe structures or re-probe already **Verified** / **Format ok** keys — only unknown / failed / invalidated (new material, delete, draft edit) auto-probe (concurrency 3). Soft GET merges existence without clearing warm badges. Humanized failure copy for `decrypt_failed` / `auth_rejected` / timeouts. Research gather keys use the same Save & verify gate. Alpaca paper / Kalshi demo: **Save & verify** rolls back credentials if handshake fails; broker existence cached the same way.
  (`POST /api/settings/keys/:provider/verify` accepts draft `apiKey` or saved decrypt);
  Alpaca paper: paste API Key ID + Secret Key, one **Save & verify** action (no OAuth);
  capability readout + bound company id after handshake.

  **D-196 shell-first load:** Navigating to a company shows shell chrome immediately
  (`companies/[companyId]/loading.tsx`). After identity resolves, the header (switcher,
  ticker, mode, Processing queue, settings) paints; canvas + left/right/bottom module graph
  stream behind `Suspense` with a workspace loading region. Directory (`/companies`) shows
  header + cards as soon as the company list returns; service-coverage lines stream per
  card. **D-198:** loading chrome uses indeterminate progress bars, status dots, and
  shimmer skeletons (`LoadingChrome`); ticker / RightPanel / BottomPanel show labeled
  strips until their client fetches complete (text-first; motion reinforces).
  **D-200:** Suspense fallback mounts real panel rails (empty graph) so buttons stay
  clickable while module lists stream; family layout heal is post-paint
  (`POST …/canvas/family-layout`); RightPanel fetches only when open with field-level
  updates; LeftPanel defers research shell refresh until open; LLM chip shows `llm: …`
  until ready. **D-209:** engines (+ utility buses) stream first so ENGINE envelopes
  paint ASAP; each engine header shows an `InlineLoadingStrip` until members/links
  resolve; palette insert paints a provisional shell per engine before `POST` returns.

- **Canvas-centric layout** per company beneath the ribbon: slim collapsible strips on the
  left (Research · Posture · Data), bottom (Trends · Scenarios · Watch lists · Decisions), and right
  (Verify · Executions · Ledger · Sims · Values) expand into panels; the canvas keeps the
  remaining space. The earlier "full slide-over" model is deferred; current panels are
  docked flex children so canvas context is never fully hidden.
- **Companies directory (`/companies`):** header shell includes **LLM connection chip**
  (`llm: n/6`) plus the same **User settings** launcher next to the user menu (LLM /
  Research / Brokers) so credentials are reachable before opening a company. Card grid with paper (cyan) / live (red) text-first
  mode badges, listed engine labels, **Seed $…** / **Current value $…** (tabular-nums;
  stale/unavailable text-first), and **Services bound** or **Service gaps** line from
  persisted `module_service_bindings` (D-090; required-capability gaps listed by name),
  text status `Stale` / `Unavailable` when equity projection is not fresh), link into the
  company canvas, and a ⋯ menu for rename, duplicate (always a zero-capital paper copy of
  topology with non-Math modules reset to draft), and archive/delete (fail-closed: leaves
  directory, stops schedules, clears live/broker bind; traces kept).

## 3. Canvas (React Flow)

- **Pan / navigation (D-182):** trackpad and touch pans stay inside the canvas —
  `overscroll-behavior: none` on the React Flow pane (plus wrapper `overscroll-none`)
  so horizontal swipe does not trigger browser back/forward while navigating the
  graph. OS/browser edge swipes outside page content remain browser-controlled.
- Modules as nodes, laid out left→right by **engine chip zones** (research → data →
  trend → execution → verification; funds shelf + clock bus below). See
  `canvas-layout-and-dedicated-math-design.md` and
  `docs/superpowers/specs/2026-07-18-engine-chip-zone-layout-design.md`.
  Research/librarian | data (`library` on process row, `live_api` under) | trend |
  execution (trading / simulator / generator) | verification (analyzer / policy / display).
  Unused process zones compress on Reflow; peers stack within a zone (`MODULE_LANE_ROW` +
  barycenter). Funds (`holding_fund`, `fund_router`) snap to a shelf under the process;
  engine Time hubs pin to the clock bus under the full envelope. Create/insert defaults use
  the same zone layout as Reflow.
  Edges = `module_links`, rendered
  as **rounded elbow** `smoothstep` paths (DevSpecs/ui-ux.spec.md §Connections), animated when
  data is flowing (projection of job activity), colored by link kind. Policy nodes (rightmost)
  bind policy envelopes to the trading modules linked into them. Company creation seeds one Math
  module (`Deterministic Math Calculator`); D-028 adds repeatable Math **tools** multi-attachable
  to consumers (see below).
- **ENGINE groups (D-028 / D-035 / D-089 / D-091 / `canvas-engine-group-design.md`):** insertable engine
  templates persist as `engine_instances` with a dashed React Flow **parent** chrome
  (`EngineGroupNode`): template label, **Reflow**, delete, and **full shared setup** in the
  header as bordered inline fields (topic/sector, total capital envelope, overall exit) plus
  editable template inputs and Save — **not** a stacked body setup strip (D-089). **D-091
  motherboard:** bottom **utility rail** exposes typed buses (`data_in`, `data_out`, `clock`,
  `funds`, `system_control` per template category); inter-engine `data_out→data_in` streams;
  clock bind from company Master Clock; motherboard-attached Math docks and research terminal
  analyzer. Member modules are child nodes (`engine_instance_id`);
  Math is never a member. Shared setup cascades to members until overridden
  (`topic_sectors_overridden`); capital splits equally across capital-bearing members; exit is
  the same overall deadline. Inspector/module PATCH supports **Restore engine topic**
  (`restoreEngineTopic`). Delete engine: modal offers **cascade** (remove members + links) vs
  **ungroup** (keep modules, clear membership).
- **Execution child dependencies (D-210):** each execution template declares required
  research packs and default gate/training sim ENGINEs (`engine-dependencies.ts`). On
  create, `seedEngineDecisionSnapshot` writes `decisionNodes` and
  `decisionOptionSelections` into `setup_snapshot`. Missing children on canvas show
  warn-bordered **Required** chips on the engine header and in the inspector; **Add deps**
  inserts via the same research attach and simulationBinding paths as palette create.
  Engine setup Save is not blocked when children are missing (topic/capital remain required).
  Present attached children show muted **Attached:** chips (D-213). Canvas decision cards
  are limited to `CANVAS_PRIMARY_DECISION_KINDS`; sector focus prefills `topicScope` /
  `focus` template inputs on create and insert.
- **Math tools (D-028 / D-033 / D-042):** additional Math modules may be created from the palette and
  deleted; each may `data_feed`-attach to allowed consumer types. Dedicated Math tools render as
  compact nodes with **data handles on top** (owner connection) and **fund handles left→right**.
  **Typed Math** (`company_hub`, `fund_path`, `desk_execution`, `trend_signal`, `research_metric`,
  `analyzer_reconcile`, `simulator_sandbox`, `session_calendar`) selects allowed op families via
  `config.mathType`. Fund routes never attach to LLM / model-bearing nodes — capital terminates at Math.
- **Node process detail (D-042):** module detail modal maps owned v1 process layers (observe +
  bounded tune). Stage adjacency is not rewirable; levers are shared with LLM analysis. Spec:
  `architecture/engine-node-family-design.md`. Execution ENGINE specialties share the full spine;
  research ENGINE specialties seed curator/library packs (`research_*` templates). Librarian is a
  first-class palette module type.
- **Edge routing (implemented D-023):** stored and newly created edges use React Flow
  `type: 'smoothstep'`; connection drag preview uses `ConnectionLineType.SmoothStep`. This yields
  rounded right-angle routing with column spacing as the primary collision control. **Not**
  arbitrary obstacle avoidance — advanced ELK/pathfinding that routes around nodes is deferred.
  Canonical intent: edges "should generally be structured to avoid nodes."
- **Node anatomy (dashboard card — design D-026 / `canvas-node-dashboard-design.md`, D-077):**
  fixed-size card (no expand-on-select). Header: type chip + function-specific name + text-first
  status. Body: **type-relevant interactive context** for `library` / `research` / `live_api` /
  `trend` (class + linked library, research topics + target libs, venue/instruments/feed/poll,
  trend posture + list) via `ModuleContextPanel`. Cascaded engine topic/sector is demoted to a
  secondary **Scope** / **Focus seed** control — not the primary card identity. Capital-bearing
  types still show capital / target-exit setup fields. Missing fields have **per-field Required
  chips** and warn borders; confirmed fields have neutral borders and subtle green checks inside
  the trailing field edge. Validation stays on the corresponding control, not in a detached
  banner. Setup commits via an explicit **Save setup** / type Save on the node (PATCH `setup` /
  `config`); fields are not auto-saved on blur/Enter for capital setup. Activity / status line
  remains text-first. Clicking card chrome opens the floating inspector (full / secondary
  settings); interacting with inline fields does not open the inspector or change card geometry.
- **Trading execution binding (D-122):** inspector `TradingConfigForm` exposes routing mode
  (`funds_only` default | `execute_on_service` | `both_verify`), optional dedicated paper
  service connection (or inherit company broker), and provider-ledger-as-funds toggle.
  Text-first safety copy; elevate modes call out that a connected paper service is required.
- **Trend item ports (D-077):** under Trend cards, `TrendListChrome` lists
  `trend_candidates` (candidate + promoted, capped by `maxActiveTrends`). Each row exposes
  `directive-out__trend:{candidateId}`; connecting to a trading module persists
  `trading_module_id` / `engine_instance_id` on the candidate (binding topology; compile wiring
  follow-up). Binding edges render dashed directive strokes from the item handle.
- **Labeled ports + stream pins (D-056 / D-057 / D-075 / D-088 / D-108):** each allowed `LinkKind`
  exposes a free **bus** handle (new links) plus one **stream** handle per existing peer
  dependency (`{kind}-{in|out}__{peerId}`), labeled by **info type / role** (Findings, Curation,
  Trade directive, Calc ref, Schedule, Time bus, Clock in — not `← Peer` / `→ Peer`). Ports carry
  **edge / slot / nature** (`data` | `system` | `fund` | `time`); rails and edges style by nature.
  Time hub: Schedule (top) + Time bus (right) + Authority in (left). Clock-in recipients
  (`TIME_BEARING ∪ {library, display}`) get additive bottom-left **Clock in** (never replaces
  data/system). Math: top Calc-ref / fund streams; owner Calc-ref docks bottom, right of clock_in.
  Inspector may hide unlocked **delivery** outs only. Connect validation: schedule/time_bus →
  clock_in only. Audit: `ui-ux/canvas-connection-point-audit.md`.
- **Master Clock + Time (D-088 / D-091 / D-108):** company singleton `clock` (auto-seeded) and
  engine Time hubs. Tool-family chrome; Clock cannot join ENGINE membership; Time hubs pin
  bottom-left under the member envelope. Port roles: Now / Authority in / Schedule / Time bus /
  Clock in. Engines receive clock authority via motherboard `clock` utility bind; Time → members
  land on clock_in.
- **Node families (D-056 / D-068 / D-073 / D-088 / D-110 / D-140 / D-143):** cards distinguish **Data source**
  (`library` shelves / book-spine silhouette; `live_api` aperture + signal bars — dashed border),
  **Agent** (solid + left bar) with low-contrast silhouettes for `research` / `librarian` /
  `trend` / `trading` / `analyzer`, **Vault** / fund (`holding_fund`, `fund_router` — vault door,
  rivets, dial chrome; double border), **Tool** (Math, Clock, Time — Math tools share
  `MODULE_VISUALS.math` tokens with hub Math; Calc-ref / Fund port labels), **Control** (`policy`
  shield silhouette).   **Engine Data Hub** (D-140 / D-159): first-class `libraryClass: engine_data_hub`
  per execution engine — canvas node in the research→exec gap; Library/Data views nest
  in-family libraries under the hub via `parent_hub_library_id`; hub→exec and research→exec
  I/O are **ENGINE utility** edges only (no hub `module_links`). Families stack vertically.
  Engine motherboard utility handles use **nature-colored** outward labels
  (data / time / fund / system). Subtype chips cover library class, venue, trend posture,
  analyzer emitMode, policy envelope (fund_router prefers envelope over approval mode),
  simulator/generator, holding_fund so cards in a default ENGINE read distinctly. Create-flow
  preview cards (~168×72) reuse `NodePortBuses` + `FamilyShapeChrome` + category wash and
  engine utility bus chips for insert parity. Default ENGINE spines use strict
  research→librarian→library (no research→library bypass; D-143). Shape chrome is decorative;
  text-first family labels remain authoritative. Stream peers and engine-template Math
  `fund_route` links order by capital-flow / pipeline lane.
- **Density (D-057 / D-088):** module cards ~220×168 layout floor (was 220×240); Math tools
  180×40; tighter ModuleNode/context/trend padding; engine padding and gutters; React Flow
  `minZoom=0.15` so full engines fit in view.
- **Names (compact Fn · Focus):** auto-derived as `{moduleFunctionLabel} · {focusToken}` plus
  muted connection refs (`←`/`→` neighbor Fn codes, capped) until the operator customizes;
  inspector offers **Restore generated name**. Focus prefers topic/sector; unset shows `—`.
  `moduleFunctionLabel` is **subtype-aware** (research curator, library class, trend posture,
  analyzer emit mode, live venue, time transform, trading subtype) so two nodes of the same
  ModuleType in one ENGINE get distinct default Fn tokens. Seeded/palette bases use that lexicon.
- **Inspector:** always available when a node is selected (including incomplete setup). Owns
  rename/restore, status, delete, and type-specific advanced controls. **Supersedes D-024 §(c)**
  expand-selected-node / suppress-inspector-while-incomplete for setup UX.
  **D-173 completeness:** every selectable canvas node opens an inspector —
  modules (`SchemaConfigForm` from `MODULE_CONFIG_SCHEMAS` + setup + specialized actions +
  `LeverTreeSection` for trading/trend/policy), engine groups (shared setup, template inputs,
  option-anchor list), and decision nodes (kind, catalogRef, options, selected option,
  band position). RightPanel Config
  tab is out of scope for this completeness pass.
- **Decision nodes (D-173 / D-180 / D-202):** engines provision unified `decisionNode`
  children from `buildDecisionNodesForEngine` / `buildOptionAnchorsForEngine` — one card
  per choice point with `options[]` and per-option outs (catalog refs / band positions
  only — no raw financial numbers). Owned decisions dock beside owner modules with
  intake binds (data + system). Research engines seed subtype / curiosity / admission /
  cadence / pipeline as sibling decisions. Lever bands edit in the inspector.
- **Deferred:** old “expanded info view” (node grows ~2× with live mini-log) — replaced by
  fixed dashboard + inspector; deep jump to owning side panel remains a later affordance.
- Minimap + zoom controls bottom-right; fit-view on load; LOD: below zoom threshold, node bodies
  simplify to icon+status dot (perf + readability).
- Empty state: company template picker rendered as ghost-nodes.
- **Module / engine store (D-023, engines D-028, D-088, D-176, D-204, D-211, D-215):** unified
  top-left segmented control (**Engines** first, then **Modules**). Opening either
  shows the **on-canvas inventory** for that kind; **Add new** opens the existing
  store catalog (category modules / engine templates). Inventory rows focus the
  matching canvas node. **Engines inventory** is an indented outline: execution
  desks as roots, attached research packs and linked sims nested underneath
  (parent from `researchLibraryBinding.attach_execution` /
  `simulationBinding.parentExecutionEngineId`). **Modules inventory** groups members
  under their `engine_instance_id` ENGINE (indented └ rows); modules without an
  engine land under **Company**. Engines insert from the store only.
  Company creation auto-seeds Math hub + Master Clock.
  Engine insert defaults **Cascade from company** on: topic/sectors from `sectorFocuses`,
  capital from paper seed; operator can turn off and edit manually. Skip setup still applies
  server-side company cascade defaults when the flag is on. Engine catalog is grouped into
  **Research** vs **Execution** sections (`engineCreateSection`).
- **Canvas settings (top-right):** floating **Canvas settings** menu hosts **Reflow canvas**
  (connection-safe layout) and **Clear canvas…** (confirm modal → cascade-delete every engine
  group and delete every remaining module/Math tool/link). Clear is disabled when the graph is
  empty; Escape / backdrop dismisses the confirm while not busy.
- **Company create (D-043):** viewport-bounded dialog (`fixed` overlay, `h-full` within
  padded inset, body scroll locked). Sticky header + footer actions; middle column is
  `min-h-0 flex-1` with **no outer page scroll**.   Identity row (name / seed aligned, philosophy
  full-width) stays expanded until the operator clicks **Confirm**; then it **condenses to a
  one-line summary** (Edit re-expands). **Sector groups** (D-106) sit on the same row as
  philosophy as multi-select group chips (all groups allowed; selecting a group expands to
  all group specifics into `companies.sector_focuses` and pre-seeds engine / topic-scoped
  module `topicSectors`). Refine specifics + curate `universe_excludes` in Company → Sectors.
  **Engines** uses compact **+ Research** / **+ Execution**
  store buttons that open scrollable option popovers (locked templates listed inside; Escape
  closes the store without dismissing the dialog).
  Three-pane workspace: **left** nested engine list, **center** React Flow preview
  (research left of execution; dashed research→exec bridges), **right** cascade-family
  inspector. Execution setup **cascades live** into that instance’s auto research deps.
  Optional standalone modules via dropdown. User settings modal chrome is **fixed height**
  (`min(36rem, 90vh)`) with a scrollable tab panel only.
- **Inline setup validation (D-024, refined D-026):** company and engine forms render
  topic/sector, trading-capital allocation (USD or percentage), and target-exit. Engine cards
  use shared envelope fields (cascade to members); canvas nodes keep per-module controls. The
  USD/percent mode control is compact beside a usable amount input (not full-width). Missing
  fields have inline **Required** chips and warn borders; confirmed fields return to neutral
  borders with subtle green checks inside their trailing edges. Skip opens the draft graph. On
  the canvas, required controls are **always visible** on the fixed node body; the inspector is
  not suppressed for incomplete nodes.
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
(Research + Libraries | Market posture | Data sources), `BottomPanel` (Trends | Scenario engine | Watch lists |
Policies | Decisions + traces | Lineage | Approvals | Dead letters — persistent ribbon tabs +
execution-engine scope, D-097), `RightPanel` (Verify | Executions | **Positions** | Ledger |
Sims | Values — D-125). Full slide-over behavior with deep-link
routes remains the target below.

**Panel tab chrome:** shared `PanelTabs` — mono uppercase rail labels, hairline base,
accent underline on the active tab (financial-terminal, not pill chips). Short rail
labels use `aria-label` / `title` for full product names (e.g. Research → Research +
Libraries). Nested category strips (Market posture) use `density="compact"`.

**Keyboard + persistence (shipped 2026-07-17, D-022; engine scope D-097; edge rails D-118 /
D-123 / D-185; assistant rail D-146):** `[` toggles left, `]` toggles right, `` ` `` toggles bottom; `Esc`
collapses the active surface (assistant overlay first on the right, then the main right panel;
bottom defers when `TraceTimeline` is open). **Edge toggles persist** at each panel’s window
edge while expanded. Left/right use a wider **symbol rail** (`PanelEdgeRail`, `w-12`): Lucide
icons for each tab stay visible when collapsed; clicking a symbol opens that tab; **re-clicking
the active symbol collapses the panel**; a bottom chevron show/hides the panel body. Optional
**rail actions** sit above the chevron (left **LIB**, right **AST**). **D-185 panel pairing:**
opening the left panel collapses the right; explicitly opening a right view while left is open
layers the right panel on top of the left (`z-[45]`, below AST `z-50`); any click on the left
rail/body hides the right again. Bottom keeps a slim bottom-edge hide/show strip while the tab ribbon
stays on top of the panel (D-113). Per-company `localStorage` keys
`hftr:{companyId}:panel:{left|bottom|right}` restore open state, active tab, right
`assistantOpen`, left `librariesFull` / dock flags, and bottom **execution-engine** filter
(`engineFilter`: `all` or `engine_instances.id`) on return visits. Legacy `moduleFilter` keys
are ignored. Shortcuts are suppressed in editable fields.

### LEFT — Research + Market posture + Data (+ shared Libraries dock)
- Tabs: **Research** | **Market posture** | **Data** (D-081). **Libraries** are first-class
  left-panel chrome (D-121 / D-128): **flush panel-shell footer** (square corners, `border-t`
  only — no floating elevation/inset) persists across **all three** tabs — not Research-only.
  Collapsed state is a slim single-line bar with optional single-line library preview rows.
  Left edge rail **LIB** (above collapse)
  always opens Libraries at **full panel height**; choosing Research / Posture / Data restores
  the compact dock. Dock includes System / Runtime / Baseline shelves plus **Company** (canvas
  `library` modules); create/export/curation stay in the dock. Company + create-list library
  rows are **single-line** (name + meta inline), not stacked thick cards.
- Research tab (**D-040**, **D-047**, **D-049**, **D-094**, **D-095**, **D-127**, **D-130**):
  scroll column is **topic create** + **planned/in-progress topics** + **Articles** only.
  Entity search lives in the **Galaxy** overlay chrome (concepts default). Agent activity,
  archive, and Modules & tools were removed from this column (canvas / elsewhere for module
  create). Libraries dock unchanged (D-121/D-128). Galaxy **traces** topics/connections;
  library **content browse** uses Data Explorer (D-121). Shelves design:
  `ui-ux/research-tab-shelves-inspector-design.md`. Runtime (custom) library rows expose
  librarian **Curate / Verify / Refresh** (D-127). Library research (`LIBRARY_RESEARCH`) is a
  separate queue from posture research (`POSTURE_RESEARCH`) and from execution/other LLM lanes
  (D-098).
- **Market posture** tab (D-081 / D-085 / D-092 / D-101 / **D-131** / **D-138** / **D-144** /
  **D-149** / **D-186**):
  split inventory vs day quant. **Left rail** viewing pattern:
  1. **Open positions** (primary) — holdings list with SymbolTicker
  2. **Funds** (collapsible, **collapsed by default**) — indented outline:
     company pool → root `holding_fund` → execution desks by engine; each row is
     `name` + inline amount
  Fund-router hops and research engine envelopes are **not** listed. Sync + **Day view**.
  Canvas overlay (**D-186**): two-band workspace — horizontal **stage screens**
  (capital → live → library → process → outlook → day) snap-scroll above a
  fixed bottom **Model diagram strip**. Live precedes library so API normalize feeds
  corpus/constants. Each pipeline column emits into the screen above it; clicking a
  Model node (or section group) navigates to that screen. Each stage opens with charts
  and main numeric readouts first, then a **Group nodes → numbers** trace underneath
  (active Model/hydration nodes only — no missing-key / unbound idle services; every
  strip graph node on the screen is mapped into the emission list). The bottom **Model
  strip** packs nodes into the same six columns with connection-based layout and
  **optimized viewing groups**: Live kind bundles (source→adapter→analyze), Library
  per-shelf chains **plus research ENGINE article pipelines** (live feed → gather →
  validate → synthesize → admit → articles → shelf), Process route clusters + stage
  track lanes, Capital root vs execution, Outlook/Day sequential stage columns. Routes
  stack in pipeline order; steps within a route use **transfer hops** (L→R connection
  order / semantic source→adapter→process when edges are incomplete) with handoff-sized
  gaps — no empty mid-band holes; hop badges + short edge transfer labels on the strip;
  unused screen space stays loose between columns; strip nodes use **compact chrome**
  sized to the packing grid (no clipped cards); side nodes
  sit below the route stack. Draws all within- and
  between-screen edges (plus **forward-only** group backbone flows) and stamps each
  node to its owning stage screen (cluster click uses that screen). Data-flow
  assignment: library adapters use `lib-adapter:` under Library; `providers` stage sits
  on Process; positions panel on Outlook; live analysis seeds library after score;
  research ENGINEs publish articles onto bound shelves (D-214).
  **Capital** shows root user-controlled funds only (company pool + holding funds),
  engine allocation splits, master equity, and open position mark/uPnL values.
  **Live ingest** shows active **market/news stream** APIs (bars, headlines, FX,
  crypto, macro), query/filter orientation, normalize pipeline,
  **analysis module** (organize → route → score → library seed), and
  system variables for downstream. **Search / queryable APIs** (Brave web search,
  SEC EDGAR filings) sit on **Process** as research extensions — not Live streams —
  with QUERY chrome and `web_search` / `filings` route clusters. **Library** shows scored seed intake, then
  sector/company constants → discrete
  ranges + positioning context. **Process** links market + news + library and emits
  tagged trend lists, plus query/search research chains. **Outlook** shows watched symbols/values, open positions, spark-path
  growth orientation, and committed stock/news boards (operator “board/commit” language;
  internal seal ids unchanged). **Day plan** combines upstream into
  actionable movements, actions, research topics, and daily trends.
  Analyze commits stock compound + sector news in parallel.
  Distinct from Research (async corpus).   Hub data uses client **SWR cache**
  (`market-hub-cache` + `useMarketHub`): memory + sessionStorage, 15s fresh / 10m stale for
  **full hub** cache policy (used on mount/Sync/after Analyze), inflight dedupe, shell
  warm-prefetch. Automatic refresh is **not** a full-hub poll.
  **Live vs static (D-112):** one shared ~15s interval per company hits
  `GET …/market-hub/live` (equity + position marks/sparks only) and merges into the cached
  snapshot without replacing seals/reports/charts/sources/Model; Syncing… only on manual Sync.
  Analyze pauses that live poll (shared across rail + overlay) only for the Analyze POST,
  returns `runId`, and relies on synthesis poll + one full hub reload when the run is
  terminal — UI cadence never enqueues or blocks posture jobs.
  Visible surfaces: live equity/marks refresh on the live cadence; seals/reports/charts
  stay stable until Sync or a terminal synthesis run; **Model** tracks synthesis stages live
  on the overlay.
  **Provider surfaces (D-103 / D-148):** movers compound gathers only credential-ready /
  public kinds from the operator's research keys + Alpaca paper broker
  (`selectReadySourceKinds`). Overlay **Provider status** header button opens a dropdown
  modal listing each movers-lane provider as ready / need key / contributed on last seal
  (compact ready/N count on the button). Position marks remain synthetic until live broker
  marks.
  **Source verify chips (D-155):** every posture metric board/row can show lightweight chips
  that **must say** provenance class (`api` / `library` / `system` / `setting`) plus a short
  label. Hub projects `sourceChips` on movers, news, equity, positions, and watchlists from
  seal `contributingSourceKinds`, mark feed class, ledger, and watch `sourceClass`. Live
  equity/mark deltas preserve chips (merge does not wipe them). Multi-confirm boards show
  multiple chips.
  **SymbolTicker + charts (D-109):** Symbol rows on overlay recommendations + left position
  inventory use shared `SymbolTicker` — synthetic spark, direction glyph, strength ticks + band
  word, mark/held/uPnL text. Held vs cost **ok/block spark + PnL tone always wins** when cost
  basis exists; non-held may tint strength ticks orange→lime by relevance while glyphs/ticks
  remain readable without color. Overlay pies/bars emphasize day quant / provider honesty.
  Sparks are labeled `synthetic_sim` (baseline algorithm), not broker history.
  **Analyze vs Sync (D-111 / D-120 / D-181 / D-183):** **Sync** forces full hub GET. **Analyze** (overlay)
  resolves the **current-moment** analyze slot (`overnight` → `evening` via injectable clock + XNYS
  session), creates a synthesis run, force-reseals `library.system_movers` (tactical LLM thresholds),
  `library.system_sector_news`, phase-tagged `library.system_daily_summaries` in parallel,
  then `library.posture_narrative` (waits for seal stages; book↔tape deterministic rollup).
  Scheduled slots use America/New_York `et:HH:MM` triggers that enqueue full Analyze
  (`library.market_hub_analyze`). Diversified movement triggers can also auto-Analyze.
  Overlay shows the resolved phase label after Analyze.
  Overlay **Model** is a **fixed bottom strip** (D-186) — the live synthesis hydration hub
  (D-147 / D-156 / D-160 / D-161 / D-162 / D-163 / D-165 / D-169) —
  React Flow with **screen-column grouped nodes** (capital→day frames) nesting live /
  library / capital sources, adapters, process steps, stages, and panel surfaces so the
  strip aligns with the stage screens above. Strip mode drops lane labels and caps density
  per group. Click group or child → navigate owning screen.
  Hub GET projects `modelHydration` (`processingFlows`, `processSteps`, `capitalSources`,
  `asOfIso`, `sealStamps`, `panelSurfaces`) and **`awarenessAnalysis` (D-175)** — multi-level
  linkage hybrid for the expanded Posture window: **Evidence → Links → Trends → Recommendations**
  (news/library/trend pre-linked to symbols and recommendation tiers; link bands feed compound
  rank). Model stays secondary process chrome; Posture is the primary multi-level readout.
  **Model metric emissions (D-179):** wider track/column spacing; dashed `emit` edges from
  mid-pipeline stages and process-function nodes into panel boards (movers, news, watchlists,
  charts, awareness_* levels) in addition to primary `panel` edges from `sourceStageId`.
  **Watchlist tiers (D-092):** `suggested_search` → `suggested_verified` → `watching`
  (+ `triggered` / `archived`). Overlay recommendation watch grid + bottom Watch lists
  filter chips (default: watching + suggested_verified). **Confirm** PATCHes to `watching`
  and invalidates market-hub cache.
- Research concept inspector titles and TraceTimeline stage rows also use Justification hover
  (D-083) with honest source-class labels (model vs deterministic vs system seal).
- Research overlay (main content, layered over canvas): **Galaxy** surface with optional
  right **inspector** (Page / Concept / Library / Tag — D-049). Overlay and inspector are
  viewport-bounded (`overflow-hidden` / `min-h-0`) with scrollable inspector body and
  horizontally scrollable library chips. Shared chrome: **entity search** (D-130; Topics /
  Concepts / Tags / Libraries), tag chips, library scope, zoom, clear-focus. Nest hull labels
  and chips use short library names (head segment before arrow chains). Default galaxy mode is
  **3D physics** (TD-09); 2D is WebGL/toggle fallback with the same spring physics in plane.
- Research module run controls (admission / query / curate) live on **canvas module cards**
  (D-039), not the left Research column (D-130).
- Libraries: curation filters (all / proposed / accepted / …) plus **Approve all proposed** /
  **Reject all proposed** bulk actions when any concepts are proposed.
- Galaxy: click concept → floating inspector (not a bottom drawer). Highlighted node gets
  ring + fly-to; focus dims non-members. Inspector shows text-first **library admission**,
  **evidence ref**, **research run** provenance, **usage**, **confidence**, Verify / Delete.
  Bodies render via `ResearchMarkdown` with optional `[[sys:…]]` chips (D-047).
- Data tab (D-121 / D-133): **LIVE DATA SOURCES** lists only **active** hydrators (`ready` /
  `public`) from `GET …/live-data-sources`. **Company libraries** lists canvas `library`
  modules (engine-created or manual); select opens the **shell floating inspector**. Missing-key /
  stub / researched stay out of the live list. Live API select → **Data Explorer** live
  provider view (domain form + presets + widget cards via
  `POST …/live-data-sources/[kind]/query`; crypto/FX/Alpaca bars use operator live
  previews with display fields). Complete enumerable catalogs (`frankfurter_fx` all pairs for
  base; `coingecko_crypto` markets up to full-list cap) always request the full available set
  (`completeList` / `resolveLiveDataSourceMaxResults`) — not sample truncation. Query/browse
  responses are SWR-cached client-side and TTL-cached server/provider-side (D-152); Refresh
  live force-bypasses. Canvas `live_api` uses `config.sourceKind`. Overlays mutually exclusive
  for backgrounds; inspector persists (D-133).

### MIDDLE BOTTOM — Exploration + Analysis + Choice (the main control panel)
- **Persistent ribbon (D-097 / D-113 / D-114 / D-118):** collapsed view keeps tab buttons +
  engine dropdown + chevron as a slim **bottom ribbon**. When expanded, **tabs + engine** stay
  at the **top** of the panel; a separate **bottom-edge** strip holds only the hide/show
  chevron (same screen area as the collapsed expand target); `` ` `` / Esc / edge chevron still
  toggle height. Content defaults to **~70vh** (capped at 48rem, floor adjusted for the edge
  strip) below the top chrome (D-105).
  **Multi-open panes (D-114 / D-117 / D-125):** ribbon tabs toggle independently (`aria-pressed`); several
  condensed side-by-side panes can be open at once in a **horizontally scrollable** row
  (Trends, Scenarios, Watch, **Policies**, Decisions, Lineage, Approvals,
  Dead). Pane headers show **item counts**, collapse/expand or hide independently of whole-panel
  show/hide; a sole expanded pane stretches. Closing the last open pane (or having none selected)
  **auto-collapses** the panel to the ribbon. Lists cap at 48 rows with a “showing N of M”
  footer. `openTabs` + `collapsedPanes` persist per company (legacy single `tab` migrates;
  legacy `positions` pane ids are dropped). Policies list canvas policy modules
  (envelope / notes / status). Ribbon and left/right panel tabs show count meta when > 0.
- **Engine scope (D-097):** dropdown selects `All engines` or one `engine_instances` row.
  Every tab filters durable API projections to modules whose `engine_instance_id` matches
  (trends, leads/trees, watchlists, policies, executions/decisions, lineage columns,
  approvals that touch member modules, dead letters with a member `moduleId`). Company-scoped
  rows with no module binding appear only under **All engines**.
- **Trends tab lists (D-104):** one list card per **trend module** in the selected engine
  (multiple cards when the engine has multiple trend modules). Each list shows that module's
  `trend_candidates` (candidate + promoted, capped by `maxActiveTrends`) — the same rows as
  canvas `TrendListChrome`. Empty modules still render so operators see every list slot.
- Shows the trend→policy→decision translation dynamically: columns Trends → Directives/Policies
  → Candidate decisions → Queued instructions, with lineage lines between selected items
  (click a trade to highlight its full ancestry).
- Data structures & watchlists browser, **scoped by execution engine** (creation-node membership
  via `modules.engine_instance_id`); shared-structure indicators: avatar-chips of other modules
  currently reading/analyzing/editing each structure (from `watchlist_access` + active job
  projections) remain roadmap.
- Approval inbox (fund requests, **assistant edit proposals** with Confirm/Reject, live-gate
  evidence review when checklist fails or evidence is stale — D-099). Arm/disarm stays on the
  top-bar mode switch.
- **Lineage Queue (D-099):** pending + active `jobs` from `GET …/jobs/pending` plus dead
  letters; engine-scoped like other tabs. Scenario/Lineage prefer execution `leadId`/`treeId`
  from the executions API (timeline causation walk) over symbol heuristics.

### RIGHT — Execution + Verification + Positions + Simulation results
- **Assistant (D-146 / D-150 / D-154):** right edge rail **AST** (above collapse) toggles a
  **viewport-fixed overlay** layered on top of the main RightPanel — not a tab and not an
  in-flow column. Drag the header; resize via edges/corners; geometry persists per company.
  Shell **Dock** snaps to the far-right bottom anchor (rail gutter). Selecting Verify /
  Executions / … leaves the assistant open over the underlying panel.
- **Positions (D-125 / D-129):** dedicated tab listing open holdings (market-hub live marks +
  `SymbolTicker` stability). Select a row for the inspector: held-vs-cost stability,
  automatic recovery (tree `recoveryLadder` + next model-free exit candidate from
  `GET …/positions`), lead/tree status, and recent agent executions (open `TraceTimeline`).
  Operator lifecycle: `POST …/positions/exits` runs model-free exit scan + drain.
  Executions expose `simulatorGapTags` as text-first honesty chips (Live mark / Prior
  session / Impact proxy / Child drain / Funds-only — D-187; raw tags still on the API).
  The same chip set appears on BottomPanel Decisions + Lineage execution rows and on
  TraceTimeline (D-188; testids `decisions-honesty-chips`, `lineage-honesty-chips`,
  `timeline-honesty-chips`). Chip vocabulary also covers No queue / Both-verify /
  Pre-block (D-190) and Inline fill / No venue latency / On service (D-194).
  Playwright `paper-loop`, `paper-intent-alignment`, and `paper-trade-deep` assert
  `execution-honesty-chips` (and Decisions chips in paper-loop).
  **PaperTradeForm** (inspector) previews expected quote-class honesty before submit
  (`data-testid="paper-trade-honesty-preview"`; `GET …/trade/quote-preview` — D-192),
  supports market/limit + limit $ (`paper-trade-limit-price`), and hydrates ad-hoc
  operator symbols before MarketModel resolve (D-194). RightPanel panel loads use
  25s per-fetch timeouts so hung APIs cannot leave "Fetching…" forever.
  Market posture left rail also lists open holdings for quick select (D-131); day quant
  lives on the canvas overlay, not as a position-centric navigator.
- Ledger of all trades/results/responses: filterable table (module, venue, mode, outcome),
  immutable trace rows → trace inspector modal (full ActionTrace lineage: lead → tree →
  instruction → task → fills → verification, rendered as a vertical timeline). Ledger is
  entries-only (open holdings live under Positions).
- Simulation results: run groups, side-by-side comparisons (PnL/drawdown/slippage), divergence
  tags, "feed results to module" action.
- Verification dashboard: pass-rate, blocked reasons breakdown, recovery ladder activity.

## 5. Assistant surface

**M1 (shipped D-022; hardened D-023; rail mount D-146; overlay D-150; dock D-154):** right
edge rail **AST** (above collapse, mirrors left **LIB**) opens a **viewport-fixed** chat
overlay layered above the main RightPanel — not a RightPanel tab, not an in-flow column, and
not a bottom-right FAB. `AssistantDock` is controlled by `RightPanel` (`assistantOpen`,
persisted) and portals to `document.body` (`z-50`). Drag the header; resize edges/corners;
bounds persist at `hftr:{companyId}:assistant:geometry`. Header **Dock** restores the
far-right bottom anchor (preserves current size; leaves right-rail gutter). Loads/sends via
`GET/POST /api/companies/:companyId/assistant`. History is append-only `assistant_messages` in
Postgres (company + user scoped). Responses are **deterministic read-only lookups** — six
regex-routed intents, **no model calls**. Persisted `tool_results` are summary cards (`tool`,
`summary`, `status`); capabilities and failed lookups render as explicit cards. Rate limit: 20
user messages/min/company. Chrome: "Read-only · drag · resize · dock". Selecting a main right
tab does **not** close the overlay; `Esc` / AST / × closes it (then Esc can collapse the main
panel). Retention/erasure: OQ-10 / D-030 (90d hot).

**Later milestones:** messages may carry structured edit-proposal cards (diff-style: field,
old → new) with Confirm/Reject; applied edits link to `assistant_edits` audit entries (M4).
Mistral conversational chat lands with the research/assistant LLM budget work (M2+).

## 6. Galaxy + Article research view (signature feature, D-040)

Full design: `ui-ux/research-galaxy-topic-view-design.md`.

### Objects
- **Topics** — research-**module** / research-**engine** points / work programs (agent-created
  or seeded). They organize focus and can spawn articles or libraries; they are **not** galaxy
  nodes and are distinct from library-side concepts/tags/trends/functions. **D-166:** seeded
  topics are **per research engine** (every `type === 'research'` module gets its own seed tree);
  the Research Topics list is a **flat list** with owner chips (no Program/Research-point
  kind labels). **If no research modules are on the canvas, Topics stay blank.** Seeded
  **libraries** remain company-wide; scrolling library shelves show one set when engines
  share overlap (dedupe by name+scope).
  **D-126:** company bootstrap seeds **Current awareness** (regime, macro, news/event
  readthrough) plus **Sector · {label}** research points from `sectorFocuses`, and a thin
  **Seeded trading mechanisms** library overview topic — **not** catalog class mirrors (those
  stay on the library shelf). Legacy D-096 desk-focus / catalog-directive topics prune on next
  bootstrap. Concepts remain in the mechanisms library so galaxy/Article have baseline catalog
  content without a research run.
- **Articles (D-127)** — research-module (or operator) outputs: concepts marked `hftr:article`,
  **must** save into a company library, listed in the Research **Articles** group with up to
  three display-tag chips. Distinct from topics (directives) and from catalog seed pages.
  Librarians curate runtime libraries via Curate / Verify / Refresh.
- **Galaxy nodes** — concepts (primary) and tags (secondary / color / filter). Typed
  `concept_links` remain edges. **D-045** materializes compile-time catalog targets into
  company concepts + library nests on create/ensure so galaxy is never empty of baseline
  mechanisms.
- **Libraries** — soft 3D nest clusters inside the company galaxy (stable when scope shrinks).

### Galaxy tab
- `react-force-graph-3d` + `d3-force-3d` (**canonical 3D physics space**, TD-09): concepts as
  **celestial bodies** (planet/rock/ember/comet by source class; size blends degree +
  reference-band; color = dominant tag); tag satellites as moons; article hubs as **stars**.
  Every `concept_links` edge is a spring (distance/strength from qualitative weight band +
  relation); many-body charge, collision, and soft folder-system / article-orbit forces
  (D-136 / D-139). Directional particles on links (neural-style). 2D fallback only on WebGL
  failure or explicit toggle.
- **Library nests (default):** faint library framing; folders = soft system/shelf spaces;
  **article stars** soft-orbit inside folders and act as live orbit centers for member
  concepts. **D-141:** every library-scoped `hftr:article` (plus topic membership orbits)
  appears as an article star — **no LOD cap**; library chips fully scope folders + articles.
  Graph reloads on research-cache invalidation and an 8s poll while the overlay is open so
  newly admitted articles reshape the map. Folder hulls use an octahedron wire cue. A
  company envelope sphere bounds the visible nests. Cross-library edges may span systems.
  Layout uses Fibonacci volume packing (D-116) with free-float
  semantic springs (D-136), celestial hierarchy (D-139 / D-141), orbital shelf
  bands (D-142), **client semantic springs** (D-145), **physical library bridges** (D-151),
  and **independent sphere growth** with system-seeded folder similarity placement (D-164),
  plus **looser gravity** (longer springs, stronger charge, wider packing — D-170 / D-178)
  and **hover-first nest labels**. **D-199:** library / folder / article are **peer
  membership envelopes** fitted around concepts after tag/semantic layout — not nested
  orbit packing (article-inside-folder-inside-library). Membership does not tighten springs.
- **Rotating info-tag layer** over the graph (subtle orbit of tag chips; static under
  `prefers-reduced-motion`); chips double as filters.
- **Topic focus** (left-panel select): dim non-member concepts/edges; stronger particles on
  focused paths; camera fly-to / fit members. Clear focus restores brightness without
  destroying nests.
- Filters / zoom / library multi-select re-scope visible nests and nodes; layout reorganizes
  from UI selection state (session-stable positions preferred).
- Click concept → floating inspector (body markdown, tags, libraries, provenance, usage);
  galaxy highlights / fly-to the node (no bottom drawer).
- **Hover (D-100 / D-102):** info card **anchors to the graph point** (`graph2ScreenCoords`),
  not the free cursor; re-projects while the camera moves. Payload: nest path, admission/source,
  queried/referenced, tags; links show relation · weight · similarity. Non-neighbors dim; 1-hop
  edges brighten. **Company envelope always on**; other nests stay visible with idle / dim /
  hover / selected emphasis (halo on focus). Click nest to pin; background clears. Tag orbit
  capped (16).
- Time scrubber (concept creation over time) remains phase-gated.

### Floating inspector (D-049 / D-133)
- Shell-mounted layer over canvas overlays (`ShellInspectorLayer`): **Page** (topic synopsis +
  member concepts), **Concept**, **Library**, or **Tag**. Persists across Research / Market
  posture / Data — opening inspect does **not** switch the left-tab background. Dock shelves,
  DATA company libraries, Articles, and Galaxy entity search open the same inspector.
- Left panel and galaxy never expand article/concept bodies inline — they navigate only.
- **Rich formatting (D-078 / D-080):** Page synopsis and Concept body use full
  `ResearchMarkdown` with **remark-gfm** (tables, strikethrough, task lists). Concept
  inspector omits the body's leading `#` title when chrome already shows it. Membership /
  library / tag list rows use `ResearchConceptPreview` with **prose excerpts** (tables
  skipped) so seeded GFM bodies stay readable without opening each concept.
  Folder/article nest shells stay quieter than library/topic hulls so concept nodes read
  first.
- Inline synopsis links navigate in-app (inspect concept / select related topic).
- Usage badges: queried / referenced / last queried (text-first).
- Linked pages highlighted in the left Pages list when a page is open.

### Performance
- Ladder in TD-09; prefer 3D; 2D only on WebGL fail / toggle. LOD may hide tag orbit when
  zoomed out at very large graphs.
## 7. Key flows (must be Playwright-covered)

**M1 coverage (shipped 2026-07-17, D-022; expanded topology D-023):** `apps/web/e2e/` runs
against a local Next dev server on port 3001 with `DEV_AUTH_BYPASS=1` and Clerk keys cleared
(`playwright.config.ts`). Fixtures archive test companies via `DELETE /api/companies/:id` on
teardown.

| Spec | What it exercises |
|---|---|
| `companies.spec.ts` | Companies directory; engine-centric create (≥1 gate, quick-add, remove); Required chips and Skip; card mode/engines/Seed/Current value + navigate/rename/duplicate/archive |
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
3. Run pipeline: trigger research module (manual query / Curate now / company sweep) →
   evidence list + validation → concepts appear (left panel + galaxy; auto-admit or proposed)
   → trend module promotes with admitted library refs → trading module receives lead → paper
   dispatch → fill appears in right panel Executions + Ledger, with canvas edges animating
   during each hop.
4. Connect Alpaca paper keys → verify handshake → switch a company to Alpaca paper → dispatch
   reaches Alpaca sandbox → reconciliation trace.
5. Assistant: "add a day-trading module linked to my main library" → proposal card → confirm →
   node appears on canvas. *(M1: read-only lookup assistant only — no proposal cards.)*
6. Live-gate attempt without passing checks → visibly blocked with text-first reasons.
7. Math module: open node → k/v browser shows live values → click a trade's quantity in the
   right-panel trace inspector → lineage graph resolves to its live-source roots and calc ops.
   *(Partial D-060: TraceTimeline lineage buttons open Values tab + `GET …/values/{ref}/lineage`;
   full calc-graph visualization still open.)*

## 8. Accessibility & quality bar

- Keyboard: panel toggles (`[`, `]`, `` ` ``) and Esc collapse **shipped**; canvas node focus
  cycling remains open.
- All interactive elements labeled (ARIA); status conveyed in text (already the rule).
- 60fps canvas pan/zoom on a mid-tier laptop; panel animation ≤300ms; no layout shift on data
  refresh (skeletons + stable row heights). **D-198 / D-201 / D-203:** shared
  `LoadingChrome` — **screens** use slim flat bars; **buttons / shaped controls** use
  stepped `LoadingWheel` (rail slots, chips, busy actions). No glass gradients.
