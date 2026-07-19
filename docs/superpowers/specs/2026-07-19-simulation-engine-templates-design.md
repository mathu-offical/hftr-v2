# Simulation ENGINE templates + exec family placement (D-189)

**Date:** 2026-07-19  
**Decision:** D-189 (extends D-122 paper spine, D-043/D-153 research-deps pattern, D-028 engines)  
**Status:** design locked — implementing  
**Approach:** hybrid (like research) — child of execution **or** standalone adhoc ENGINE

## Intent

Operators refine strategy weights/logic via **simulation ENGINEs** that run multiple
trade strategies in a testable spread inside the existing **internal paper** system
(D-122). Sims are first-class ENGINE templates (create section **Simulation**), not
only `simulator` modules or thin `simulation_runs` loops.

## Model

### Engine create section

`EngineCreateSection = 'research' | 'execution' | 'simulation'`

| Kind | Default hub | Role |
|------|-------------|------|
| **Adhoc sim ENGINE** | Own paper desk lifecycle | Standalone internal trading engine in `paper_sim`; self-learning; promotable to real execution later |
| **Child sim (pre)** | Parent exec family | **Gate** — parallel process placement; gleaned settings influence parent execution |
| **Child sim (post)** | Parent exec family | **Training** — uses parent-generated policy; extra paper trades; feedback into **parent Engine Data Hub** |

**Placement = process role.** Each template is **bespoke** for gate vs training vs adhoc
(not a single template with a flag).

### Create / insert UX

| Action | Behavior |
|--------|----------|
| Company create / add execution | Operator chooses sim count: **none or N** (default **2**: one `pre` gate + one `post` train) |
| Add sim to existing execution | Must **specify which** execution engine; choose **pre** or **post** placement |
| Adhoc sim (palette / create) | Standalone ENGINE; no parent required |
| Mimic parent | Linked sims default `mimicParent: true` — clone capital/policy/strategy envelope from parent, then diverge via strategy-spread option anchors |

### Templates (initial set)

| ID | Placement | Purpose |
|----|-----------|---------|
| `sim_gate_strategy_spread` | `pre` | Parallel gate: multi-family strategy spread → score → influence parent levers/weights |
| `sim_train_policy_replay` | `post` | Training: parent policy → paper trades → hub-enriched feedback + `training_feedback` |
| `sim_adhoc_paper_desk` | n/a (solo) | Full mini paper desk; own lifecycle; promote path later |

All use `paper_sim` / `funds_only` by default. Live remains fail-closed.

### Strategy spread

Gate (and optionally adhoc) runs **multiple strategy families** within a bounded
spread to refine weights/logic for future engine configs. Option-tree anchors
(D-173/D-180) expose family/band positions for operator tweaks. Results integrate
with InternalPaperCore + existing Sims panel / `simulation_runs` (thickened over time).

### Persistence (no migration required for binding)

`engine_instances.setup_snapshot.simulationBinding`:

```ts
{
  role: 'gate' | 'training' | 'adhoc',
  placement?: 'pre' | 'post',           // required when linked
  parentExecutionEngineId?: uuid,       // required when linked
  mimicParent: boolean,                 // default true when linked
}
```

Family layout places child sims **pre** (parallel process) or **post** (after trading /
toward hub feedback). Canvas remains source of truth.

### Defaults map (like research deps)

`EXECUTION_ENGINE_SIM_DEPENDENCIES[execTemplateId]` →  
`[{ templateId, placement }]` — default pair gate+train for each available execution
template. `expandEngineSeedsWithSimDeps` mirrors research expansion; create-form can
set count to `0` to skip.

### Integration with paper system

- Dispatch: InternalPaperCore / `paper-trade.ts` (D-122)
- Training feedback: `BookDelta` → `training_feedback` / control snapshot deltas
- Gate influence: optimized band/weight proposals applied to parent via training path
  (operator-visible; fail-closed)
- Hub: post sims emit qualitative feedback into parent Engine Data Hub (`targetLibraryIds`)

## Out of scope (this slice)

- Automatic live promotion without live-gate ceremony (D-031)
- Replacing promote six-gate or live checklist
- Full multi-variant Monte Carlo UI (strategy spread is catalog-bounded first)

## Agent-docs

- `decisions-log.md` D-189  
- `canvas-engine-group-design.md` — Simulation section + pre/post children  
- `product-spec.md` — Simulator / sim ENGINE vision  
- `engine-node-family-design.md` — sim family  
- `data-model.md` — setup_snapshot.simulationBinding  
- This spec + implementation plan

## Success criteria

- [x] Three sim ENGINE templates available in Simulation create section
- [x] Execution create defaults to 2 child sims (gate pre + train post); count overridable to none/N
- [x] Add-sim-to-existing-exec requires parent + pre|post (palette)
- [x] Adhoc sim insert works without parent
- [x] Binding persisted on setup_snapshot; agent-docs updated
- [x] Paper path remains funds_only / paper_sim by default
- [ ] IronBee browser verify create + palette insert (pending DevTools)
- [ ] Thickened simulation.run strategy-spread handler (follow-up)
