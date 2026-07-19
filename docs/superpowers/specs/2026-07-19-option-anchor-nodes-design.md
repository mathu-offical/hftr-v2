# Option-anchor nodes + complete canvas inspector (D-173 / D-180)

**Date:** 2026-07-19  
**Decision:** D-173 (extends D-159 family layout, D-091 motherboard, catalog levers);  
D-180 extends research engines + owner docking  
**Status:** implemented

## Problem

Deterministic decisions (strategy family, branch roles, lever bands, recovery phases,
engine template inputs, research subtype/curiosity/library class) lived in catalogs /
pipeline contracts but were not visible as canvas nodes. `InspectorPanel` covered only a
subset of module types/fields; engines and option anchors were not inspectable. Research
engines previously only got a lone `template_input`.

## Decision

1. **Contracts** — `OptionAnchorSpec` + `buildOptionAnchorsForEngine` derive anchors from
   `ENGINE_TEMPLATES` inputs, trading `strategyFamilies`, branch taxonomy, lever tools,
   recovery phases, philosophy axes, **and research member configs** (subtype, curiosity,
   admission, cadence, librarian/library/trend/analyzer). Anchors carry catalog refs and
   band positions only (no raw financial numbers — D-008).
2. **Canvas** — `optionAnchor` React Flow nodes parented under the owning engine group.
   **Owned roots dock beside their owner module**; children stack under parents.
   Unowned roots use the engine right column. Canvas-visible kinds exclude `lever_band`
   (inspector-only). Visual `option_bind` edges: owner module → root → children.
3. **Persistence** — `setupSnapshot.optionAnchors` (last sync) + `optionAnchorPositions`
   (operator band positions) on `engine_instances.setup_snapshot` — no new migration.
4. **Inspector** — Canvas `InspectorPanel` only (not RightPanel Config):
   - Module: setup + `SchemaConfigForm` + specialized actions + `LeverTreeSection`
   - Engine: setup + template inputs + anchor list + lever tree
   - Option anchor: kind / catalogRef / position + related lever tree

## Out of scope

- RightPanel Config tab
- Market Posture Model overlay as a separate anchor surface
- New `ModuleType` or full DecisionTree editor graph beyond catalog anchors
