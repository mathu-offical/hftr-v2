# DATA tab · shared Libraries dock · Data Explorer (D-121)

Living design for left-panel Data sources, first-class Libraries chrome, hydrator-bound
`live_api` canvas nodes, and the center Data Explorer overlay.

| Field | Value |
|---|---|
| Status | approved (design) |
| Decision | D-121 (logged) |
| Related | D-049, D-081, D-095, D-103, D-112; ui-spec §4; `research-source-registry.ts` |
| Owns | Left `LeftPanel` chrome, DATA tab list, Libraries dock placement, Data Explorer overlay, `live_api` config identity |
| Does not own | Research Galaxy nest layout (stays Research); Market posture hub refresh policy |

## 1. Intent

Operators need one place to **see every live data source they can use**, place canvas nodes
that honestly represent those hydrators, and **browse / filter / search** both live-source
samples and **all company library contents** in human-readable form (semantic markdown or
JSON). Libraries are a **first-class left-panel function**, not a Research-tab accessory.

Galaxy remains Research-owned: it traces topics and connections across libraries, live
ingress, and posture — it **references** libraries; it does not host the Libraries dock.

## 2. Left panel chrome

### Tabs (unchanged)

`Research` | `Market posture` | `Data`

### Shared Libraries dock (first-class)

- Anchored at the **bottom of the left panel**, below the active tab’s scroll column.
- Same expand / collapse → Libraries card behavior; persist `librariesDockOpen` with existing
  left-panel localStorage (`hftr:{companyId}:panel:left`).
- Visible on **all three tabs** — not gated on Research.
- Contents:
  - Existing shelves: System curated (runtime) · Runtime (user/engine) · Baseline seeded
  - New **Company** section: company library modules / company knowledge stores previously
    listed as primary rows on the DATA tab (`type === 'library'` canvas modules and/or
    operator company libraries as classified today).
- Create / export / curation controls move with the dock (single copy; not duplicated into
  Research scroll).

### Per-tab scroll columns

| Tab | Scroll column |
|---|---|
| Research | Topics, entity search, agent activity, archive, modules & tools — **no** Libraries dock ownership |
| Market posture | Existing posture rail |
| Data | **LIVE DATA SOURCES** inventory (+ create / place-on-canvas); not the primary home for company library module lists |

Research entity search and galaxy nest clicks may still focus libraries in the galaxy; that
does not make Research the dock owner.

## 3. LIVE DATA SOURCES + hydrator-bound canvas nodes

### DATA tab primary list

Inventory of **all** hydrators available to the operator:

- Source: `RESEARCH_SOURCE_REGISTRY` plus broker/paper feed surfaces used as live ingress
  (same readiness model as D-103 / `selectReadySourceKinds`).
- Each row: display name, domain, auth mode, readiness (**ready** / **need key** / **public** /
  **stub** / **researched**), feed class, optional freshness when known.
- Row select → open **Data Explorer** for that hydrator.
- Entitled rows expose **Place on canvas** → create `live_api` module bound to that hydrator.

### Canvas `live_api` = hydrator identity

- `LiveApiModuleConfig` gains required **`sourceKind`** (registry hydrator id).
- Venue / instruments / poll / feedClass remain **parameters of that hydrator** where applicable.
- Node chip, label, and function name derive from the hydrator descriptor (not generic
  “Live API” + loose venue alone).
- Palette / New source: pick hydrator first; fail closed if not entitled (need key → settings
  hint; never invent readiness).
- Legacy `venue`-only modules: map venue → default hydrator when unambiguous; otherwise mark
  incomplete until the operator selects a hydrator (text-first incomplete chip).

### What DATA no longer lists as primary

Company `library` canvas modules appear under dock **Company**, not as the main DATA list.

## 4. Data Explorer center overlay

### Shell

- Same floating canvas overlay pattern as Market posture / Galaxy (`absolute` over canvas).
- Opens when:
  - DATA tab selects a live source, or
  - Libraries dock selects a library / page / company library target from **any** tab.
- Mutual exclusion of primary overlays: Research Galaxy **or** Market posture **or** Data
  Explorer — one at a time. Opening Explorer closes Galaxy/Posture overlays; opening Research
  or Posture closes Explorer (same bridge pattern as today).
- Close (×) clears Explorer selection; does not force left panel closed unless product later
  adopts posture/research close-workspace parity (default: leave left panel open).

### Target types

| Target | Browse content |
|---|---|
| Live hydrator | Cached **metadata** (existence, readiness, domain, feed class, docs); lazy **Search** / **Browse current** → service **widget cards** (title, summary, feed/authority, external ref). Stub / missing key → honest empty + code |
| Library (any shelf) | Pages / concepts — default **semantic markdown**; toggle **JSON** for sealed/raw shapes |
| Company library module | Same library viewer scoped to that module’s store |

### Chrome

- Title = hydrator or library name · readiness / scope chips
- Live hydrator: **Search this service** + **Browse current** (domain default query) → widget list
- Library targets: **Search** over titles + bodies · **Filter** (kind, admission, freshness, domain)
- View toggle **Markdown | JSON**
- Navigable list/tree + detail pane (read-only browse; no freeform query language in this slice)

### Honesty / secrets

- No invented live marks or fabricated sample series.
- Never show plaintext keys or ciphertext — `keyHint` / need-key only (D-027 / D-074).

## 5. Selection matrix

| Action | Left panel | Overlay | Galaxy |
|---|---|---|---|
| Open Research tab | Research scroll + shared dock | Galaxy (existing) | On |
| Open Market posture tab | Posture rail + shared dock | Market posture overlay | Off |
| Open Data tab | Live sources + shared dock | Data Explorer shell opens (empty until a live source or dock target is selected; restores last target in-session if any) | Off |
| Dock: select library / page | Dock highlight | Data Explorer (md/JSON browse) | Unchanged unless Research already open with nest focus from prior action |
| Dock: select library while Research + Galaxy open | Dock highlight | Prefer Data Explorer for **content browse**; Galaxy nest focus remains available via Research topic/entity actions (trace), not as the primary library reader |
| DATA: select live source | Row highlight | Data Explorer hydrator view | Off |
| Place hydrator on canvas | — | — | Creates `live_api` with `sourceKind` |
| Galaxy nest click (Research) | May highlight linked topic | Galaxy + floating inspector (trace) | On — references libraries; does not replace Data Explorer as library content browser |

**Rule of thumb:** Galaxy = **trace connections**; Data Explorer = **read contents**.

## 6. Architecture (units)

| Unit | Responsibility | Depends on |
|---|---|---|
| `LeftPanel` layout | Tab scroll + shared Libraries dock chrome | localStorage panel state |
| Live sources list | Render registry + readiness | contracts registry, research/broker credential readiness API projection |
| `LibrariesDock` | Shelves + Company section + create/export | existing `ResearchLibraryShelves` / `LibrariesSection` (relocated) |
| `DataViewContext` | Explorer open/target/search/filter/viewMode | company id |
| `DataExplorerOverlay` | Browse UI | context + library/concept APIs + hydrator sample endpoint (or honest stub) |
| `LiveApiModuleConfig` | `sourceKind` + params | `packages/contracts` |

Prefer extracting dock + explorer into focused components rather than growing `LeftPanel.tsx`
further.

## 7. API / contracts (implementation slice)

- Extend `LiveApiModuleConfig` with `sourceKind` (Zod); update labels / incomplete chips.
- **Inventory GET** `…/live-data-sources`: existence + readiness metadata only (no live
  payloads). Client SWR cache (`live-data-sources-cache.ts`: 5m fresh / 30m stale,
  sessionStorage) + shell warm prefetch.
- **Lazy query POST** `…/live-data-sources/[kind]/query`: `{ mode: search|browse, query,
  maxResults }` → widgets via `gatherEvidencePackages` (secrets at call time; no DB write;
  no invented bars). Contracts: `LiveDataSourceQueryRequest/Response`, `LiveDataSourceWidget`.
- Library browse: reuse existing library/concept GET routes; Explorer is a UI consumer.

## 8. Docs to update (same change as code)

- `agent-docs/ui-ux/ui-spec.md` §4 LEFT
- `agent-docs/ui-ux/research-tab-shelves-inspector-design.md` — dock ownership → left panel
- `agent-docs/dev-intent/decisions-log.md` — D-120
- `agent-docs/product/product-spec.md` — data modules / live_api hydrator identity (brief)

## 9. Out of scope (this slice)

- Freeform SQL / provider-native query language
- Live websocket streaming UI
- Moving Galaxy off Research
- Changing Market posture hub live/static policy (D-112)

## 10. Verification

- Unit/contract: `LiveApiModuleConfig` with `sourceKind`; readiness enum exhaustiveness
- Browser (IronBee): Libraries dock visible on Research, Posture, and Data; collapse/expand
  persists; DATA lists live sources; select source → Explorer; select library in dock →
  Explorer md/JSON; Research still opens Galaxy; overlays mutually exclusive
- Console: no Application errors; no secret leakage in Explorer network responses
