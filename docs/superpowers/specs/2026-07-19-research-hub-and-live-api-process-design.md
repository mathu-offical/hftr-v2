# Research library binding + live API process graph (D-184)

**Date:** 2026-07-19  
**Decision:** D-184 (extends D-140 / D-143 / D-159 / D-168 / D-173 / D-180 / D-121)  
**Status:** design locked — pending user review before implementation  
**Approach:** canvas-first process graph (canvas is high-level source of truth)

## Problem

1. Research engines do not clearly express how they bind to libraries / execution Engine
   Data Hubs; create flows lack an operator chooser (new library vs existing engine/library).
2. `live_api` nodes lack declared **domain widget outputs**, flexible **query policy**, and
   **clock** scheduling — and they shortcut past visible normalize/integration steps.
3. Option-tree / deterministic anchors exist for research/trading but are not yet the
   standard path from **source widget formats → system-normalized** articles/concepts.

## Principles

- **Canvas is the high-level source of truth** for topology (modules, links, hubs, option
  anchors). Config and registries elaborate; they do not replace visible process.
- **Engines are bespoke.** Templates pick policies for stability and use case; adhoc nodes
  expose the full flexibility surface.
- Research hydrates **libraries**; execution hubs receive **enriched articles** — research
  does **not** get an external Engine Data Hub by default.

---

## 1. Research engines ↔ libraries / hubs

### 1.1 Internal vs external

| Surface | Default | Role |
|---------|---------|------|
| **Internal library** | Yes (member `library`, usually `topic_runtime` / research topics) | Pack-local reference for curator spine |
| **External Engine Data Hub** | **No** unless operator chooses to connect | Execution-family shared shelf |

Research engines are built **up to hydration into a library**. They do not ship with an
external hub wired by default.

### 1.2 Linked to a parent execution engine

When a research pack is created **as linked** to an execution engine (or operator attaches
it later):

- Research spine still ends at its **internal** library (and librarian).
- Emit path targets the **parent execution Engine Data Hub** with tag / concept / link
  enriched **articles** (via `targetLibraryIds` + analyzer terminus / utility — not a second
  hub module on the research pack).
- Family layout keeps research left / hub gap / exec right (D-159 / D-168).

### 1.3 Solo research create chooser

| Situation | Behavior |
|-----------|----------|
| **First** solo research on empty / no existing libraries | Auto-create internal research library (no chooser) |
| **Additional** solo research | Chooser: **new** research library **or** **connect** to an existing company library |
| Research create with execution context | Chooser: new research library **or** attach to existing **execution engine** (→ that engine’s hub) **and/or** existing library |

Chooser payload is persisted on insert (`InsertEngineInput` / API body) so canvas and DB
agree.

### 1.4 Execution engines

Unchanged hub lifecycle (D-140): every **execution** engine still provisions its own
Engine Data Hub. Research packs do not.

### 1.5 Runtime alignment (must fix with this design)

- Activation / graph resolvers must honor the **librarian spine** (`research→librarian→library`)
  and hub hydration via `targetLibraryIds` — not require forbidden `research→library`
  bypasses (D-143).
- When attached to an exec hub, mirror hub id into research/librarian `targetLibraryIds`
  and keep internal library nest semantics where applicable.

---

## 2. Live API process graph

### 2.1 Mental model (canvas-first)

```
[clock / schedule] ──clock_in──┐
                               ▼
[librarian|research|agent] ──query──► [live_api] ──widgets──► [option anchors]
         ▲ static fallback / policies on node                     │
                                                                  ▼
                                                         [analyzer|integration]
                                                                  │
                                                                  ▼
                                              [library] and/or [exec Engine Data Hub]
```

`live_api` **emits domain widgets only** (multi-select). It does **not** write the concept
registry directly. An **analyzer / integration** node is required on the path so operators
can see quality per step and tweak option-tree positions.

### 2.2 Domain widget outputs (multi-select)

Reuse / extend `LiveDataSourceWidgetKind` as the declared output set on the node:

- `headline` | `filing` | `listing` | `series` | `entitlement` | `generic`
- Optional additive shapes if needed for market poll visibility: `quote` (maps to series/
  listing presentation — still a **widget**, not a ValueRef write from live_api itself)

Config: `outputWidgetKinds: LiveDataSourceWidgetKind[]` (min 1). Templates set per
hydrator/use case; adhoc requires operator selection (defaults from registry domain).

### 2.3 Query policy (flexible modes — different levels)

Static query and upstream query are **different purposes**. The node always carries a
`queryPolicy` enum; templates pick for stability; adhoc can use any mode.

| Mode | Behavior |
|------|----------|
| `upstream_then_static` | Prefer upstream query wire; if absent, use `staticQuery` |
| `upstream_or_null` | Prefer upstream; if absent, **null** (skip run — no static) |
| `static_prefer_upstream` | Default to `staticQuery`; upstream **overrides** when connected |
| `static_only` | Always `staticQuery`; ignore upstream even if linked |

Fields:

- `queryPolicy` (required)
- `staticQuery` (string; required for modes that may use static; may be empty only when
  policy is `upstream_or_null`)
- Upstream link: `librarian|research|analyzer|… → live_api` with link kind that carries
  query artifact (new allowed pairs as needed; no raw financial numbers in query text from
  models — D-008)

Resolver: single `resolveLiveApiQuery(module, graph)` used by hydrate jobs and Explorer
parity.

### 2.4 Clock / schedule input

- `live_api` gains a **clock input** (time-bearing for schedule): bind to company `clock` /
  Time hub utility **or** explicit `scheduleRef` / `pollSeconds` under a `schedulePolicy`.
- `pollSeconds` becomes real schedule intent when policy is module-poll; clock-bound runs
  use session/calendar via existing clock module (D-088 / D-108).
- Templates set cadence for stable desks; adhoc exposes policy + poll.

### 2.5 Normalize path = option anchors + analyzer

Deterministic option-tree nodes (D-173 / D-180) organize **incoming widget formats →
system-normalized** articles / tags / concepts / links:

- Own under live_api / analyzer / librarian / research as appropriate
- Present on **both** research and execution templates where live sources land
- Operator positions (min/typical/max) remain the tweak surface for quality

Analyzer/integration is the **visible** registry integration step; live_api alone is not.

### 2.6 Template vs adhoc

| Path | Behavior |
|------|----------|
| **Engine templates** | Predefine `sourceKind`, `outputWidgetKinds`, `queryPolicy` + static query when needed, schedule policy, links to analyzer, and option-anchor trees — bespoke per use case |
| **Adhoc place (DATA tab / palette)** | Operator defines formats, query policy, static query, clock/schedule, and must wire (or accept assist) into an analyzer/integration + library/hub |

---

## 3. Contracts sketch (implementation-facing)

### `LiveApiModuleConfig` extensions

```ts
queryPolicy: 'upstream_then_static' | 'upstream_or_null' | 'static_prefer_upstream' | 'static_only'
staticQuery?: string
outputWidgetKinds: LiveDataSourceWidgetKind[]  // min 1
schedulePolicy: 'module_poll' | 'clock_bound' | 'manual'
// pollSeconds retained for module_poll
// scheduleRef optional ValueRef handle for clock_bound
```

### Research insert options

```ts
libraryBinding:
  | { mode: 'create_internal' }
  | { mode: 'connect_library'; libraryId: string }
  | { mode: 'attach_execution'; engineInstanceId: string } // → parent hub hydration
```

### Link rules

- Allow query-bearing inbound to `live_api` from librarian / research (and optionally
  analyzer) as needed for upstream modes.
- Require outbound path `live_api → … → analyzer|integration` before library/hub admit for
  qualitative registry writes (activation or soft gate — prefer visible canvas requirement).

---

## 4. Agent-docs impact (same change as code)

| Doc | Update |
|-----|--------|
| `agent-docs/dev-intent/decisions-log.md` | D-184 |
| `agent-docs/ui-ux/canvas-engine-group-design.md` | Research internal library; no default external hub; attach→parent hub |
| `agent-docs/architecture/engine-node-family-design.md` | Research create chooser; article emit to hub |
| `docs/superpowers/specs/2026-07-18-engine-data-hub-design.md` | Clarify research does not own hub; hydrates parent when linked |
| `agent-docs/ui-ux/ui-spec.md` | Live API process + create chooser |
| `agent-docs/architecture/data-model.md` | LiveApi config fields |
| Option-anchor design | Format→normalize anchors on live_api / analyzer paths |

---

## 5. Out of scope (this design)

- Enabling live trading
- New LLM stage below compile
- Replacing Engine Data Hub for execution engines
- RightPanel Config as primary editor (canvas inspector remains)

## 6. Success criteria

- [ ] Solo research create: first auto-library; later chooser new vs existing
- [ ] Linked research: internal library + hydrate parent exec hub with enriched articles
- [ ] No default external hub on research packs
- [ ] `live_api` declares multi-select widget outputs; query policies all four modes; clock/schedule input
- [ ] Canvas shows live_api → option anchors → analyzer → library/hub
- [ ] Templates bespoke; adhoc fully configurable
- [ ] agent-docs + this spec updated in the same implementation commits

## 7. Safety

- No raw financial numbers in model-facing query/article text (ValueRefs for numerics)
- Clock/calendar remain authoritative for schedules
- Entitlement / feedClass honesty retained on hydrators
- No guaranteed-returns language
