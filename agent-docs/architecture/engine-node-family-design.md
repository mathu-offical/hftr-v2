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
5. Execution ENGINEs use the **full spine**; research ENGINEs are specialized by research type;
   **simulation ENGINEs (D-189)** are bespoke paper gate/train/adhoc desks; Math is typed by
   consumer need.

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

**Dual research paths (D-191):** execution ENGINEs keep an **inline specialty research** spine
member at the start of the full spine (`research` → librarian → library → …) for **internal**
desk gathering. Child research ENGINEs from `EXECUTION_ENGINE_RESEARCH_DEPENDENCIES` are
separate family deps (left column) whose analyzer emit hydrates the parent **Engine Data Hub**.
Subtype overlap between inline and child packs is intentional — do not strip inline research
when refining packs or hub binding (extends D-153 / D-157 / D-184).

**Engine Data Hub compound shelves (D-216):** one hub per execution engine is the full resource
surface (source = owning execution). Shelves: origin × stream; optional per-shelf `data_out`;
live topic feed. Child sim ENGINEs terminate with dual direct + analyzed analyzers into
`sim_training` shelves.

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
| `microstructure_context` | Quote/flow toxicity, imbalance, microstructure narrative (D-157) |
| `event_catalyst` | Earnings/events/macro |
| `crypto_onchain_context` | Crypto narrative (not prices) |
| `prediction_niche` | Prediction niche sources |

Generated canvas Fn tokens (`moduleFunctionLabel`) map these subtypes to distinct short labels
(e.g. `MktNews`, `Filings`, `Catalyst`, `CryptoCtx`) so duplicate research nodes in one ENGINE
never share the same default function identity. Libraries use `libraryClass` → `TopicLib` /
`SpecLib` / …; analyzers use `emitMode` → `Concat` / `ExecMon` / `LibEmit`.

## Librarian subtypes (`librarian.config.librarianSubtype`)

| Subtype | Role |
|---------|------|
| `librarian_relevance` | Generic multi-metric relevance + topic hygiene |
| `librarian_seed_keeper` | Protect/refresh compile-time seeded mechanism libraries |
| `librarian_web_fabric` | Web fabric topic hygiene |
| `librarian_filings_hygiene` | SEC/filings fundamentals hygiene |
| `librarian_event_triage` | Event/catalyst triage |
| `librarian_regime_context` | Regime / session macro context |
| `librarian_crypto_narrative` | Crypto narrative / on-chain context |
| `librarian_prediction_odds` | Prediction niche odds hygiene |
| `librarian_desk_session` | Intraday desk session evidence |
| `librarian_microstructure` | Microstructure / quote-quality evidence |

## Library classes (`library.config.libraryClass`)

`seeded_mechanisms` | `topic_runtime` | `market_history` | `runtime_market_cache` | `runtime_app_logs` | `specialty_evidence` | `master_graph`

## Math types (`math.config.mathType`)

| Type | Purpose | Typical attach |
|------|---------|----------------|
| `company_hub` | Shared company calculator | Always seeded |
| `fund_path` | Capital topology | owned by fund_router; holding ↔ router fund_route (D-221) |
| `desk_execution` | Desk sizing / compile inputs | trading |
| `trend_signal` | Live→signal morphs (refs) | trend |
| `research_metric` | Research scores/ranking refs | research / librarian |
| `analyzer_reconcile` | Fill/ledger reconcile | analyzer |
| `simulator_sandbox` | Sim-scoped calc | simulator |
| `session_calendar` | Clock/calendar session math | company / policy-adjacent |

Dedicated Math ownership (D-033) maps owner → preferred `mathType` when provisioning tools.

## Simulation ENGINE specializations (D-189)

| Template | Placement / role | Purpose |
|----------|------------------|---------|
| `sim_gate_strategy_spread` | `pre` / gate | Parallel strategy-spread paper runs → influence parent |
| `sim_train_policy_replay` | `post` / training | Parent policy replay → hub feedback |
| `sim_adhoc_paper_desk` | adhoc | Standalone paper desk; promotable later via live gates |

Create section: `simulation`. Defaults: execution add seeds two children (overridable).
Binding: `setup_snapshot.simulationBinding`. Paper/funds_only by default. Family canvas
placement (`pre` gate left of exec, `post` training after exec) is target layout under
D-189 / D-191 refinement.

## Execution ENGINE specialties (full spine)

Same topology; specialty remaps defaults only. Each execution ENGINE seeds **inline specialty
research** at spine start **and** (via `EXECUTION_ENGINE_RESEARCH_DEPENDENCIES`) child research
packs that hydrate the parent Engine Data Hub (D-191 dual path).

`inline research` → librarian → library → `live_api` → `trend` → `trading` → `policy` + funds via Math + `analyzer`
(+ child research ENGINEs left → hub)

| Specialty | `trading.subtype` | Availability |
|-----------|-------------------|--------------|
| day_trading | `day` | available |
| crypto | `crypto` | gated on session envelope |
| prediction | `prediction` | available (live venue gated) |
| long_term | `long_term` | available (new template) |
| hft | `hft` | available (paper; `engine_hft` + microstructure lab, D-157) — live fail-closed |
| custom | `custom` | generator / manual |

## Research ENGINE specializations

| Id | Mode | Purpose modules (D-224) |
|----|------|-------------------------|
| `research_web_fabric` | pure_data | web curator + `librarian_web_fabric` → topic libs |
| `research_filings_fundamentals` | pure_data | filings + `librarian_filings_hygiene` + extract pipeline |
| `research_seed_mechanisms` | pure_data | `librarian_seed_keeper` → seeded_mechanisms |
| `research_event_catalyst` | pure_data | catalyst + `librarian_event_triage` + window pipeline |
| `research_market_regime_lab` | market_trend | market news + desk specialty + `librarian_regime_context` + live + trend |
| `research_crypto_context` | market_trend | crypto + market news + `librarian_crypto_narrative` + live + trend |
| `research_prediction_niche` | market_trend | prediction + event + `librarian_prediction_odds` + live + trend |
| `research_desk_aligned` | market_trend | specialty_desk + `librarian_desk_session` + session trend |
| `research_multi_curator` | picker | web/filings/news curators + fabric librarian + dual libraries |
| `research_microstructure_lab` | market_trend | microstructure + news + `librarian_microstructure` + high-cadence bars |

Each pack locks `research_subtype` / `librarian_subtype` / purpose pipeline stages and stamps
`connectionMode` (D-222 emit vs route) on decision seeds.

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
- Enabling **live** HFT / live crypto without gates (paper HFT spine is available per D-157)
- Replacing job handlers with v1 `run_nodes` interpreter
- Pixel office canvas
- Colocated / sub-ms HFT claims (retail-API framing only)
