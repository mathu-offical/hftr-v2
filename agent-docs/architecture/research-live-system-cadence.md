# Live system library cadence

Schedules and gather/normalize flow for system-curated folders. Decisions: **D-070**, **D-072**,
**D-098** (POSTURE_RESEARCH lane), **D-103** (provider honesty), **D-111** (Analyze vs Sync),
**D-112** (live vs static hub UI), **D-120** (synthesis hub stages), **D-181** / **D-183**
(analyze cadence + movement auto-trigger).

## Registry scopes

| topicScope | Job kind | Cadence (v1) | Live inputs |
|------------|----------|--------------|-------------|
| `system:movers` | `library.system_movers` | `every:1440` + **Analyze** (`forceReseal`) + movement auto | Entitled provider lanes + optional tactical LLM thresholds |
| `system:sector_news` | `library.system_sector_news` | `every:1440` + Analyze | GDELT / news / web via ready lanes |
| `system:daily_summaries` | `library.market_hub_analyze` → daily seal | `et:HH:MM` × **10** slots | Full Analyze (movers+sector+daily+narrative) |
| `system:execution_logs` | bootstrap only | — | Future dispatch traces |
| `system:runtime_policies` | bootstrap only | — | Future policy emits |
| `system:trend_lists` | bootstrap only | — | Future trend module |

Analyze also enqueues `library.posture_narrative` (seal-grounded narrative / hub_ready) after
the three reseal jobs.

## Operator Analyze vs UI Sync (D-111 / D-112 / D-120 / D-183)

| Action | Transport | Backend | UI |
|--------|-----------|---------|-----|
| **Live poll** | `GET …/market-hub/live` ~15s | Equity + position marks only | Silent merge; no Syncing…; **one interval per company** (rail+overlay share) |
| **Sync** | `GET …/market-hub` force | Full projection | Syncing… |
| **Analyze** | `POST …/market-hub/analyze` | Resolve **current-moment** `MarketHubAnalyzePhase` (clock + XNYS); create synthesis run; enqueue movers+sector+daily (`forceReseal` + phase + `synthesisRunId`) in parallel + narrative; short drain; return `runId` + `analyzePhase` | Analyzing… during POST; live poll paused only for POST; phase label on overlay |
| **Scheduled Analyze** | `library.market_hub_analyze` via `et:HH:MM` | Same enqueue path as manual (`reason=schedule`) | — |
| **Movement Analyze** | Auto from movers scan | Diversified band/families gate + cooldown; `reason=movement` | — |
| **Synthesis poll** | `GET …/market-hub/synthesis/{runId\|latest}` ~1.5s | Run + ordered stages | Model hub live status; overlay mini strip; full hub refresh on terminal |

### Analyze schedule slots (D-183)

Distinct from calendar `SessionPhase` (dispatch/RTH). Wall-clock America/New_York triggers
bootstrap as `et:HH:MM` schedules; Analyze button uses `resolveAnalyzePhase(session, nowMs)`.
Each slot carries `gatherBias`, `focusAreas`, and `queryHints` for timing-tailored gather/reports.

| Phase | ET trigger | Intent |
|-------|------------|--------|
| `overnight` | 22:00 | Asia/Europe spillover + overnight news |
| `wake_up` | 05:00 | Previous night summary |
| `pre_market` | 07:30 | Morning news / other TZs / condition data |
| `open_bell` | 09:35 | Open print / gap reaction |
| `mid_morning` | 10:30 | Initial RTH movements |
| `midday` | 12:00 | Progress check-in + strategy alignment |
| `afternoon` | 14:00 | Pre-close exits / pre-close analysis |
| `power_hour` | 15:05 | Final-hour liquidity / exit pressure |
| `market_close` | 16:05 | Full day summary |
| `evening` | 18:30 | News grounded in market-day movements |

Seal subject keys: `phase_{analyzePhase}` under kind `daily_summary_phase`. Legacy four-slot
tags (`pre_open` / `close` / `post_analysis`) normalize onto this vocabulary.

### Movement auto-analyze (D-183)

After a non-Analyze movers scan (e.g. daily movers schedule / trend side-effect), compare
current compound scores to the prior seal across diversified families (leadership, volume,
link coverage, news+macro pair, trend alignment, corroboration, breadth). Trigger full Analyze
when ≥3 families fire and cooldown (default 30m since last synthesis run) has elapsed.

### Diversified market-state sources (baseline)

Movers compound draws from entitled news/filings/web, macro/FX/crypto, bars (RS vs SPY),
library corpus, trends, open book, sector-focus peer ETFs, and liquid breadth anchors
(SPY/QQQ/IWM/DIA/sector ETFs/GLD/TLT). `macroLinkBand` participates in compound rank.

Narrative upserts `posture_synthesis_narrative` (book↔tape rollup) and hub GET projects `synthesis` + `posture_narrative` report. Model tab includes an awareness dock (movers / freshness / report buttons).

UI refresh never enqueues posture jobs. Live poll is orthogonal to the job queue — Analyze
drain proceeds whether or not the overlay interval is armed. Synthesis poll does not replace
seals until stages complete + one full hub GET. Trend scan/promote may still
enqueue `library.system_movers` on their own queues independently of the poll timer.

## Query plan (model-free)

`buildResearchQueryPlan({ topicScope, topicSectors, queryText, symbols, cadence })` → per-`ResearchSourceKind` query strings. Models never invent provider queries or tickers without deterministic lookup. Analyze phase supplies timing-biased `queryText`.
