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
  milestone) → **LLM connection chip** (`LlmRibbonStatusChip`: `llm: n/6` from shell
  `LlmConnectionStatusProvider`, refreshed on settings save — not re-fetched per panel) →
  queue chip → **User settings** modal (`UserSettingsLauncher`: tabs **LLM
  providers** | **Research** | **Brokers** — six LLM providers + Anthropic ZDR attestation,
  research gather keys, Alpaca paper Key ID + Secret via **Save & verify** — D-027) → Clerk
  user button. TopDrawer LLM/operating tab: **trading capital caps** (virtual / broker buying
  power / effective min when bound, else paper sim), provider budgets + **provider health**
  chips (same shell connection status; last failure from recent calls when operating tab
  loads), company `llm_policy` with tier
  model cost/privacy labels from `MODEL_CAPABILITY_REGISTRY`, broker bind + feed entitlement,
  recent `llm_calls` metadata (request id truncated, retention class — no prompts/outputs).
  User settings modal chrome is **fixed height** (`min(36rem, 90vh)`) with a scrollable tab panel only — short tabs do not shrink the dialog. User settings: per-provider **Verify** status badge + **Save & verify** (`POST …/verify` before persist — fail-closed; Anthropic format-ok deferred ping). Opening Settings **auto-probes saved keys** (concurrency 3) so badges reflect live connectivity; humanized failure copy for `decrypt_failed` / `auth_rejected` / timeouts. Research gather keys use the same Save & verify gate. Alpaca paper / Kalshi demo: **Save & verify** rolls back credentials if handshake fails.
  (`POST /api/settings/keys/:provider/verify` accepts draft `apiKey` or saved decrypt);
  Alpaca paper: paste API Key ID + Secret Key, one **Save & verify** action (no OAuth);

  capability readout + bound company id after handshake.
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

- Modules as nodes, laid out left→right by **type lane** (D-066 / `MODULE_COLUMN`): research +
  librarian | data (libraries, live APIs; Math tools dock under owners) | trend + holding fund |
  execution (trading, simulator, generator, fund router) | verification/control (analyzer, policy,
  display). Unused lanes compress on Reflow; peers stack on multiple rows within a lane
  (`MODULE_LANE_ROW` + barycenter). Create/insert defaults use the same lane layout as Reflow.
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
- **Trend item ports (D-077):** under Trend cards, `TrendListChrome` lists
  `trend_candidates` (candidate + promoted, capped by `maxActiveTrends`). Each row exposes
  `directive-out__trend:{candidateId}`; connecting to a trading module persists
  `trading_module_id` / `engine_instance_id` on the candidate (binding topology; compile wiring
  follow-up). Binding edges render dashed directive strokes from the item handle.
- **Labeled ports + stream pins (D-056 / D-057 / D-075 / D-088):** each allowed `LinkKind`
  exposes a free **bus** handle (new links) plus one **stream** handle per existing peer
  dependency (`{kind}-{in|out}__{peerId}`), labeled by **info type / role** (Market feed,
  Trade directive, Calc ref, Now, Duration — not `← Peer` / `→ Peer`). Math: top Calc-ref /
  fund streams. Owner cards attach dedicated Math on the **bottom** as a single **Calc ref**
  pin (`math → owner` `data_feed`). Edges attach to stream pins; kind color + dash pattern.
  Validation remains `LinkKind` + `LINK_RULES`. Trend-item handles use the same parse path
  with synthetic peer `trend:{uuid}`.
- **Master Clock + Time (D-088 / D-091):** company singleton `clock` (auto-seeded) and repeatable
  `time` processors under Tools in the module store. Tool-family chrome; Clock/Time cannot
  join ENGINE membership. Port roles: Now / Duration / Schedule. **D-091:** engines receive
  clock authority via motherboard `clock` utility bind (bottom rail); direct `clock→member`
  module edges deprecated on reflow for new engines.
- **Node families (D-056 / D-068 / D-073 / D-088):** cards distinguish **Data source** (`library` shelves /
  book-spine silhouette; `live_api` aperture + signal bars — dashed border), **Agent** (solid +
  left bar), **Vault** / fund (`holding_fund`, `fund_router` — vault door, rivets, dial chrome;
  double border), **Tool** (Math, Clock, Time), **Control** (policy). Silhouette structure strokes are
  low-contrast background wash. Subtype chips show library class, venue,
  trading subtype, etc. Engine groups use **category-colored** washes/stripes from template
  category. Shape chrome is decorative; text-first family labels remain authoritative.
  Stream peers and engine-template Math `fund_route` links order by capital-flow / pipeline lane.
- **Density (D-057 / D-088):** module cards ~220×168 layout floor (was 220×240); Math tools
  180×40; tighter ModuleNode/context/trend padding; engine padding and gutters; React Flow
  `minZoom=0.15` so full engines fit in view.
- **Names (compact Fn · Focus):** auto-derived as `{moduleFunctionLabel} · {focusToken}` plus
  muted connection refs (`←`/`→` neighbor Fn codes, capped) until the operator customizes;
  inspector offers **Restore generated name**. Focus prefers topic/sector; unset shows `—`.
  Seeded/palette bases use the short function lexicon (D-023 refined).
- **Inspector:** always available when a node is selected (including incomplete setup). Owns
  rename/restore, status, delete, and type-specific advanced controls. **Supersedes D-024 §(c)**
  expand-selected-node / suppress-inspector-while-incomplete for setup UX.
- **Deferred:** old “expanded info view” (node grows ~2× with live mini-log) — replaced by
  fixed dashboard + inspector; deep jump to owning side panel remains a later affordance.
- Minimap + zoom controls bottom-right; fit-view on load; LOD: below zoom threshold, node bodies
  simplify to icon+status dot (perf + readability).
- Empty state: company template picker rendered as ghost-nodes.
- **Module / engine store (D-023, engines D-028, D-088):** two floating launcher buttons (top-left) —
  **+ Modules** and **+ Engines** — open the same store on the matching tab. Modules are
  category-grouped singles (Math / Clock / Time under Tools). Engines are insertable
  end-to-end templates from `ENGINE_TEMPLATES` → persisted `engine_instances`; engines are
  browsed and inserted from this store only. Company creation auto-seeds Math hub + Master Clock.
- **Canvas settings (top-right):** floating **Canvas settings** menu hosts **Reflow canvas**
  (connection-safe layout) and **Clear canvas…** (confirm modal → cascade-delete every engine
  group and delete every remaining module/Math tool/link). Clear is disabled when the graph is
  empty; Escape / backdrop dismisses the confirm while not busy.
- **Company create (D-043):** viewport-bounded dialog (`fixed` overlay, `h-full` within
  padded inset, body scroll locked). Sticky header + footer actions; middle column is
  `min-h-0 flex-1` with **no outer page scroll**.   Identity row (name / seed aligned, philosophy
  full-width) stays expanded until the operator clicks **Confirm**; then it **condenses to a
  one-line summary** (Edit re-expands). **Sector focus** sits on the same row as philosophy as a
  searchable combobox (`SECTOR_FOCUS_PRESETS`, max 12; type to filter, Enter / click to add)
  and **pre-seeds** engine / topic-scoped module `topicSectors` (also persisted on
  `companies.sector_focuses` and applied server-side when engine setup omits topics).
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
Decisions + traces, with an all/per-module selector), `RightPanel` (Verify | Executions |
Ledger — with open positions — | Sims | Values). Full slide-over behavior with deep-link
routes remains the target below.

**Panel tab chrome:** shared `PanelTabs` — mono uppercase rail labels, hairline base,
accent underline on the active tab (financial-terminal, not pill chips). Short rail
labels use `aria-label` / `title` for full product names (e.g. Research → Research +
Libraries). Nested category strips (Market posture) use `density="compact"`.

**Keyboard + persistence (shipped 2026-07-17, D-022):** `[` toggles left, `]` toggles right,
`` ` `` toggles bottom; `Esc` collapses the active panel (bottom defers when `TraceTimeline`
is open). Per-company `localStorage` keys `hftr:{companyId}:panel:{left|bottom|right}` restore
open state, active tab, and bottom module filter on return visits. Shortcuts are suppressed in
editable fields.

### LEFT — Research + Libraries + Market posture + Data
- Tabs: **Research + Libraries** | **Market posture** | **Data sources** (D-081).
- Research + Libraries tab (**D-040**, **D-047**, **D-049**): **Submit new topic** at top; **entity
  search** with Topics / Concepts / Tags / Libraries toggles; expandable **library shelves**
  as folders of pages — system/runtime shelves plus one **Baseline seeded** shelf with
  inline catalog folders (strategy / guardrails / session / broker / trend leads /
  **sector knowledge** per D-076) and optional **tier** / **sector** subfolders; caret
  expands page leaves; Overview opens Seeded trading mechanisms; **Pages** list (topics)
  with linked-page highlight;
  **Archive** (D-047); collapsed Modules & tools. Opening Research + Libraries opens the Galaxy overlay
  only — detail lives in a right floating inspector over the galaxy (no Galaxy|Page tab strip).
  Library shell lists use client SWR cache (D-063) so shelf chrome returns from
  memory/session while page indexes lazy-load. Design:
  `ui-ux/research-tab-shelves-inspector-design.md`.
- **Market posture** tab (D-081 / D-085): live operating hub. Left rail lists company-wide
  persisted categories (positions, watchlists, trends, plans). Opening the tab opens a
  **galaxy-style canvas overlay dashboard** with: equity chart (company series; accent path
  follows selected holding mark), sector top movers, report navigation buttons (open sealed
  report concepts in Research + Libraries), detailed holdings cards with **presiding engine
  chips**, and continuation/exit stubs. Hover justification (D-083) where wired.
  Distinct from Research + Libraries (async corpus). Hub data uses client **SWR cache**
  (`market-hub-cache` + `useMarketHub`): memory + sessionStorage, 15s fresh / 10m stale,
  inflight dedupe, shell warm-prefetch so tab/overlay navigation stays seamless.
  Visible surfaces poll on the fresh cadence; **Refresh** enqueues `library.system_movers`
  then force-revalidates. Non-flat `trend.scan` and admitted `trend.promote` also enqueue
  movers revalidation.
- Research concept inspector titles and TraceTimeline stage rows also use Justification hover
  (D-083) with honest source-class labels (model vs deterministic vs system seal).
- Research overlay (main content, layered over canvas): **Galaxy** surface with optional
  right **inspector** (Page / Concept / Library / Tag — D-049). Overlay and inspector are
  viewport-bounded (`overflow-hidden` / `min-h-0`) with scrollable inspector body and
  horizontally scrollable library chips. Shared chrome: search, tag chips, library scope,
  zoom, clear-focus. Nest hull labels and chips use short library names (head segment
  before arrow chains). Default galaxy mode is **3D physics** (TD-09); 2D is WebGL/toggle
  fallback with the same spring physics in plane.
- Research module cards (D-039): **admission mode** select (auto-admit vs require approval),
  manual query / Curate now / company sweep, multi-poll **run status** (phase · evidence ·
  concepts · validation · admission applied), **validation gate scores** after a run, and an
  evidence list. On terminal run phase, evidence + concepts + galaxy reload.
- Libraries: curation filters (all / proposed / accepted / …) plus **Approve all proposed** /
  **Reject all proposed** bulk actions when any concepts are proposed.
- Galaxy: click concept → floating inspector (not a bottom drawer). Highlighted node gets
  ring + fly-to; focus dims non-members. Inspector shows text-first **library admission**,
  **evidence ref**, **research run** provenance, **usage**, **confidence**, Verify / Delete.
  Bodies render via `ResearchMarkdown` with optional `[[sys:…]]` chips (D-047).
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

## 6. Galaxy + Article research view (signature feature, D-040)

Full design: `ui-ux/research-galaxy-topic-view-design.md`.

### Objects
- **Topics** — research-**module** directives / work programs (agent-created or seeded). They
  organize focus and can spawn multiple articles or libraries; they are **not** galaxy nodes
  and are distinct from library-side concepts/tags/trends/functions. **D-045** / **D-086**
  seed program topic **Seeded trading mechanisms** plus catalog/tier child directives (when a
  research module exists) so Pages lists high-granularity module-side work programs; concepts
  stay in the mechanisms library (and other seeded nests) so galaxy/Article have baseline
  catalog content without a research run.
- **Galaxy nodes** — concepts (primary) and tags (secondary / color / filter). Typed
  `concept_links` remain edges. **D-045** materializes compile-time catalog targets into
  company concepts + library nests on create/ensure so galaxy is never empty of baseline
  mechanisms.
- **Libraries** — soft 3D nest clusters inside the company galaxy (stable when scope shrinks).

### Galaxy tab
- `react-force-graph-3d` + `d3-force-3d` (**canonical 3D physics space**, TD-09): concepts as
  nodes (size blends degree + reference-band; color = dominant tag); every `concept_links`
  edge is a spring (distance/strength from qualitative weight band + relation); many-body
  charge, collision, and soft library-nest attractors. Directional particles on links
  (neural-style). 2D fallback only on WebGL failure or explicit toggle.
- **Library nests (default):** soft 3D spherical clusters per library (primary membership
  pulls/restores inside the nest) with **visible sphere outlines** (wireframe + translucent
  shell + equatorial rings). A company envelope sphere bounds the visible nests.
  Cross-library edges may span nests. Master library = company outer cloud.
- **Rotating info-tag layer** over the graph (subtle orbit of tag chips; static under
  `prefers-reduced-motion`); chips double as filters.
- **Topic focus** (left-panel select): dim non-member concepts/edges; stronger particles on
  focused paths; camera fly-to / fit members. Clear focus restores brightness without
  destroying nests.
- Filters / zoom / library multi-select re-scope visible nests and nodes; layout reorganizes
  from UI selection state (session-stable positions preferred).
- Click concept → floating inspector (body markdown, tags, libraries, provenance, usage);
  galaxy highlights / fly-to the node (no bottom drawer).
- Time scrubber (concept creation over time) remains phase-gated.

### Floating inspector (D-049)
- Right panel over the galaxy for the selected target: **Page** (agent synopsis + member
  concepts as open-in-inspector buttons), **Concept**, **Library**, or **Tag**. Left panel
  and galaxy never expand article/concept bodies inline — they navigate only.
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
  refresh (skeletons + stable row heights).
