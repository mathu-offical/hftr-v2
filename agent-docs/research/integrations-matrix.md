# Integrations matrix (hftr-v2)

Provider inventory across domains: auth, implementation, live posture, smoke, docs.
Updated 2026-07-17 (D-046, D-048, D-050).

**Decisions:** D-027 (user keys), D-039 (research gather), D-031 (live gate),
D-046 (direct market/news), D-048 (multi-domain registry), D-050 (GDELT/Twelve/Marketstack
+ research verify + live_api Alpaca poll).

**Registry:** `packages/contracts/src/research-source-registry.ts` —
`selectReadySourceKinds` auto-selects every *shipped* source with satisfied auth.
Gather fans out via isolated `Promise.all`. Max explicit `sourceKinds`: **24**.

## Gather domains (all shipped unless noted)

| Domain | Sources | Auth |
|--------|---------|------|
| web_search | `brave_search` | research key |
| filings | `sec_edgar` | none |
| news | `market_news`, `alpha_vantage_news`, `gdelt_news` | key / key / none |
| equity_news | `alpaca_news`, `finnhub_news`, `polygon_news` | paper broker / keys |
| equity_bars | `alpaca_bars`, `twelve_data`, `marketstack` | paper / keys (qualitative entitlement only) |
| fx | `frankfurter_fx` | none |
| crypto | `coingecko_crypto` | none |
| macro | `fred_macro`, `world_bank_indicator` | key / none |
| internal | `catalog`, `library`, `operator` | explicit only |

Evidence is leak-linted — never raw OHLC/FX/quote digits in model-facing text.

## Research key verify (Settings)

`POST /api/settings/research-keys/{provider}/verify` via `apps/web/lib/research-verify.ts`.
Providers: brave, market_news, finnhub, polygon, fred, alpha_vantage, twelve_data, marketstack.
Saved key or draft (≥8 chars). Returns `{ ok, failure }` — no plaintext.

## live_api → trend quotes (D-050)

When `live_api→trend` edges exist and company has **Alpaca paper** binding,
`trend.scan` uses `pollQuotes()` for up to 8 IEX quotes (`feedClass: alpaca_iex_paper`).
Otherwise `synthetic_sim`. Lookback comparison still synthetic (bars path separate).

## LLM + broker

| Provider | Status | Smoke |
|----------|--------|-------|
| Anthropic / Mistral / Groq / Cerebras / Fireworks / OpenRouter | shipped | `pnpm smoke:llm` |
| Alpaca paper | shipped | `pnpm smoke:alpaca-paper` |
| Alpaca live | fail-closed | manual |
| Kalshi / Polymarket | stub M3/M4 | — |

## Live / streaming candidates (not trading path)

Alpaca / Finnhub / Polygon WebSockets — researched only. Research gather stays REST fan-out.

## Smoke

| Flag | Script |
|------|--------|
| `HFTR_LLM_SMOKE=1` | `pnpm smoke:llm` |
| `HFTR_RESEARCH_SMOKE=1` | `pnpm smoke:research` (public + keyed; GDELT rate_limited = ok) |
| `ALPACA_PAPER_SMOKE=1` | `pnpm smoke:alpaca-paper` |

## Pointers

| Area | Path |
|------|------|
| Registry | `packages/contracts/src/research-source-registry.ts` |
| Gather | `packages/adapters/src/research/gather.ts` |
| Research verify | `apps/web/lib/research-verify.ts` |
| live_api poll | `packages/engine/src/live-api/poll-quotes.ts` |
| Skill | `.cursor/skills/external-integrations/SKILL.md` |
