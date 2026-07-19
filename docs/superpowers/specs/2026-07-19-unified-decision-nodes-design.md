# Unified decision nodes (evolve option anchors)

**Date:** 2026-07-19  
**Decision:** D-202 (extends D-173 / D-180 / D-191)  
**Status:** implemented  
**Approach:** Evolve `optionAnchor` → unified `decisionNode` (Approach 1)

## Problem

D-173/D-180 rendered every catalog choice leaf as its own React Flow card
(`curiosity_band`, `admission_mode`, each `branch_role`, etc.). Engines looked like
forests of tiny option chips instead of discrete **decision points**. Options belong on
a single decision node’s config; routing must fork **per option**.

## Decision

1. **One canvas node = one deterministic decision point** — structural building block
   inserted wherever engine processing must make a discrete choice.
2. **Options are config** on that node (catalog ids + labels + band defaults) — never
   separate canvas nodes per option value.
3. **Separate output handle per option** (`option-out:{optionId}`) — each option routes
   data to its destination.
4. **Intakes** — `data_in` (data_feed) + `system_control` from the owner/parent module
   (and optional clock when the template declares it).
5. **Hydration** — selected option / band position from policy envelopes, operator setup,
   or LLM-emitted **catalog refs only** (no raw numbers — D-008). Runtime choice remains
   model-free after compile.
6. **Templates seed stable decision nodes**; module types declare which decision kinds
   they need. Flexibility stays inside link-rule / catalog bounds.
7. **Each engine template** is composed for maximum flexibility and stability with its
   full seeded decision-node set (engine-specific rigidity via which nodes + default
   wires, not by exploding leaves).

## Identity model

| Entity | Role |
|--------|------|
| `DecisionNodeSpec` | Canvas + inspector identity: kind, owner, options[], selectedOptionId |
| `DecisionOption` | Config row: id, catalogRef, label, defaultPosition?, routeLabel? |
| `optionAnchor` (legacy) | Deprecated alias; builders emit decision nodes only |

### Collapse rules (from D-173 trees)

| Was (separate RF nodes) | Becomes |
|-------------------------|---------|
| `strategy_family` + child `branch_role`s | One `strategy_family` decision; branches = **options** (per-option outs) |
| `recovery_phase` chain | One `recovery_phase` decision; phases = **options** |
| `research_subtype` + sibling bands/modes as children | **Sibling decision nodes** (each kind is its own choice point) with full option sets |
| Same-kind leaf values as their own cards | Folded into parent decision’s `options[]` |
| `lever_band` | Remains inspector-only (not canvas decision nodes) |

## Handles

```
[owner module]
  data_feed-out ──────────────► decision data-in
  system_control-out ─────────► decision system-in   (when owner exposes control)
        │
        ▼
┌─ Decision · {kind} ─────────────────────────┐
│  options config (chips) · selected marker     │
│  [out:optA] [out:optB] [out:optC] …          │
└──────────────────────────────────────────────┘
        │            │            │
        ▼            ▼            ▼
   destination   destination   destination
```

Decorative `option_bind` edges remain React Flow-only (not `module_links`) unless a
template declares a durable route; durable routes use existing link kinds when the
destination is a real module.

## Template + module needs

```ts
// EngineTemplate
decisionNodes?: EngineTemplateDecisionSeed[]
// EngineTemplateDecisionSeed: kind, ownerModuleIndex | 'engine',
//   optionCatalogRefs?, defaultSelected?, intakes?, defaultWires?

// Module type registry
requiredDecisionKinds?: OptionAnchorKind[]  // functional bounds
```

Builders merge: template seeds ∪ module-required kinds for present members, then fill
option catalogs from strategy/philosophy/research catalogs.

## Persistence

- `setupSnapshot.decisionNodes` (last sync) replaces / supersedes `optionAnchors`
- `setupSnapshot.decisionOptionSelections` map `decisionId → optionId`
- Keep reading legacy `optionAnchorPositions` as band fallback during migration
- No new DB migration (JSONB snapshot only)

## Canvas / inspector

- RF type `decisionNode` (accept legacy `optionAnchor` id during transition)
- Wider card: kind chip, selected option, option-out handle bank
- Engine inspector lists decision nodes + option editors
- Selecting a decision opens Decision inspector (kind, options, selection, intakes)

## Out of scope

- New `ModuleType: decision` DB rows (Approach 2)
- Freeform palette insert outside template/module bounds (Phase 2)
- Changing Market Posture Model graph (separate surface)

## Safety

- Options / selections are catalog refs and band positions only — no raw financial numbers
- LLM may propose option ids; deterministic gates reject unknown refs (`enforceScopeStrict`)
- Groq compile remains last model-bearing stage

## Verification

- Contract tests: one decision node per choice point; N options ⇒ N out handles
- Placement: no child option cards; owned decisions dock beside owner
- Engine insert: day_trading / research / HFT / simulation seed full decision sets
- IronBee: canvas shows unified decision cards with per-option outs; console clean
