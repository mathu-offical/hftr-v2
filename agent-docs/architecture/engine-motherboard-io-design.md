# Engine motherboard I/O design (D-091)

**Status:** implemented (contracts, migration `0037`, chrome ports, clock/funds/data_out binds,
member hydration, research terminal analyzer templates, analyzer.concat, library name sync,
cadence rail layout, canvas engine↔engine utility edges, Time hub provision, Time activation
gates)  
**Decision:** D-091  
**Related:** D-028/D-035/D-089 (ENGINE group chrome); D-088 (Master Clock + Time); D-041
(module_links graph authority); D-042 (node families); DevSpecs `engine-philosophy.spec.md`
(read-only)

## Goal

Treat each persisted ENGINE instance as a **motherboard**: member modules remain the operator-visible
pipeline, while the group chrome exposes typed **utility buses** for cross-engine I/O, company-wide
utilities (clock, funds), and control signals. Research ENGINEs terminate in a dedicated **analyzer**
step; execution ENGINEs expose a **funds** bus for capital topology.

This design supersedes ad-hoc “stacked setup strip” engine chrome (D-035 pre-D-089) and begins
deprecating direct `clock → consumer` module links in favor of engine-level clock utility binds.

## Utility buses

Buses are **not** `module_links`. They are persisted on `engine_utility_links` and rendered as
labeled handles on the ENGINE group chrome (utility rail). Contracts:
`packages/contracts/src/engines.ts` (`EngineUtilityBus`, `engineUtilityBusesForCategory`).

| Bus | Role | Typical upstream | Typical downstream |
|-----|------|------------------|------------------|
| `data_in` | Qualitative ingest from another engine or external module | peer `data_out`, optional library/live feed descriptor | engine members (research/trend ingest) |
| `data_out` | Qualitative export (policies, dumps, trend posture summaries) | terminal analyzer or trading/policy members | peer `data_in`, company libraries |
| `clock` | Temporal authority bind (orientation refs, session phase) | company singleton `clock` module | engine members via motherboard Time hub |
| `funds` | Capital envelope / fund-path topology signal | `holding_fund` + Math fund_route | execution members (trading, fund_router) |
| `system_control` | Pause/resume, cadence arm, gate snapshots | company policy / operator | engine job orchestration |

**Category exposure:**

| Template category | Buses |
|-------------------|-------|
| `research`, `trend_research` | `data_in`, `data_out`, `clock`, `system_control` |
| `day_trading`, `crypto`, `prediction`, `long_term`, `hft`, `execution` | all five including `funds` |

Stream metadata on `data_out → data_in` links uses opaque `stream_id` + qualitative
`stream_descriptor` only — no raw numbers or authoritative datetimes in descriptors (D-008/D-009).

Analyzer terminal config uses `AnalyzerModuleConfig.emitMode`:
`to_library` | `to_desk_stream` | `verify_loopback` (not a separate `research_terminal` flag).

## Auto-hydration

On engine insert (company create, module-store insert, template duplicate), the provisioner
**auto-hydrates** motherboard-attached seed nodes and utility binds via
`ensureEngineMotherboardUtilities`:

1. **Member graph** — template modules stamped with `engine_instance_id` and layout positions
   (existing D-028 behavior).
2. **Dedicated Math** — per D-033, one dedicated Math tool per Math-required owner inside the
   engine envelope (visually docked under owner, not a member row).
3. **Time hub** — one `time` member per engine with time-bearing members; `clock → time` and
   `time →` each time-bearing member (`provisionEngineTimeHub`). Activation requires Time inbound
   for `TIME_BEARING_MODULE_TYPES`.
4. **Clock utility bind** — `engine_utility_links` row: `bus=clock`, `from_module_id` → company
   Master Clock singleton, `to_engine_id` → inserted engine.
5. **Funds bind (execution only)** — `bus=funds` from company `holding_fund` when the template
   category exposes funds (idempotent; skips when no holding fund yet).
6. **Research terminal analyzer + data_out stub** — research ENGINE templates append an `analyzer`
   member; `ensureEngineAnalyzerDataOut` seeds a `data_out` utility row from that analyzer before
   the first concat run.
7. **Library naming** — auto-created or template-seeded `library` modules derive display names from
   topic/focus + inbound source combination via `deriveLibraryDisplayName` (synced on graph refresh
   when `nameCustomized` is false).

Hydration is idempotent: re-run on PATCH reflow or `restoreEngineTopic` must not duplicate utility
rows or members.

## Canvas / UI

- **Utility rail:** left target handles `engine-util-${bus}`; right source handles
  `engine-util-${bus}-out` (unique ids — no shared in/out id).
- **Engine↔engine edges:** operator can drag `data_out` → `data_in` (and Control out → Control in);
  persisted via `POST /engine-utility-links`; rendered as dashed utility edges.
- **Module→engine:** Clock → clock bus; Holding Fund/Math → funds; library/live/research → data_in.
- **Header setup (D-089):** topic/capital/exit/template inputs remain **inline bounded fields in
  the header**.

## Phases

| Phase | Deliverable | Status |
|-------|-------------|--------|
| P0 | Contracts: `EngineUtilityBus`, `EngineUtilityLink`, `engineUtilityBusesForCategory` | **done** |
| P1 | DB migration `engine_utility_links` + API CRUD (GET/POST/DELETE) | **done** |
| P2 | `EngineGroupNode` utility rail chrome + engine↔engine edges | **done** |
| P3 | Insert-time auto-hydration (clock, funds, data_out, Time hub, terminal analyzer) | **done** |
| P4 | Graph resolver: utility streams → member topic hydrate | **done** |
| P5 | Deprecate direct `clock → member`; Time activation gates | **done** |

## Research terminal analyzer

Research ENGINE internal order (immutable stage adjacency per D-042):

```
research / librarian → library → (optional live_api) → analyzer (terminal)
```

The terminal **analyzer** is not optional for research ENGINE templates shipped after D-091. It:

- Accepts `data_feed` from upstream research/library/live members inside the engine.
- Emits qualitative summaries and verification chips to `data_out` bus consumers.
- Bridges formats for downstream execution ENGINE `data_in` (policy dumps, admitted concept
  digests, trend posture descriptors).
- Does **not** call models below the research synthesis tier; loopback retune remains on trading
  ENGINE analyzers (execution path).

### AnalyzerModuleConfig emit modes

Stored in `modules.config` (Zod schema in `packages/contracts`):

| `emitMode` | Behavior |
|------------|----------|
| `to_desk_stream` | Default for research ENGINE terminal analyzer. Concatenates inbound qualitative packages and emits digest to engine `data_out` / desk stream consumers (optional `streamDescriptor`). |
| `to_library` | Admits synthesized concepts to bound library module(s); optional `targetLibraryModuleId`. Used by seed-keeper research fabrics. |
| `verify_loopback` | Default for execution ENGINE analyzers. Watches trading `verification` links; `loop_refine` signals only (no bus emit). |

`emitMode` is validated at save; illegal mode for engine role fails closed with text-first error.

## Inter-engine streams

Engines at company scope may connect **engine ↔ engine** via utility links:

```
Engine A (data_out, stream_id=S1) ──► Engine B (data_in, stream_id=S1)
```

Rules:

- `from_engine_id` required on `data_out` side; `to_engine_id` on `data_in` side.
- Exactly one of `from_engine_id` or `from_module_id` per row (company clock bind uses
  `from_module_id`).
- Multiple streams per bus pair allowed when `stream_id` differs.
- Runtime resolution merges stream descriptors into module-auto research/trend triggers (D-041
  graph resolver extended — not visual-only).
- No `fund_route` or `directive` on utility links; capital and trade directives stay on
  `module_links`.

## Data model: `engine_utility_links`

Sketch (migration `0037`; mirrors `EngineUtilityLink` contract):

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `company_id` | uuid FK | ownership scope |
| `to_engine_id` | uuid FK → engine_instances | bus attaches to this engine chrome |
| `bus` | text enum | `data_in\|data_out\|clock\|funds\|system_control` |
| `from_engine_id` | uuid FK nullable | inter-engine upstream |
| `from_module_id` | uuid FK nullable | company utility module (e.g. Master Clock) |
| `stream_id` | varchar(80) nullable | required for `data_out→data_in` pairing |
| `stream_descriptor` | varchar(200) nullable | qualitative label for UI + job logs |
| `created_at` / `updated_at` | timestamptz | |

Constraints:

- CHECK exactly one of (`from_engine_id`, `from_module_id`) is non-null.
- Unique partial index on (`to_engine_id`, `bus`, `from_engine_id`, `stream_id`) where inter-engine.
- Unique on (`to_engine_id`, `bus`, `from_module_id`) where module bind (one clock bind per engine).

API: `GET/POST/DELETE /api/companies/:companyId/engine-utility-links`.

## Canvas / UI

See `ui-ux/canvas-engine-group-design.md` §Motherboard utility rail.

- **Utility rail:** bottom edge of ENGINE chrome exposes category-allowed bus handles (labeled,
  kind-colored, `nodrag` on handles; drag on header only).
- **Motherboard-attached seeds:** Clock bind, dedicated Math docks, and terminal analyzer render
  as visually attached to the group border (not extra member grid cells).
- **Engine↔engine edges:** React Flow edges between group nodes on `data_in`/`data_out` handles;
  animated when stream has active jobs on either side.
- **Header setup (D-089):** topic/capital/exit/template inputs remain **inline bounded fields in
  the header** — not a stacked body strip.

## Phases

| Phase | Deliverable | Status |
|-------|-------------|--------|
| P0 | Contracts: `EngineUtilityBus`, `EngineUtilityLink`, `engineUtilityBusesForCategory` | **done** |
| P1 | DB migration `engine_utility_links` + API CRUD | **done** |
| P2 | `EngineGroupNode` utility rail chrome + engine↔engine edges | **done** |
| P3 | Insert-time auto-hydration (clock bind, terminal analyzer, library names) | **done** |
| P4 | Graph resolver: utility streams → module-auto triggers | **done** |
| P5 | Deprecate direct `clock → member` on reflow for D-091+ engines | **done** |

## Non-goals

- Rewiring v1 stage adjacency inside member modules (D-042 modal layers stay fixed).
- LLM calls on dispatch, verification, or utility bus resolution (model-free below compile).
- Raw financial numbers or authoritative datetimes on bus descriptors or stream payloads.
- Fund ledger transfers via utility buses (funds bus is topology signal only until M3+).
- Pixel office / corridor metaphor on the motherboard chrome.

## Cross-links

| Topic | Doc |
|-------|-----|
| ENGINE group chrome + delete modes | `ui-ux/canvas-engine-group-design.md` |
| Node families + research spine | `architecture/engine-node-family-design.md` |
| Clock authority | `architecture/number-handling.md` §8a |
| Module link graph | `architecture/system-architecture.md`; D-041 |
| Product behavior | `product/product-spec.md` §2–3 |
| REQ coverage | `testing/requirements-matrix.md` REQ-ENG-*, REQ-DEF-003 |
