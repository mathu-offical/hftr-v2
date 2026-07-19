# Engine Data Hub (D-140)

**Status:** design locked for implementation  
**Date:** 2026-07-18  
**Decision:** D-140

## Intent

Every **execution** engine instance owns a first-class **Engine Data Hub**: a shared library that linked research engines hydrate into, that the execution spine queries, and that receives returns (open-position policies, history, in-flight notes). All other libraries in the execution engine and its linked research dependency engines are **nests under** this hub in Library/Data views.

## Model

| Artifact | Role |
|----------|------|
| Hub module | Canvas `library` with `libraryClass: engine_data_hub`, `engineDataHub: true`; **not** an engine member (`engine_instance_id` null); owned via `libraries.owner_engine_instance_id` |
| Hub library row | `is_engine_data_hub = true`, `owner_engine_instance_id` set |
| Nest libraries | Member libraries of the execution engine + linked research engines; `parent_hub_library_id` → hub |
| Query edge | Hub → trading (or analyzer) `data_feed`, role label **Query** |
| Hydrate edges | Nest library modules → hub `data_feed`, role **Hydrate** / shelf |
| Returns edges | Policy / trading / analyzer → hub; labels **Policies** / **History** / **Notes** (nature system via verification or labeled data_feed) |

## Lifecycle

1. On execution engine insert (company create or `POST …/engines`): create hub module + library row; place left of execution envelope; register nests; wire query/hydrate/returns; add hub id to research `targetLibraryIds`.
2. When a library module is added under the family: set `parent_hub_library_id`.
3. On execution engine cascade delete: delete hub module + library (and clear nest parents).

## UI

- Libraries dock / Data: hub-rooted tree when engine-scoped; nests as shelves under hub.
- Canvas: hub between research deps and execution group; shelf input chrome.
- Create preview: same wiring (replaces fiction-only research↔exec bridges where hub applies).

## Safety

Fund routes remain Math-only. Returns carry qualitative text + ValueRef ids only — no raw financial numbers in model-facing payloads. No live-trading enablement.
