# Market posture synthesis hub (D-120)

**Date:** 2026-07-18  
**Status:** implemented

## Intent

Operator **Analyze** creates a durable synthesis **run** with ordered **stages**. Posture → **Model** becomes a live React Flow hub: every stage shows queued/running/succeeded/failed with text-first status and Justification lines. Equity live poll (D-112) stays paused during Analyze POST only; synthesis progress polls separately (~1.5s).

## Stage vocabulary

`providers` → `gather` → `thresholds`|`defaults` → `universe` → `rs` → `rank` → `verify` → `seal_movers` → `sector` → `daily` → `narrative` → `hub_ready`

## Data

- `market_hub_synthesis_runs` — company-scoped run status
- `market_hub_synthesis_stages` — one row per stageId per run (upsert status)

## API

- `POST …/market-hub/analyze` → `{ runId, jobs, … }` (short optional drain; UI polls run)
- `GET …/market-hub/synthesis/latest`
- `GET …/market-hub/synthesis/[runId]`

## Jobs

Enqueue with `synthesisRunId`: movers, sector, daily (`forceReseal`), then `library.posture_narrative`. Handlers emit stage boundaries via `recordSynthesisStage`.

## Safety

No secrets in payloads. LLM narrative leak-linted; bands/text only in stage summaries.
