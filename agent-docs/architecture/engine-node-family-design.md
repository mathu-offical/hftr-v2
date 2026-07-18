# Engine node families, v1 process mapping, and control plane (D-042)

**Status:** design approved 2026-07-17; **implemented** (contracts, DB journal 0023, templates,
palette/inspector/process modal). D-091 motherboard I/O + research terminal analyzer **implemented**.
Browser E2E for new research ENGINE inserts pending.  
**Decision:** D-042; motherboard I/O D-091  
**Related:** D-023/028/033/035/039/040/041/088/089/091; DevSpecs `engine-philosophy.spec.md`,
`research-library-philosophy.spec.md` (read-only); `architecture/engine-motherboard-io-design.md`

## Goal

Balance operator visual flexibility with hardened verified execution:

1. Canvas shows **operator modules** (wireable, typed ENGINEs).
2. v1 pipeline stages surface in a **per-node detail modal** (observe + bounded tune).
3. **One shared control plane** for user overrides and LLM picks — fail-closed envelopes.
4. User owns high-level directives by default; may opt into manual control of any in-envelope lever.
5. Execution ENGINEs use the **full spine**; research ENGINEs are specialized by research type; Math is typed by consumer need.

## Architecture split

| Layer | Flexible? | Contents |
|-------|-----------|----------|
| Canvas graph | Yes (within `LINK_RULES`) | Module instances, ENGINE groups, link kinds |
| ENGINE specialty presets | Yes (catalogued) | Defaults for venues, strategy families, curator packs, Math types |
| v1 stage adjacency | **No** | Immutable spine inside owning nodes |
| Guardrails / verification schemas / gates | **No** | Immutable at runtime |
| Band / lever **positions** | Bounded | Mutable inside min/typical/max envelopes |

## Baseline canvas modules

| Type | Role |
|------|------|
| `research` | External / specialty discover (two-step: discover → verify) |
| `librarian` | Query existing libraries; relevance; reorganize topics (**new**) |
| `library` | Curated store (seeded + runtime classes) |
| `live_api` | Deterministic market/runtime feeds |
| `trend` | Trends + **lead package** (v1 `lead` not a canvas node) |
| `trading` | Owns **tree → compile → dispatch → loop_refine** |
| `policy` | Envelope / gate binding |
| `holding_fund` / `fund_router` | Capital topology (via Math) |
| `math` | Typed deterministic calculator tools (never ENGINE member) |
| `clock` | Company singleton Master Clock — temporal authority / orientation (D-088; never ENGINE member) |
| `time` | Repeatable temporal processors (elapsed / TZ / session / schedule) (D-088; never ENGINE member) |
| `analyzer` | Verification / loopback; **research ENGINE terminal step** (D-091) |
| `simulator` / `display` / `generator` | Optional utilities |

## Motherboard utility buses (D-091)

ENGINE group chrome (not member modules) exposes category-scoped utility buses persisted on
`engine_utility_links`. See `architecture/engine-motherboard-io-design.md` for full bus matrix,
auto-hydration, and inter-engine stream rules.

| Bus | Research ENGINE | Execution ENGINE |
|-----|-----------------|------------------|
| `data_in` / `data_out` | inter-engine qualitative streams | policy/dump exports to peers |
| `clock` | bind company Master Clock (replaces direct clock→member for new inserts) | same |
| `funds` | — | fund-path topology signal |
| `system_control` | cadence arm / pause | gate snapshots |

**Research ENGINE pipeline terminus:** internal member order ends at a terminal `analyzer`
(`emitMode: to_desk_stream` or `to_library`) before anything reaches `data_out`. Execution
ENGINEs keep analyzer on the verification column with `emitMode: verify_loopback` for trading
loopback.

**Auto-hydration:** engine insert provisions utility binds, dedicated Math docks, terminal
analyzer (research), and source-derived library names — idempotent with template insert.

## v1 stage → owning node

| v1 `node_kind` / tool | Canvas owner | Detail-modal layer |
|----------------------|--------------|-------------------|
| `root` / run bootstrap | Company / ENGINE chrome | Engine status |
| `research_topic` | `research` (+ `librarian` for graph hygiene) | Gather → validate → synthesize → admit |
| knowledge stacks | `library` | Membership, admission, export |
| `trend` | `trend` | Scan, regime, evidence chips |
| `lead` | `trend` (internal) | Lead package emit |
| `tree` | `trading` | Tactical tree + strategic/tactical levers |
| `compile` | `trading` | Groq compile (last model stage) |
| `dispatch` | `trading` | Model-free dispatch |
| `loop_refine` | `trading` + `analyzer` (`verify_loopback`) | Recovery / re-tune → re-compile |
| verification annex | `analyzer` + `policy` | Traces, gate results |
| research export / bus emit | `analyzer` (`to_desk_stream` / `to_library`, D-091) | Qualitative digest → engine `data_out` |
| numbers / funds | `math` (+ fund nodes) | ValueRef lineage, op log |

Stage order is **not** rewirable on the canvas.

## Control plane (user + LLM)

```
User high-level directives
  → company philosophy, ENGINE topic/capital/exit, specialty, graph links, admission mode
Shared immutable envelopes
  → bands, guardrails, verification schemas, activation gates, LINK_RULES
Per-cycle picks (LLM default; user opt-in manual)
  → lever positions, tool continuation, fan-out within caps
```

Same Zod / catalog schemas for UI and model tool calls. `enforceScopeStrict` fail-closed.

## Research agent subtypes (`research.config.researchSubtype`)

| Subtype | Role |
|---------|------|
| `external_web` | Web/news discover |
| `external_filings` | SEC/EDGAR + filings |
| `external_market_news` | Market/news narrative |
| `specialty_desk` | Desk-aligned curator |
| `event_catalyst` | Earnings/events/macro |
| `crypto_onchain_context` | Crypto narrative (not prices) |
| `prediction_niche` | Prediction niche sources |

## Librarian subtypes (`librarian.config.librarianSubtype`)

| Subtype | Role |
|---------|------|
| `librarian_relevance` | Multi-metric relevance + topic hygiene |
| `librarian_seed_keeper` | Protect/refresh compile-time seeded mechanism libraries |

## Library classes (`library.config.libraryClass`)

`seeded_mechanisms` | `topic_runtime` | `market_history` | `runtime_market_cache` | `runtime_app_logs` | `specialty_evidence` | `master_graph`

## Math types (`math.config.mathType`)

| Type | Purpose | Typical attach |
|------|---------|----------------|
| `company_hub` | Shared company calculator | Always seeded |
| `fund_path` | Capital topology | holding_fund ↔ fund_router |
| `desk_execution` | Desk sizing / compile inputs | trading |
| `trend_signal` | Live→signal morphs (refs) | trend |
| `research_metric` | Research scores/ranking refs | research / librarian |
| `analyzer_reconcile` | Fill/ledger reconcile | analyzer |
| `simulator_sandbox` | Sim-scoped calc | simulator |
| `session_calendar` | Clock/calendar session math | company / policy-adjacent |

Dedicated Math ownership (D-033) maps owner → preferred `mathType` when provisioning tools.

## Execution ENGINE specialties (full spine)

Same topology; specialty remaps defaults only:

`research pack` → libraries → `live_api` → `trend` → `trading` → `policy` + funds via Math + `analyzer`

| Specialty | `trading.subtype` | Availability |
|-----------|-------------------|--------------|
| day_trading | `day` | available |
| crypto | `crypto` | gated on session envelope |
| prediction | `prediction` | available (live venue gated) |
| long_term | `long_term` | available (new template) |
| hft | `hft` | unavailable until latency gates |
| custom | `custom` | generator / manual |

## Research ENGINE specializations

| Id | Mode | Default pack |
|----|------|--------------|
| `research_web_fabric` | pure_data | web + librarian → topic libs |
| `research_filings_fundamentals` | pure_data | filings + librarian |
| `research_seed_mechanisms` | pure_data | seed_keeper → seeded_mechanisms |
| `research_event_catalyst` | pure_data | event_catalyst + librarian |
| `research_market_regime_lab` | market_trend | market_news + specialty + live + trend |
| `research_crypto_context` | market_trend | crypto pack + live + trend |
| `research_prediction_niche` | market_trend | prediction + event + live + trend |
| `research_desk_aligned` | market_trend | specialty_desk matched to trading specialty |
| `research_multi_curator` | picker | 2–3 externals + librarian |

## Detail modal (UX)

- Open from node card (“Process” / detail).
- Tabs: **Process** (v1 layers for owner), **Controls** (bounded levers; manual override toggle), **Activity** (jobs/traces).
- Side panels remain company-scoped exploration; modal is node-owned process + control.
- No stage rewiring; illegal lever edits rejected with text-first errors.

## Implementation map

| Package | Changes |
|---------|---------|
| `packages/contracts` | subtypes in configs; `librarian` ModuleType; MathType; ENGINE template categories; refined templates; D-091 `EngineUtilityBus` / `EngineUtilityLink` |
| `packages/db` | migration: allow `librarian` in modules.type; `engine_utility_links` migration `0037` (D-091) |
| `apps/web` | palette, config forms, template picker, detail modal scaffold; `EngineGroupNode` utility rail (D-091) |
| `packages/engine` | librarian-aware link resolution; mathType when attaching tools |
| `agent-docs` | this doc + product/ui/data-model + D-042 + `engine-motherboard-io-design.md` (D-091) |

## Non-goals (this slice)

- Fund ledger transfers (still topology-only)
- Enabling HFT / live crypto without gates
- Replacing job handlers with v1 `run_nodes` interpreter
- Pixel office canvas
