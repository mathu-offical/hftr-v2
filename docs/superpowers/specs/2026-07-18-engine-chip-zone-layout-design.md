# Engine chip zone layout (snapping)

**Status:** Approved 2026-07-18  
**Decision follow-up:** D-064 / D-066 / D-091 (layout lanes + Time bus)  
**Related:** `agent-docs/ui-ux/canvas-layout-and-dedicated-math-design.md`, `engine-motherboard-io-design.md`

## Goal

Treat each ENGINE group as a **complex chip** whose members snap into process stages for hardened, clean viewing. Zones are **layout snap targets** (not required painted chrome).

## Zone model

### Horizontal process stages (left → right; unused compress)

| Zone | Module types | Notes |
|------|--------------|-------|
| Research | `research`, `librarian` | Intake / curation |
| Data | `library`, `live_api` | Structures between research and trend; `library` on process row, `live_api` stacked under |
| Trend | `trend` | Sense-making center |
| Execution | `trading`, `simulator`, `generator` | Flexible N desks |
| Verification | `analyzer`, `policy`, `display` | Terminal verify / policy |

### Vertical bands (below process)

| Band | Module types | Notes |
|------|--------------|-------|
| Funds shelf | `holding_fund`, `fund_router` | Below max process/Math envelope; L→R capital flow |
| Clock bus | engine `time` hub(s) | Bottom-left under full envelope (funds included) |

Dedicated Math docks remain under their owners (D-033). Company `clock` / hub `math` stay outside engine membership.

## Placement rules

1. Process column from **chip zone**, not free topology.
2. Within a zone: `MODULE_LANE_ROW`, then connection-aware barycenter, then id.
3. Process row 0 of each occupied stage shares the same top Y (stepped alignment).
4. Funds excluded from process ranks; placed on funds shelf after process + Math.
5. Time excluded from process ranks; pinned after funds via `placeEngineTimeHubPosition`.
6. No mandatory visual dividers; Reflow / insert / page heal apply this.

## Non-goals

- Stage-label chrome / hard vertical separators (optional later)
- Changing motherboard utility handle geometry
- Redesigning module card chrome

## Acceptance

- Day-trading reflow: research left of library left of trend left of trading left of analyzer/policy.
- `live_api` same data column as library, below library.
- `holding_fund` / `fund_router` Y below trend/trading process envelopes.
- Time hub Y below funds shelf when funds present.
- Contract tests cover zone ordering + funds/clock bands.
