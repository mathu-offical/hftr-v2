# Engine Data Hub — compound shelves + live topic feed (D-216)

**Status:** design locked — implementing  
**Date:** 2026-07-20  
**Decision:** D-216 (extends D-140 / D-159 / D-168 / D-189 / D-191)  
**Approach:** Evolve the single Engine Data Hub into a compound resource surface (Approach 1)

## Intent

The execution engine’s **Engine Data Hub** is that engine’s full resource surface — treated like a **live data source**. Operators see one compound hub node; all nested resources show the owning execution engine as **source**. Shelves organize by **origin role**, then **stream nature**. Config can expose individual shelves on separate output buses. Topic candidates auto-feed from ingest (analyze or write-through). Default **simulation** ENGINEs terminate with analysis agents that optimize **both** direct and analyzed feeds into the parent hub.

## Model

### Compound identity (unchanged shell)

| Artifact | Role |
|----------|------|
| Hub module | One canvas `library` with `libraryClass: engine_data_hub` per execution engine |
| Hub library row | `is_engine_data_hub`, `owner_engine_instance_id` |
| Source stamp | Every shelf / topic / concept under the hub carries `sourceEngineInstanceId` = owning execution |

### Shelf taxonomy (virtual — not separate library rows)

```
origin: research_in | exec_runtime | sim_training | policy_returns
  stream: semantic | numeric_capital | system_normalized
```

| Stream | Content | Safety |
|--------|---------|--------|
| `semantic` | Concepts, qualitative research artifacts | Research bus admit; no raw financial digits from LLMs |
| `numeric_capital` | ValueRefs / fund traces only | Math-only; LLMs never author numbers (D-008) |
| `system_normalized` | Diagnostics, sim feedback summaries, status envelopes | Codes + ValueRefs; model-free merge |

Shelves are indexed in hub module config (`shelves` + `shelfOutputs`). Nest libraries remain `parent_hub_library_id` children for Library tree UX; they map into origin/stream via config or defaults (research nests → `research_in/semantic`).

### Intakes

Hub exposes intake banks by stream (semantic / numeric_capital / system_normalized). Writers tag **origin**:

- Research packs → `research_in` (existing `targetLibraryIds` / attach_execution)
- Trading / policy / open-position notes → `exec_runtime` / `policy_returns`
- Sim terminal analyzers → `sim_training`

### Output buses (operator config)

```ts
shelfOutputs: Array<{
  origin: HubShelfOrigin;
  stream: HubShelfStream;
  bus: 'data_out';           // motherboard bus (streamId encodes shelf)
  enabled: boolean;
  streamId?: string;        // default shelf:{origin}:{stream}
  streamDescriptor?: string;
}>
```

**Default:** combined hub → owning execution `data_in` (D-168) remains the primary bind. Per-shelf outs are off until enabled; when enabled they publish utility `data_out` links with shelf-encoded `streamId`.

### Curated topic list = live feed

- Hub config `topicFeed.enabled` defaults **true**.
- Qualifying ingest (esp. `sim_training` analyzed + `exec_runtime` / `policy_returns` semantic) auto-creates or refreshes engine-scoped `research_topics` on the hub module (or mirrored onto attached research packs’ topic lists).
- Feed behaves like a live source: operator / pipeline may **analyze** or **write through** into the semantic shelf.
- Soft suppress/archive is later; default is open auto-push.

### Default sim ENGINEs — dual terminal analyzers

Gate (`sim_gate_strategy_spread`), training (`sim_train_policy_replay`), and adhoc (`sim_adhoc_paper_desk`) templates end with **two** analyzers:

| Analyzer | `hubFeedClass` | Role |
|----------|----------------|------|
| Direct feed | `direct` | Model-free package → hub `sim_training` + appropriate stream (default `system_normalized` / `numeric_capital` via ValueRefs) |
| Analyzed feed | `analyzed` | Qualitative concat → hub + **topic feed** candidates (`semantic`) |

Both on by default. Emit still uses existing `AnalyzerEmitMode` (`to_desk_stream` / `to_library`); `hubFeedClass` + `hubShelfOrigin` steer shelf + topic behavior.

## Lifecycle deltas

1. `ensureEngineDataHub` seeds default `shelves` matrix + `shelfOutputs` + `topicFeed` on hub config (idempotent merge).
2. Sim template insert includes dual analyzers; research-hub / parent bind still mirrors hub into `targetLibraryIds` / `targetLibraryModuleId`.
3. Analyzer concat (and later typed ingest APIs) call hub topic-feed helper when `topicFeed.enabled` and feed class is `analyzed` (or write-through path for `direct` when configured).

## Out of scope (this slice)

- Materializing each shelf as a separate `libraries` row
- New motherboard bus enum values beyond `data_out` + streamId encoding
- Live-trading enablement or guaranteed-returns copy
- Full Monte Carlo / multi-variant topic UI

## Success criteria

- [x] Design + D-216 in agent-docs
- [x] Contracts: shelf taxonomy, hub config, analyzer hubFeedClass
- [x] `ensureEngineDataHub` seeds shelves + topicFeed
- [x] Default sim templates ship dual terminal analyzers
- [x] Topic-feed helper + unit tests (contracts defaults/merge; ingest helper wired)
- [x] Analyzer concat honors hubFeedClass toward hub / topics (minimal path)
- [ ] IronBee verify hub chrome (when DevTools available)

## Related docs

- `docs/superpowers/specs/2026-07-18-engine-data-hub-design.md` (base)
- `docs/superpowers/specs/2026-07-19-simulation-engine-templates-design.md`
- `agent-docs/dev-intent/decisions-log.md` D-216
- `agent-docs/architecture/data-model.md`, `ui-ux/canvas-engine-group-design.md`, `ui-ux/ui-spec.md`, `product/product-spec.md`
