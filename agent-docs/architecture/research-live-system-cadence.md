# Live system library cadence

Schedules and gather/normalize flow for system-curated folders. Decisions: **D-070**, **D-072**.

## Registry scopes

| topicScope | Job kind | Cadence (v1) | Live inputs |
|------------|----------|--------------|-------------|
| `system:movers` | `library.system_movers` | `every:1440` | Alpaca paper quotes/bars (+ optional news corroboration) |
| `system:sector_news` | `library.system_sector_news` | `every:1440` | GDELT / Alpha Vantage / Brave via `ResearchQueryPlan` |
| `system:daily_summaries` | `library.system_daily_summaries` | `every:1440` × 4 phases (`pre_open`, `midday`, `close`, `post_analysis`); calendar-phase fallback when payload omits `phase` | Seals + sector bulletins |
| `system:execution_logs` | bootstrap only | — | Future dispatch traces |
| `system:runtime_policies` | bootstrap only | — | Future policy emits |
| `system:trend_lists` | bootstrap only | — | Future trend module |

## Query plan (model-free)

`buildResearchQueryPlan({ topicScope, topicSectors, queryText, symbols, cadence })` → per-`ResearchSourceKind` query strings. Models never invent provider queries or tickers without deterministic lookup.

## Filter stages

1. Gather (cap + entitlement)
2. Dedup (digest + SimHash Hamming ≤3)
3. Sector / credibility / freshness / corroboration gates
4. **Verified normalize** → seal (`VerifiedNormalizedBundle`)
5. Dual persist: normalized view + readable report concept
6. Synthesize only when seal missing/expired or for librarian repair — evidence- or seal-grounded

## Feed honesty

Movers: `feedClass: alpaca_iex_paper`. Live Alpaca blocked until arming gates. Public stubs never auto-seal.
