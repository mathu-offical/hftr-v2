# Canvas spacing, reflow, and dedicated Math tools (2026-07-17)

**Status:** Implemented and runtime-verified (2026-07-17); Math tools independently movable; default seeds do not double shared + dedicated Math on fund paths  
**Decision:** D-033; type-lane placement D-066 (`dev-intent/decisions-log.md`)  
**Related:** D-028 (`canvas-engine-group-design.md`); D-026 (`canvas-node-dashboard-design.md`)

## Goal

1. Give every engine and base canvas a deterministic, connection-safe default layout.
2. Provide explicit, scope-aware **Reflow** actions rather than forcing grid snapping during ordinary drag.
3. Provision one dedicated Math tool by default for every model-bearing or analytical module that requires deterministic calculations.
4. Route model data and every financial-number path through the applicable Math tool.

## Canonical Math-required types

`MATH_REQUIRED_MODULE_TYPES` is the contract-level set:

- `research`
- `trend`
- `trading`
- `simulator`
- `analyzer`
- `generator`

Other module types may attach Math tools manually, but they do not receive a dedicated tool automatically.

## Math ownership and sharing

Each Math-required module gets exactly one **dedicated default Math tool** when created through a company or engine template. The relation is explicit and persisted; it is not inferred from names, proximity, or graph connectivity.

- A Math module has one optional `tool_owner_module_id`.
- The owner and Math module must belong to the same company.
- A dedicated Math module may still attach to additional modules, preserving D-028 multi-attach behavior.
- Math remains outside `engine_instance_id` membership at the data-model level.
- Deleting an owner offers/uses deterministic cleanup for its dedicated Math tool when that tool has no remaining non-owner attachments. Shared Math tools are retained.

Existing unowned Math modules remain valid. Migration does not guess ownership. Existing engine graphs may be repaired through the scoped Reflow/provision action after explicit operator intent.

## Required links

For every dedicated owner/Math pair:

```text
owner --data_feed--> Math (attaches on Math top)
Math  --data_feed--> owner (returns from Math top)
```

The first edge carries the owner’s calculation inputs/context into the deterministic tool. The return edge carries typed calculated output back to the owner. These are topology and dispatch declarations; they do not permit raw model-generated numbers.

**Fund ports on Math:** left = fund in, right = fund out. Data ports sit on the **top** edge so owner cards connect downward into the tool lane. Parent (owner) cards expose matching `data_feed` Math streams on the **bottom** edge (D-075) — owner → Math then Math → owner, L→R. Peer stream order (D-073): capital-flow / pipeline lane, not UUID; template Math `fund_route` links normalize into-Math then out-of-Math.

For capital routing, funds only flow through Math / holding_fund / fund_router — never into LLM or model-bearing nodes:

```text
holding_fund --fund_route--> Math --fund_route--> fund_router --fund_route--> trading owner Math
```

Trading receives calculated capital via `data_feed` from its dedicated Math. No `fund_route` handle exists on trading, research, trend, or other model-bearing modules.

## Math tool presentation

A dedicated Math module renders as a compact `MathToolNode`, not as both a full standalone card and a duplicate stub.

- Default placement: centered below its owner.
- The tool lane begins after the owner’s measured card height plus a 12 px attachment gap.
- Compact tool size floor: 180 × 40 px.
- Data and fund handles remain text-labeled and connection-visible.
- Moving/reflowing an owner moves its dedicated Math tool with it.
- If the owner is in an engine, the Math tool is visually contained by the engine bounds but remains non-member domain data.
- Manually shared Math tools may be detached from the owner lane and placed independently.

## Connection-safe spacing

Layout uses measured React Flow node dimensions when available and conservative minimums before measurement.

| Constant | Value (`CANVAS_LAYOUT` / `ENGINE_GROUP_PADDING`) |
|---|---:|
| Module card floor | 220 × 168 px (D-088 density) |
| Math tool | 180 × 40 px |
| Owner → Math attachment gap | 12 px |
| Horizontal / vertical gutters | 280 / 140 px (clears parent-docked decisions + stacked envelopes; D-219) |
| Engine chip process zones | research → data → trend → execution → verification (unused compress) |
| Funds shelf gap under process | 56 px (`engineFundsShelfGap`) |
| Time hub gap under envelope | 48 px (`engineTimeHubGap`; Time pinned bottom-left under funds when present) |
| Group left/right padding | 96 / 240 px (utility ports; right reserves overflow decision column — D-219) |
| Group header/top padding | 96 px (D-089 inline bounded header fields) |
| Group bottom padding | 144 px (Math docks + funds + Time rail) |
| Top-level engine gutter | 176 px — create/insert/reflow/drag-stop via `placeNextEngineOrigin` (D-219) |
| Research → exec gap | 380 px (`researchToExecGap`) — Data Hub sits in this band (D-159 / D-219) |
| Decision docks | After parent (`moduleWidth + decisionOwnerGap`); overflow → right column (D-219) |
| Canvas family stack | Research deps left → hub gap → execution right; families stack **vertically** (D-159) |
| Math attachment | Single **Calc ref** (`math → owner` `data_feed`); info-type port labels (D-088) |

### Engine chip snap zones (2026-07-18)

Layout-only snapping (no required painted stage chrome). See
`docs/superpowers/specs/2026-07-18-engine-chip-zone-layout-design.md`.

| Zone / band | Types |
|-------------|-------|
| Research | `research`, `librarian` |
| Data | `library` (process row), `live_api` (stacked under) |
| Trend | `trend` |
| Execution | `trading`, `simulator`, `generator` |
| Verification | `analyzer`, `policy`, `display` |
| Funds shelf | `holding_fund`, `fund_router` (below process) |
| Clock bus | engine `time` (bottom-left) |

An **owner/tool envelope** includes the module card, its labeled side ports, its dedicated Math tool, and the attachment gap. Layout collision checks and `LAYOUT_ROW_STEP` use envelopes rather than module card rectangles alone. Engine bounds include dedicated Math docks so group chrome covers the full envelope.

## Engine-scoped Reflow

Each `EngineGroupNode` header exposes a **Reflow** button.

1. Read persisted engine membership.
2. Return escaped member nodes to that engine.
3. Return dedicated Math tools to their owners.
4. Assign **type lanes** from `MODULE_COLUMN` (research/data left → execution/verify right),
   compress unused lanes, exclude Math from ranking (D-066).
5. Place lanes left-to-right; stack nodes within a lane on multiple rows (`MODULE_LANE_ROW` hard
   bands, then topo; barycenter refines **within** a band only — D-212) using owner/tool envelopes.
6. Place each dedicated Math tool below its owner.
7. Recompute group bounds with connection-safe padding.
8. Persist all changed positions and bounds atomically.

Cycles use a stable fallback order based on template order, then module creation/id order. Reflow is deterministic for the same graph.

## Canvas-scoped Reflow

The main canvas **Canvas settings** menu (top-right) exposes **Reflow canvas** (and
**Clear canvas…** with a delete-all confirmation: Escape/backdrop cancel while idle; Clear
disabled when empty).

1. Restore module children to their persisted engine groups.
2. Restore dedicated Math tools to their owner lanes.
3. Run engine-scoped reflow for every engine.
4. Treat each engine as one top-level envelope.
5. Treat ungrouped owner/tool clusters and standalone modules as top-level envelopes.
6. Arrange top-level envelopes as **vertical families** (D-159): research deps left,
   Data Hub in the gap, execution right; stack families top→bottom (not a single
   horizontal line of all engines). `reflowCompanyFamilyLayout` persists this on
   company create, engine insert, and company page-load heal (not only Canvas Reflow).
7. Persist the full layout atomically and fit the viewport to the result.

Ordinary drag remains freeform. This feature does not enable always-on grid snapping.

## Contracts and API

- `MATH_REQUIRED_MODULE_TYPES`
- `moduleRequiresMath(type)`
- deterministic layout constants and pure rank/envelope helpers
- `modules.tool_owner_module_id` nullable self-FK with index
- engine insertion/company creation provisions required Math modules and links in the same batch
- module creation provisions its Math tool when `moduleRequiresMath(type)` unless explicitly disabled by an internal migration/admin path
- a batch layout endpoint persists module positions and engine bounds with ownership validation
- engine and canvas Reflow buttons call the same pure layout helpers and batch persistence boundary

## Error handling

- Provisioning fails closed if a required Math module or required edge cannot be created.
- Batch layout validation rejects cross-company module/engine ids and Math ownership cycles.
- A failed reflow leaves the prior persisted layout intact and restores optimistic client state.
- Reflow reports modules that could not be ranked, but still uses deterministic fallback placement.

## Verification

- Contract tests cover the required-type set, link directions, financial bypass rejection, rank stability, and envelope spacing.
- API tests cover atomic owner + Math creation, owner cleanup with shared-tool retention, and batch layout ownership.
- E2E covers:
  - every required template node receives one dedicated Math tool;
  - owner ↔ Math data edges exist;
  - trading fund path traverses its dedicated Math tool;
  - engine Reflow restores members/tools and removes overlaps;
  - canvas Reflow restores groups then lines up top-level engines;
  - reload preserves positions and ownership.
- IronBee verifies both Reflow buttons, visible connection clearance, Math tool placement, and a clean console after interaction.

## Non-goals

- Automatic reflow after every drag.
- A third-party graph-layout dependency.
- Treating Math as an LLM/model-bearing stage.
- Allowing model output to become a financial value, timestamp, duration, or schedule.
