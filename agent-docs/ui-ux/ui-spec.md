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
  milestone) → queue chip → **User settings** modal (`UserSettingsLauncher`: encrypted
  Anthropic/Mistral/Groq API keys) → Clerk user button.
- **Canvas-centric layout** per company beneath the ribbon: slim collapsible strips on the
  left (Research · Data), bottom (Trends · Scenarios · Watch lists · Decisions), and right
  (Verify · Executions · Ledger · Sims · Values) expand into panels; the canvas keeps the
  remaining space. The earlier "full slide-over" model is deferred; current panels are
  docked flex children so canvas context is never fully hidden.

## 3. Canvas (React Flow)

- Modules as nodes, laid out left→right by column: research | data (libraries, live APIs, math,
  holding fund) | trend | trading (incl. fund router) | policy. Edges = `module_links`, rendered
  as **rounded elbow** `smoothstep` paths (DevSpecs/ui-ux.spec.md §Connections), animated when
  data is flowing (projection of job activity), colored by link kind. Policy nodes (rightmost)
  bind policy envelopes to the trading modules linked into them; the Math node is pinned in the
  data column, non-deletable, named `Deterministic Math Calculator`.
- **Edge routing (implemented D-023):** stored and newly created edges use React Flow
  `type: 'smoothstep'`; connection drag preview uses `ConnectionLineType.SmoothStep`. This yields
  rounded right-angle routing with column spacing as the primary collision control. **Not**
  arbitrary obstacle avoidance — advanced ELK/pathfinding that routes around nodes is deferred.
  Canonical intent: edges "should generally be structured to avoid nodes."
- **Node anatomy (simplified view):** icon + name + type chip, status line (text-first:
  `active · 3 jobs`, `blocked: session_legality`, `watch · 2 leads`), key metric (per type:
  concepts count / feed freshness / active trends / module PnL + allocation), activity sprite
  layer. Selected node shows connection handles + quick actions (pause, trigger, open).
- **Expanded info view:** click node → node grows into an in-canvas card (~2× size) with live
  detail of what it is doing now: current jobs, last artifacts, mini-log. Second click / "Open
  panel" jumps to the owning side panel scoped to that node. Esc collapses.
- Minimap + zoom controls bottom-right; fit-view on load; LOD: below zoom threshold, node bodies
  simplify to icon+status dot (perf + readability).
- Empty state: company template picker rendered as ghost-nodes.
- **Module store (D-023):** floating palette (top-left) with **Modules** (category-grouped singles
  with function-specific default names) and **Engines** (insertable end-to-end templates from
  `ENGINE_TEMPLATES`). Math is absent — auto-created per company.
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
| `companies.spec.ts` | Companies directory; create form exposes Blank / Day trading starter / Trend research lab templates |
| `company-workspace.spec.ts` | `day_trading_starter` create → full seeded engine node names (incl. `Deterministic Math Calculator`, holding fund, fund router, policy/analyzer) → **10** `smoothstep` edges → panel expand/collapse → keyboard `[` `]` `` ` `` → module store Modules/Engines tabs → read-only assistant (`queue status` + capabilities card + reload persistence) → archive cleanup |

**Verification status (2026-07-17, D-023):** local typecheck, lint, unit tests, production build,
and the final complete two-spec Playwright suite pass after the expanded topology landed.
Migration `0007_left_firestar` local apply is unconfirmed; IronBee DevTools unavailable — no
IronBee verification claimed.

**Not yet covered by M1 Playwright:** Clerk sign-up (flow 1 full), credits/Stripe, full pipeline
hop (flow 3), broker connect (flow 4), assistant write proposals (flow 5), live-gate block
(flow 6), Math lineage drill-down (flow 7). CI optional `e2e` job runs the M1 specs against
service Postgres after applying SQL migrations.

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
