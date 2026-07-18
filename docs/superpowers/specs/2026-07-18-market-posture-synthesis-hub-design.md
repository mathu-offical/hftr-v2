# Market posture synthesis hub (D-120)

**Date:** 2026-07-18  
**Status:** implemented (awareness dock + gated narrative)

## Intent

Operator **Analyze** creates a durable synthesis **run** with ordered **stages**. Posture → **Model** is a live React Flow hub **plus** a baseline awareness dock (movers status, multi-seal freshness, report/narrative open). Equity live poll (D-112) stays paused during Analyze POST only; synthesis progress polls separately (~1.5s).

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
