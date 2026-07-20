# Canvas ENGINE group + Math tool design (2026-07-17)

**Status:** API/DB/contracts + canvas parent groups + delete modal implemented; Math TOOL dock chrome + some IronBee passes still open  
**Decision:** D-028 (`dev-intent/decisions-log.md`)  
**Related:** D-026 node dashboard (`canvas-node-dashboard-design.md`); D-023/D-024 engine templates + setup; D-216 compound Engine Data Hub

## Goal

1. **Persisted ENGINE groups** — insertable end-to-end templates become a first-class `engine_instances` row with member modules linked by `engine_instance_id`.
2. **Master topic/sector** — one engine-level scope fans out to members unless a member overrides.
3. **Structural React Flow parent** — dashed group chrome with inline master topic editor (not a module type).
4. **Delete with intent** — operator chooses **cascade** (remove members) or **ungroup** (keep modules, drop chrome).
5. **Math as repeatable TOOL** — n8n-style multi-attach `data_feed` docks; Math is never an engine member.

## Identity model

| Entity | Role |
|--------|------|
| `engine_instances` | Persisted group: `template_id`, `label`, `master_topic_sectors`, `canvas_bounds` |
| Member `modules` | `engine_instance_id` FK; `topic_sectors_overridden` when operator edits topic on the node |
| `math` modules | **Never** `engine_instance_id`; may attach to many consumers as TOOL links |

Company creation and `POST .../engines` both insert an engine row and stamp members. Migration `0014` backfills `day_trading_starter`-shaped graphs (nine non-Math modules) into one engine instance.

## Topic cascade

```
engine_instances.master_topic_sectors
  → cascadeEngineMasterTopic (PATCH engine)
  → each member where topic_sectors_overridden = false
     AND type requires topic_sector
     AND type ≠ math
```

**Override:** module `PATCH` with `setup.topicSectors` sets `topic_sectors_overridden = true`.

**Restore:** module `PATCH` with `restoreEngineTopic: true` copies master back and clears override.

Engine group header exposes comma-separated master topic editor + **Save** → `PATCH .../engines/:id`.

## Canvas chrome (target UX)

```
┌─ Engine · category ────────── [Reflow] [Delete] ─┐
│ Day trading engine                                 │
│ [topic____] [USD|%] [cap__] [exit____] [tpl…] [Save]│
│ ┌────────────────────────────────────────────────┐ │
│ │  (member module nodes as children)             │ │
│ └────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

- React Flow **parent node** `type: engineGroup`; children use `parentId` + relative positions.
- Bounds: `computeEngineBoundsFromPositions(member positions)` + `ENGINE_GROUP_PADDING`
  (`top: 92` after D-089).
- Drag handle on group header bar (`engine-group-drag`); fields use `nodrag nowheel`.
- **D-089:** shared setup + template inputs are **bordered inline fields in the header**
  (`ModuleSetupFields` `layout="inline"`); placeholders carry labels; missing fields use warn
  borders (Required chips stay off the header row).
- Create / insert / single-engine reflow / engine drag-stop use `placeNextEngineOrigin` so envelopes do not overlap.
- **D-056:** category-colored background wash + diagonal stripe + left accent from
  `ENGINE_TEMPLATES.category` (`engineVisualForTemplate`); badge shows `Engine · {category}`.
- **D-209 progressive engine load:** envelope chrome (badge, label, ports, wash) paints
  immediately; setup fields / utility chips wait behind `hydrationPhase: 'loading'` +
  `InlineLoadingStrip` (“Engine · retrieving members”). Company route streams engines
  before modules; insert paints provisional shells then swaps to ready nodes.

**Shipped:** `EngineGroupNode.tsx`, `CanvasEngineGroup` type, non-overlapping placement helpers,
category chrome, D-089 header inline fields, D-209 hydration chrome.

## Motherboard utility rail (D-091)

ENGINE chrome exposes a **bottom utility rail** with category-scoped bus handles (contracts:
`engineUtilityBusesForCategory`). Buses are persisted on `engine_utility_links`, not `module_links`.

```
┌─ Engine · category ────────── [Reflow] [Delete] ─┐
│ Day trading engine                                 │
│ [topic____] [USD|%] [cap__] [exit____] [tpl…] [Save]│  ← D-089 header inline fields
│ ┌────────────────────────────────────────────────┐ │
│ │  (member module nodes as children)             │ │
│ └────────────────────────────────────────────────┘ │
│ [data_in] [data_out] [clock] [funds] [system_control] │  ← utility rail (category subset)
└────────────────────────────────────────────────────┘
```

- **Research / trend_research engines:** `data_in`, `data_out`, `clock`, `system_control` (no funds).
- **Execution engines:** all five buses including `funds`.
- **Motherboard-attached seed nodes:** Master Clock bind, dedicated Math docks, and research
  terminal analyzer render attached to the group border (not counted as extra member grid cells).
- **Engine↔engine edges:** optional operator binds only (D-168) — **not** auto-meshed.
  Default data path is Data Hub → execution `data_in`. Intra-engine member links unchanged.
- **Engine Data Hub (D-140 / D-159 / D-168 / D-216):** free library node in the research→exec gap,
  biased toward exec `data_in`; binds via motherboard utility (`fromModuleId=hub`). Nest
  libraries use `parent_hub_library_id` only — **no** hub `module_links`. Hub is the
  execution engine’s **compound resource surface**: virtual shelves by origin
  (`research_in` / `exec_runtime` / `sim_training` / `policy_returns`) × stream
  (`semantic` / `numeric_capital` / `system_normalized`); optional per-shelf `data_out`
  outs; live topic feed defaults on. All hub contents stamp the owning execution as source.
- **Family layout (D-159 / D-176):** research deps left → hub gap (340px) → execution right;
  families stack vertically with 140px top-level gutter. Engine right padding 168px reserves
  the option-anchor column so server collision math matches client chrome.
- **In-engine member order (D-212):** `rankEngineMembers` enforces `MODULE_LANE_ROW` as hard
  vertical bands within a column (research above librarian, library above live_api, analyzer
  above policy). Barycenter crossing reduction applies only among same-row peers; create-form
  preview and Reflow both use `layoutEngineTemplateAtOrigin` / `layoutEngineGroup`.
- **Dual research paths (D-191):** execution ENGINEs carry **two** research surfaces by design:
  - **Inline spine** — member `research` (+ librarian → library) at the execution spine start
    for **internal** desk gathering/processing inside the family (e.g. session `specialty_desk`,
    HFT `microstructure_context`). Never remove when refining child packs.
  - **Child research packs** — separate research ENGINEs from
    `EXECUTION_ENGINE_RESEARCH_DEPENDENCIES` in the left column; analyzer terminus emits enriched
    articles into the parent **Engine Data Hub** (not a second hub on the pack). Subtype overlap
    between inline and child packs is intentional.
- **Option anchors (D-173 / D-180 / D-191 / D-202 / D-207 / D-208 / D-213 / D-217):** unified **decision nodes**
  parented under the engine group. Each node is one deterministic choice point —
  a **single multi-port unit** (intakes by **info type**: data / system / clock; one out per
  **output-relevant** option), never a compound tree of option cards. Strategy families and
  branch roles are sibling decision nodes with options-as-ports. Template inputs stay in engine
  chrome / inspector. Canvas cards are limited to `CANVAS_PRIMARY_DECISION_KINDS` (output
  routing: strategy / branch / recovery / emit / feed class). Module identity (subtype, library
  class, trend posture) and tuning (curiosity, admission, cadence, query/schedule, philosophy,
  levers) stay inspector-only. Analyzer `emit_mode` options filter by `hubFeedClass` / seeded
  emit path. Column gutters clear docked decision width so cards do not overlap the next lane.
  Every engine template seeds `decisionNodes` with desk-specific strategy palettes
  (day ORB/gap/VWAP, HFT market-making, crypto trend/reversion/pairs, long-term
  trend/compression/lead-lag, prediction interim RV). Lever bands remain inspector-only.
- **Sector focus → template inputs (D-213):** company `sectorFocuses` prefill engine
  `topicScope` / `focus` template inputs on create-form seeds, palette insert, and
  auto research/sim deps (`seedTemplateInputsFromSectorFocus`). Engine chrome always
  shows all `template.inputs` fields (Topic scope / Focus) even when empty.
- **Simulation ENGINEs (D-189 / D-191 / D-216):** create section alongside Research / Execution. Linked
  children of an execution use `setup_snapshot.simulationBinding` (`pre`=gate /
  `post`=training + parentExecutionEngineId); adhoc sims are standalone paper desks.
  Execution create defaults to two child sims (overridable). **Family placement** (pre gate
  left of exec, post training after exec) is target layout under D-189/D-191 refinement.
  Default sim templates terminate with **dual analyzers** (`hubFeedClass` direct + analyzed)
  feeding the parent Engine Data Hub (write-through + live topic candidates).
- **Child dependency validation (D-210 / D-213):** execution ENGINE chrome and inspector surface
  required research packs + default sim children from `EXECUTION_ENGINE_*_DEPENDENCIES`.
  Missing children show text-first **Required** warn chips (not a hard create block when
  palette insert seeds them); present attached children show muted **Attached:** chips.
  **Add deps** reuses attach_execution / simulationBinding insert paths. Engine create
  persists `decisionNodes` + `decisionOptionSelections` via `seedEngineDecisionSnapshot`.
- **Company → engine cascade (D-176):** canvas insert defaults `cascadeFromCompany` on —
  topic from `sectorFocuses`, capital from paper seed — then engine→member cascade (D-035).
- **D-089 note:** shared setup + template inputs stay in the **header** as bordered inline fields
  (`ModuleSetupFields` `layout="inline"`); the utility rail is separate from setup chrome.
  Full engine setup + option-anchor tree also appear in the floating engine inspector (D-173).

Full design: `architecture/engine-motherboard-io-design.md`.

## Delete modal

| Mode | API | Effect |
|------|-----|--------|
| **ungroup** (default) | `DELETE` body `{ mode: 'ungroup' }` or no body | Clear `engine_instance_id` on members; delete engine row; keep modules + links |
| **cascade** | `DELETE` body `{ mode: 'cascade' }` | Delete incident links, member modules, then engine row; refresh neighbor generated names |

Modal copy must state data loss for cascade vs topology preservation for ungroup.

## Math tools (n8n-style)

- **Repeatable:** `POST .../modules` with `type: math` allowed (palette); `DELETE` allowed.
- **Multi-attach:** `LINK_RULES` adds `math→{research,library,live_api,trend,trading,simulator,analyzer,policy,generator,display}` `data_feed` edges.
- **Detection:** `mathCanAttachTo(consumer)` + `isMathToolAttachment(from, to, linkKind)`.
- **Not in group:** create/update rejects `engineInstanceId` on Math (`math_module_cannot_join_engine`).
- **Company seed:** creation still inserts one Math module; additional Math modules are optional tools.

**TOOL chrome (deferred):** consumer nodes show docked Math attachments distinct from primary `data_feed` ports — visual spec TBD; contracts + link rules are in place.

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/companies/:companyId/engines` | List engines + `memberModuleIds` |
| `POST` | `/api/companies/:companyId/engines` | Insert template → engine row + members + links |
| `GET` | `/api/companies/:companyId/engines/:engineId` | Single engine + members |
| `PATCH` | `/api/companies/:companyId/engines/:engineId` | Label, bounds, master topic (+ cascade) |
| `DELETE` | `/api/companies/:companyId/engines/:engineId` | `cascade` \| `ungroup` |

Module routes: `engineInstanceId` on create (non-Math); `restoreEngineTopic` on PATCH.

Contracts: `packages/contracts/src/engines.ts`.

## Verification checklist

- [x] Migration `0014_engine_instances` + schema/types
- [x] Contracts parse tests (`describe('engine instances (D-028)')`)
- [x] Playwright `e2e/canvas-engine-groups.spec.ts` (cascade, override, insert second engine, ungroup)
- [x] IronBee: Engine chrome + Master topic/sector visible on day-trading canvas; console checked
- [x] Engine CRUD + cascade + delete modes (API handlers)
- [x] `EngineGroupNode` component (isolated)
- [x] `CompanyCanvas` parent groups + engines API insert path
- [x] Delete modal (cascade vs ungroup) wired from group chrome
- [x] Inspector: `restoreEngineTopic` affordance for engine members
- [ ] Math TOOL dock chrome on consumer nodes
- [ ] Playwright ARCH-004 (multi-engine + cascade/override)
- [ ] IronBee: grouped layout, master topic save, delete modes, Math multi-attach
- [ ] IronBee: D-216 hub shelves / dual sim analyzers (DevTools)

## Non-goals

- Fund movement through engine groups (topology only in M1).
- Math inside engine membership.
- Obstacle-avoiding edge routing inside groups (inherits D-023 smoothstep).
