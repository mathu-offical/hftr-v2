# Unified Decision Nodes Implementation Plan

> **For agentic workers:** Implement task-by-task. Spec: `docs/superpowers/specs/2026-07-19-unified-decision-nodes-design.md` (D-192).

**Goal:** Collapse per-option canvas cards into unified decision nodes with options-as-config and per-option output handles, template-seeded per engine.

**Architecture:** Evolve `OptionAnchorSpec` → `DecisionNodeSpec` with `options[]`; builders emit one node per choice point; canvas `DecisionNode` renders intake + option-out handle banks; templates declare seeds; modules declare required kinds.

**Tech Stack:** Zod contracts, React Flow, existing engine templates, Vitest, IronBee browser.

## Global Constraints

- No raw financial numbers on canvas (D-008)
- No new ModuleType / DB migration — setup_snapshot JSONB only
- DevSpecs/ and external v1 workspace are read-only
- Flexibility within catalog + link-rule bounds

## File map

| File | Responsibility |
|------|----------------|
| `packages/contracts/src/decision-nodes.ts` | DecisionOption, DecisionNodeSpec, builders, catalogs |
| `packages/contracts/src/option-anchors.ts` | Re-export / thin compat shim |
| `packages/contracts/src/templates.ts` | `decisionNodes` seeds on EngineTemplate |
| `packages/contracts/src/modules.ts` | `requiredDecisionKinds` on type metadata where applicable |
| `apps/web/components/canvas/DecisionNode.tsx` | Unified RF node UI |
| `apps/web/components/canvas/decision-node-graph.ts` | Placement + edges |
| `apps/web/components/canvas/CompanyCanvas.tsx` | Wire decision nodes |
| `apps/web/components/canvas/EngineInspectorPanel.tsx` | List decisions |
| `agent-docs/ui-ux/canvas-engine-group-design.md` | Doc sync |
| `agent-docs/dev-intent/decisions-log.md` | D-192 |

---

### Task 1: Contracts — DecisionNodeSpec + builder collapse

- [ ] Add `decision-nodes.ts` with DecisionOption, DecisionNodeSpec, handle id helpers
- [ ] Implement `buildDecisionNodesForEngine` collapsing branch/phase children into options
- [ ] Sibling kinds (curiosity, admission, cadence) = separate decision nodes with full option catalogs
- [ ] `canvasVisibleDecisionNodes` excludes lever_band
- [ ] Tests in `decision-nodes.test.ts`
- [ ] Re-export from index; keep option-anchors compat wrappers

### Task 2: Template seeds + module needs

- [ ] Extend EngineTemplate with optional `decisionNodes` seeds
- [ ] Seed day_trading, HFT, research, trend_research, simulation with stable sets
- [ ] Document requiredDecisionKinds on key module configs / registry

### Task 3: Canvas DecisionNode + graph

- [ ] DecisionNode component: data-in, system-in, option-out bank
- [ ] decision-node-graph placement (no child stacking for options)
- [ ] Edges: owner→decision intakes; option-out decorative binds where destinations known
- [ ] Migrate CompanyCanvas + inspectors from optionAnchor

### Task 4: Docs + verify

- [ ] Update ui-spec, canvas-engine-group-design, decisions-log D-192
- [ ] pnpm test contracts + canvas unit tests
- [ ] IronBee screenshot of engine with unified decision nodes
- [ ] Commit per D-134
