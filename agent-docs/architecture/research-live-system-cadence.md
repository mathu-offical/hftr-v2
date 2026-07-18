# Live system library cadence

Schedules and gather/normalize flow for system-curated folders. Decisions: **D-070**, **D-072**,
**D-098** (POSTURE_RESEARCH lane), **D-103** (provider honesty), **D-111** (Analyze vs Sync),
**D-112** (live vs static hub UI), **D-120** (synthesis hub stages).

## Registry scopes

| topicScope | Job kind | Cadence (v1) | Live inputs |
|------------|----------|--------------|-------------|
| `system:movers` | `library.system_movers` | `every:1440` + **Analyze** (`forceReseal`) | Entitled provider lanes + optional tactical LLM thresholds |
| `system:sector_news` | `library.system_sector_news` | `every:1440` + Analyze | GDELT / news / web via ready lanes |
| `system:daily_summaries` | `library.system_daily_summaries` | `every:1440` × 4 phases + Analyze | Seals + sector bulletins |
| `system:execution_logs` | bootstrap only | — | Future dispatch traces |
| `system:runtime_policies` | bootstrap only | — | Future policy emits |
| `system:trend_lists` | bootstrap only | — | Future trend module |

Analyze also enqueues `library.posture_narrative` (seal-grounded narrative / hub_ready) after
the three reseal jobs.

## Operator Analyze vs UI Sync (D-111 / D-112 / D-120)

| Action | Transport | Backend | UI |
|--------|-----------|---------|-----|
| **Live poll** | `GET …/market-hub/live` ~15s | Equity + position marks only | Silent merge; no Syncing…; **one interval per company** (rail+overlay share) |
| **Sync** | `GET …/market-hub` force | Full projection | Syncing… |
| **Analyze** | `POST …/market-hub/analyze` | Create synthesis run; enqueue movers+sector+daily (`forceReseal` + `synthesisRunId`) + narrative; short drain; return `runId` | Analyzing… during POST; live poll paused only for POST |
| **Synthesis poll** | `GET …/market-hub/synthesis/{runId\|latest}` ~1.5s | Run + ordered stages | Model hub live status; overlay mini strip; full hub refresh on terminal |

UI refresh never enqueues posture jobs. Live poll is orthogonal to the job queue — Analyze
drain proceeds whether or not the overlay interval is armed. Synthesis poll does not replace
seals until stages complete + one full hub GET. Trend scan/promote may still
enqueue `library.system_movers` on their own queues independently of the poll timer.

## Query plan (model-free)

`buildResearchQueryPlan({ topicScope, topicSectors, queryText, symbols, cadence })` → per-`ResearchSourceKind` query strings. Models never invent provider queries or tickers without deterministic lookup.

## Filter stages

1. Gather (cap + entitlement / ready lanes)
2. Dedup (digest + SimHash Hamming ≤3)
3. Sector / credibility / freshness / corroboration gates
4. **Verified normalize** → seal (`VerifiedNormalizedBundle`)
5. Dual persist: normalized view + readable report concept
6. Synthesize only when seal missing/expired or for librarian repair — evidence- or seal-grounded

## Feed honesty

Movers gather: entitled lanes only (D-103). Position marks in hub: `synthetic_sim` until live broker marks. Public stubs never auto-seal.
