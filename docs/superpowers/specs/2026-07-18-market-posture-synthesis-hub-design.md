# Market posture synthesis hub (D-120)

**Date:** 2026-07-18  
**Status:** implemented (awareness dock + gated narrative)

## Intent

Operator **Analyze** creates a durable synthesis **run** with ordered **stages**. Posture → **Model** is a live React Flow **hydration hub** (D-147 / D-156 / D-162 / D-163): only **available** API providers and admitted libraries appear; each route has its own **process chain** (fetch→normalize→analyze) into analysis stages; **capital fund rows** show as CAP data sources with inline dollar amounts; shared compound bridges sit between stage milestones; then pipeline stages animate from the run. Baseline awareness dock remains (movers status, multi-seal freshness, report/narrative open). Equity live poll (D-112) stays paused during Analyze POST only; synthesis progress polls separately (~1.5s).

## Hydration graph (D-147 / D-156 / D-160 / D-162 / D-163)

- **Layers:** `sources` → `adapters` → `pipeline` → `output`
- **Tracks:** `entitle` | `compound` | `sector` | `daily` | `compose` — **filtered to capabilities** of available providers (missing-key/stub lanes omitted from the diagram); laid out as **vertical lanes** with labels and wider column gaps (D-165)
- **Data sources:** live SRC + library LIB + capital CAP nodes (fund allocation readouts)
- **Node chrome:** track-colored top bar + role badge + layer id; legend lists tracks and types
- **Live sources** → **per-kind adapters** → **route-granular process steps** → stage milestones (not a single dump into `gather`)
- Examples: GDELT → `news_headline` fetch/normalize/tickers/corroborate → `gather`/`universe`/`sector`; Alpaca bars → `bars_entitle` **and** `bars_ohlc` (fetch/RS/volume) → `rs`/`rank`; libraries → `library_jaccard` load/fit → `thresholds`/`rank`/`seal_movers`
- **Shared compound bridges (D-162):** stage → `providers_entitle` / `thresholds_llm` / `universe_build` / `compound_rank` / `verify_promote` / `sector_bulletin` / `daily_phase` / `narrative_compose` → stage (sector/daily bridges only when those tracks are active)
- Hub projects `modelHydration.processingFlows[]` + `processSteps[]` + `capitalSources[]` plus `asOfIso` + `sealStamps` for refresh/stale detection
- **Edges** carry `edgeType` (`hydrate`|`adapt`|`pipeline`|`entitle`|`corpus`|`parallel`|`panel`), `activation` (`idle`|`armed`|`active`|`pulsing`|`blocked`|`stale`), `status`, and `track` — canvas styles stroke/dash/animation from these; Sync/Analyze pulse hydrate + pipeline edges when `asOfIso` or stage signature changes; **live poll** patches `panelSurfaces` + `livePatchedAt` without bumping `asOfIso` (panel-only pulse)
- **Panel surfaces (D-161 / D-163):** `hub_ready` / seal stages hydrate into operator boards; capital/equity/positions are **capitalBearing** with hub-resolved `$` amounts
- Pipeline stages still carry baseline ops from `stageOps`; run summary counts override stage amount labels when present
- Stage IDs remain the synthesis-run vocabulary; granular process nodes are Model visualization only

## Stage vocabulary

`providers` → `gather` → `thresholds`|`defaults` → `universe` → `rs` → `rank` → `verify` → `seal_movers` → (∥ `sector`, `daily`) → `narrative` → `hub_ready`

Movers/sector/daily enqueue in parallel; narrative **waits** for those stage rows to go terminal before composing.

## Narrative

Deterministic seal-grounded rollup with **book↔tape** crosswalk (held / watch / pipeline vs movers symbols). Upserts `posture_synthesis_narrative` concept. Projected into hub `reports` as `posture_narrative` and `synthesis` snapshot. LLM narrative deferred.

## Data

- `market_hub_synthesis_runs` — company-scoped run status
- `market_hub_synthesis_stages` — one row per stageId per run (upsert status)

## API

- `POST …/market-hub/analyze` → `{ runId, jobs, … }` (short optional drain; UI polls run)
- `GET …/market-hub/synthesis/latest`
- `GET …/market-hub/synthesis/[runId]`
- `GET …/market-hub` includes `synthesis` + narrative report link + sector/daily freshness

## Safety

No secrets in payloads. Narrative is deterministic / leak-safe (bands + symbols only).
