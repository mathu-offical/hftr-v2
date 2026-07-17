# Canvas spacing, reflow, and dedicated Math tools (2026-07-17)

**Status:** Implemented and runtime-verified (2026-07-17)  
**Decision:** D-033 (`dev-intent/decisions-log.md`)  
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
owner --data_feed--> Math
Math  --data_feed--> owner
```

The first edge carries the owner’s calculation inputs/context into the deterministic tool. The return edge carries typed calculated output back to the owner. These are topology and dispatch declarations; they do not permit raw model-generated numbers.

For a model-bearing module that receives financial values, the fund route must also traverse its dedicated Math tool:

```text
fund source/router --fund_route--> owner Math --fund_route--> owner
```

No direct fund route may bypass the owner’s Math tool. Link validation therefore adds the necessary `fund_router → math` and `math → trading` fund-route rules while preserving the existing holding-fund → Math → router path.

## Math tool presentation

A dedicated Math module renders as a compact `MathToolNode`, not as both a full standalone card and a duplicate stub.

- Default placement: centered below its owner.
- The tool lane begins after the owner’s measured card height plus a 24 px attachment gap.
- Compact tool minimum size: 220 × 48 px.
- Data and fund handles remain text-labeled and connection-visible.
- Moving/reflowing an owner moves its dedicated Math tool with it.
- If the owner is in an engine, the Math tool is visually contained by the engine bounds but remains non-member domain data.
- Manually shared Math tools may be detached from the owner lane and placed independently.

## Connection-safe spacing

Layout uses measured React Flow node dimensions when available and conservative minimums before measurement.

| Constant | Minimum |
|---|---:|
| Module card width | 280 px |
| Horizontal edge/port gutter | 180 px between card bodies |
| Vertical row gutter | 160 px between owner/tool envelopes |
| Owner → Math attachment gap | 24 px |
| Group left/right padding | 112 px |
| Group header/top padding | 120 px |
| Group bottom padding | 160 px |

An **owner/tool envelope** includes the module card, its labeled side ports, its dedicated Math tool, and the attachment gap. Layout collision checks use envelopes rather than module card rectangles.

## Engine-scoped Reflow

Each `EngineGroupNode` header exposes a **Reflow** button.

1. Read persisted engine membership.
2. Return escaped member nodes to that engine.
3. Return dedicated Math tools to their owners.
4. Compute stable pipeline ranks from internal links, excluding Math tools from rank calculation.
5. Place ranks left-to-right; place nodes within a rank top-to-bottom using owner/tool envelopes.
6. Place each dedicated Math tool below its owner.
7. Recompute group bounds with connection-safe padding.
8. Persist all changed positions and bounds atomically.

Cycles use a stable fallback order based on template order, then module creation/id order. Reflow is deterministic for the same graph.

## Canvas-scoped Reflow

The main canvas controls expose a top-level **Reflow canvas** button.

1. Restore module children to their persisted engine groups.
2. Restore dedicated Math tools to their owner lanes.
3. Run engine-scoped reflow for every engine.
4. Treat each engine as one top-level envelope.
5. Treat ungrouped owner/tool clusters and standalone modules as top-level envelopes.
6. Arrange top-level envelopes in one horizontal line with connection-safe gutters.
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
