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
| Nest libraries | Member libraries of the execution engine + linked research engines; `parent_hub_library_id` → hub (Library tree only — **no** nest→hub canvas `module_links`) |
| Engine utility bind (D-159 / D-168) | Hub → owning execution `data_in` (`from_module_id=hub`, streamDescriptor `Data Hub`) |
| Research → exec | **Not** auto-wired (D-168). Research hydrates hub via `targetLibraryIds`; family layout still stacks research left / hub gap / exec right |
| Query / returns | Qualitative via hub `targetLibraryIds` + analyzer emit / `mirrorResearchTargetsToHub` — **not** hub↔trading `module_links` |

## Lifecycle

1. On execution engine insert (company create or `POST …/engines`): create hub module + library row; place in the research→exec gap; register nests; bind hub→engine `data_in` utility; add hub id to research `targetLibraryIds`.
2. When a library module is added under the family: set `parent_hub_library_id`.
3. On execution engine cascade delete: delete hub module + library (and clear nest parents).
4. Legacy hub `module_links` are deleted on ensure (heal path).

## UI

- Libraries dock / Data: hub-rooted tree when engine-scoped; nests as shelves under hub.
- Canvas: hub between research deps and execution group, biased toward exec `data_in`
  (D-168); edges terminate on **engine chrome**.
- Create preview: hub→exec `data_in` only (no default eng↔eng bridges).

## Safety

Fund routes remain Math-only. Returns carry qualitative text + ValueRef ids only — no raw financial numbers in model-facing payloads. No live-trading enablement.

## Extension — compound shelves + live topic feed (D-216)

See `docs/superpowers/specs/2026-07-20-engine-data-hub-compound-shelves-design.md`.
Hub config seeds origin×stream shelves, optional per-shelf outs, and auto topic feed.
Default sim ENGINEs use dual terminal analyzers (`hubFeedClass` direct + analyzed).
