# Canvas node dashboard design (2026-07-17)

**Status:** implemented and verified (2026-07-17)  
**Decisions:** D-026, D-034 (logged in `dev-intent/decisions-log.md`)
**Supersedes (node chrome):** D-024 §(c) “expand selected node for setup / suppress inspector while incomplete”

## Goal

Make canvas modules feel like a compact, interactive dashboard:

1. **Labeled ports** — one separate, labeled connection point per link kind the node can accept or emit.
2. **Always-visible high-level fields** — editable on the node body (topic/sector, capital, target exit, status where applicable).
3. **Fixed card size** — no expand-on-select / no in-node “expanded info” shell. “Static” means fixed geometry, not read-only.
4. **Inspector on click** — selecting the card chrome opens the right-side inspector with full/secondary settings.
5. **Function-specific names** — auto-derived from type + connections until the operator customizes; restore-default available while editing.
6. **Inline validation** — missing fields show Required chips and warn borders; confirmed fields use neutral borders and subtle green checks inside the corresponding control, not a detached banner.

## Non-goals

- New connection contracts beyond `LinkKind` (data_feed, directive, verification, fund_route) —
  role-specific **labels** and visual buses are presentation-only (D-056); validation stays on
  `LinkKind` + `LINK_RULES`.
- Expanding the node into a large live-detail card on click (old ui-spec “expanded info view”).
- Editing advanced type configs (scan cadence, display kind, paper trade form, etc.) on the node body.

## Port model (Approach A)

### Registry

Each `ModuleType` declares allowed **inbound** and **outbound** ports as subsets of `LinkKind`, derived from `LINK_RULES` (union of kinds where this type is target / source).

| Direction | Handle role | Placement |
|-----------|-------------|-----------|
| Inbound kinds | `target` | Left stack, top→bottom |
| Outbound kinds | `source` | Right stack, top→bottom |

Handle ids: `{kind}-in` / `{kind}-out` (e.g. `data_feed-in`, `fund_route-out`).

Visible label next to each handle (text-first; color reinforces). Default kind labels:

| LinkKind | Default label | Edge bus |
|----------|---------------|----------|
| `data_feed` | Data feed | Solid |
| `directive` | Directive | Dashed |
| `verification` | Verification | Dotted |
| `fund_route` | Fund route | Long dash; square handles |

**D-056:** each type may show a **role label** describing the nature of data on that bus
(e.g. library → Corpus out, live_api → Market feed, trend → Trade directive). A vertical
colored rail on the node edge groups inbound/outbound kinds as separate visual buses.
Math: top data bus + horizontal fund bus.

**D-068:** fund cards render as **vault** silhouettes; `library` as **shelf/book**
chrome; `live_api` as a **feed aperture** with signal bars (`FamilyShapeChrome`). Family chip
for capital modules reads **Vault**.

**D-057:** in addition to one free **bus** handle per kind, each existing peer dependency
gets its own **stream** handle (`{kind}-{dir}__{peerId}`) labeled with the peer Fn
(`← Library`, `→ DayTrade`). Edges persist on stream pins so overlapping data_feed links
no longer share a single connection point.

Only ports the type can actually use are rendered (empty side = no handles on that side).

### Connection validation

- Drag must land on a matching opposite-direction handle of the **same** `LinkKind`.
- `allowedLinkKinds(from, to)` still gates whether that kind is legal between the two module types.
- Legacy edges that used `data-in` / `data-out` / `control-in` / `tools-out` map on load:

| Old pair | New kind |
|----------|----------|
| data-out → data-in (fund endpoints) | `fund_route` |
| data-out → data-in | `data_feed` |
| data-out → control-in | `directive` |
| tools-out → data-in | `verification` |

Persisted `module_links.link_kind` remains authoritative; handle ids are presentation + connect UX.

### Math / special cases

- Math keeps all ports it participates in via `LINK_RULES`; no fake ports.
- Company creation seeds one Math module; D-028 allows additional repeatable Math **tools**
  (multi-attach `data_feed` to consumers, deletable, never engine members). Name defaults to
  `Deterministic Math Calculator`; not auto-rewritten from neighbors unless connections change
  and name is still “generated”.

## Node anatomy (fixed card)

```
┌─────────────────────────────────────────┐
│ ● TYPE CHIP              [status]       │
│ Function name (derived or custom)       │
│ ─────────────────────────────────────── │
│ Topic/sector   [editable]  [chip]       │  ← only if required for type
│ Capital        [editable]  [chip]       │
│ Target exit    [editable]  [chip]       │
│ Status line (text-first jobs/blocked)   │
└─────────────────────────────────────────┘
  labeled handles L/R (per allowed kinds)
```

- Card size is constant whether selected or not (selection = border/accent only).
- `nodrag` / `nowheel` on editable controls so React Flow does not steal interaction.
- Clicking empty card chrome / header selects the node and opens inspector.
- Focusing or clicking a field does not steal selection away from useful inspector context; selection may already be set; inspector remains available whenever the node is selected (including incomplete setup).

## Inline fields vs inspector

| Surface | Contents |
|---------|----------|
| **Node body** | Required setup fields for the type (`requiredModuleSetupFields`), plus compact status line. **Explicit Save setup** button commits via PATCH `{ setup: ModuleSetupInput }` (no auto-save on blur/Enter). |
| **Inspector** | Rename (blur/Enter PATCH `{ name }`), **Restore generated name** (`PATCH { restoreGeneratedName: true }`), status draft/active/paused, delete, type-specific advanced controls (trend scan, watchlist, paper trade, display config, etc.). |

**D-024 change:** incomplete nodes no longer suppress the inspector and no longer expand to host the full setup form — setup lives in the fixed body; inspector always available on select.

## Validation UI

- Each missing required field row shows its own **Required · {label}** chip immediately above or
  beside that control.
- Missing fields: warn border + warn chip on that row only.
- Complete fields return to the normal neutral field border. They do not keep a green outline or
  a confirmed-state text chip.
- Complete fields show one subtle green check chip **inside the trailing edge of the field
  boundary**:
  - topic/sector: inside the text input;
  - capital allocation: inside the numeric value input (the mode select stays normal);
  - target exit: inside the date/time input with spacing reserved for the native calendar control.
- The check is pointer-transparent and accompanied by screen-reader text
  `Confirmed: {field label}`. Inputs reserve right padding so text and native controls never
  overlap it.
- The same shared `ModuleSetupFields` treatment applies to compact canvas nodes, company creation,
  and engine setup forms; individual surfaces must not implement their own confirmed-state chrome.
- No global “Setup complete” / stacked chip strip that is detached from fields (optional single footer line OK only as secondary summary).
- Draft → active remains blocked server-side while `missingModuleSetupFields` is non-empty.

## Naming

### Compact generated label (Fn · Focus + connection refs)

While persisted `modules.name_customized` is `false` (TypeScript/API
`nameCustomized === false`):

```
primary = moduleFunctionLabel(type, config) · moduleFocusToken(topic|capital|—)
refs    = ← {neighborFn…} → {neighborFn…}   // capped 2+2 with +N; omitted if disconnected
name    = primary [ + " " + refs ]
```

Examples:

- Unconnected trading: `DayTrade · —`
- Trading with topic + trend/fund in: card line 1 `DayTrade · SPY`, muted line 2 `← Trend · Fund`
- Math: primary only (`Math · —` or `Math · DayTrade` for dedicated tools); no arrow refs

`generatedNameBase` stores the short Fn only (`DayTrade`, `Trend`, …). Neighbor refs use Fn codes,
never full neighbor display strings. Card chrome splits primary vs refs via `splitCompactModuleName`.

### Customized name

- Operator edits name in inspector → mark customized; stop auto-updates.
- **Restore generated name** recomputes from current graph (Fn · Focus + refs) and clears customized flag.
- Math: names stay generated (not operator-customizable).

### Persistence

- `modules.name` — current display string (primary + optional refs)
- `modules.generated_name_base` — short function lexicon label used to recompute
- `modules.name_customized` — controls whether connection/focus changes may regenerate `modules.name`
- Migration `0011_canvas_node_generated_names` backfills legacy `generated_name_base = name`,
  marks every row existing at migration time `name_customized = true`, then applies
  `DEFAULT false NOT NULL` for future rows. This preserves pre-D-026 operator names across graph
  edits. Because original base provenance was not stored, **Restore generated name** on a legacy
  row uses its migrated name as the base until refreshed to the Fn lexicon; new rows have full
  compact generated/custom behavior.
- API: `generatedNameBase`, `nameCustomized` on module projections; `restoreGeneratedName` on module PATCH

## Implementation sketch

| Area | Change |
|------|--------|
| `packages/contracts` | Port registry helpers from `LINK_RULES`; generated-name API fields; name derivation pure functions + tests |
| `packages/db` | Migration `0011_canvas_node_generated_names` adds `generated_name_base` and `name_customized` |
| `apps/web/.../types.ts` | Replace 4-handle `HANDLE_SPEC` with kind-labeled ports |
| `ModuleNode.tsx` | Dashboard card; always-visible fields; labeled handles; no expand |
| `CompanyCanvas.tsx` | Connection rules for new handle ids; pass neighbor names into node data; regenerate names on link CRUD; restore a client-removed edge when server DELETE fails |
| `InspectorPanel.tsx` | Restore generated name; keep advanced controls |
| `ui-spec.md` | Rewrite node anatomy + D-024 inspector/setup wording |
| e2e | Adjust skip-setup / inline-setup expectations: fields always visible; inspector not suppressed |

## Verification evidence (2026-07-17)

**Migration:** `0011_canvas_node_generated_names` applied locally after `0010` — columns
`generated_name_base`, `name_customized`; API fields `generatedNameBase`, `nameCustomized`,
`restoreGeneratedName` on module create/update projections. After the not-yet-committed migration
was hardened, the already-migrated local rows were manually aligned with its conservative
`name_customized = true` legacy backfill. Failed edge DELETE also restores the edge in client state
if React Flow removed it before the server failure.

**Automated:** `pnpm typecheck` PASS (7/7 packages); `pnpm lint` PASS (7/7); `pnpm test` PASS
(contracts 39, adapters 20, secrets 5, llm 13, engine 44; db/web no test files, exit 0).
Focused Playwright `apps/web/e2e/canvas-node-dashboard.spec.ts` **1/1** pass (~5.5s): skip setup →
missing Required chips on always-visible fields → confirmed in-field checks with neutral borders →
labeled LinkKind handles → chrome-click inspector without card geometry change → explicit **Save
setup** → rename + **Restore generated name**.

**IronBee (seeded day-trading company):** ARIA confirmed per-kind labeled handles and
always-visible setup fields; chrome-click opened inspector with exact Name label and generated
connection/base text; full-page screenshot captured; console query after final flow returned no
new error messages. Customize/restore **not** verified in IronBee (pre-migration sample blocked
that path) — covered by focused Playwright above.

`company-workspace.spec.ts` now reaches and passes the D-026/D-034 setup assertions after its
field locators were made exact. The full spec remains red later at an unrelated bottom-panel
collapse/expand assertion, so no full-spec pass is claimed.

**D-034 verified (2026-07-17):** `pnpm --filter @hftr/web exec tsc --noEmit` PASS;
`pnpm --filter @hftr/web lint` PASS; focused `canvas-node-dashboard.spec.ts` **1/1** PASS
(asserts no confirmed-state text chips, `Confirmed: {field label}` ARIA labels, and neutral
`border-[var(--color-line)]` on confirmed inputs). IronBee on seeded day-trading canvas: ARIA
exposed `Confirmed:` statuses for topic/sector, capital allocation, and target exit; cropped
node screenshot confirmed in-field checks inside topic, allocation value, and target-exit
inputs with native calendar spacing reserved; incremental console check after sequence 1427
returned no new errors. `company-workspace.spec.ts` reached and passed this D-034 assertion block
after exact-label hardening; its later bottom-panel failure is outside D-034.

## Open points resolved in this design

| Topic | Resolution |
|-------|------------|
| Port granularity | Per `LinkKind`, not per exotic role name |
| Naming | Template/auto until customize; restore in inspector |
| Static | Fixed size; fields remain editable |
| Validation | Inline with each field |
| Inspector vs incomplete | Always show inspector when selected |

## Spec self-review

- [x] No TBD placeholders for core behavior
- [x] Conflicts with D-024 §(c) called out and superseded intentionally
- [x] Scope limited to canvas node chrome + naming + port UX (not fund movement engine)
- [x] Shipped generated-name persistence fields and migration stated explicitly
