# Integrations matrix (hftr-v2)

Provider inventory across domains: auth, implementation, live posture, smoke, docs.
Updated 2026-07-17 (D-046, D-048).

**Decisions:** D-027 (user keys), D-039 (research gather), D-031 (live gate),
D-046 (direct market/news), D-048 (multi-domain registry + free/open fan-out).

**Registry (code):** `packages/contracts/src/research-source-registry.ts` —
`selectReadySourceKinds` chooses every *shipped* source whose auth is satisfied
(public / research key / paper Alpaca). Gather fans out with `Promise.all`
(per-source errors isolated). Max explicit `sourceKinds`: **24**.

## Gather domains (research evidence)

| Domain | Shipped sources | Auth | Notes |
|--------|-----------------|------|-------|
| web_search | `brave_search` | research key | Brave |
| filings | `sec_edgar` | none | SEC EDGAR + data.sec.gov |
| news | `market_news`, `alpha_vantage_news` | research key | Marketaux; AV NEWS_SENTIMENT |
| equity_news | `alpaca_news`, `finnhub_news`, `polygon_news` | broker paper / keys | Honest feed classes |
| equity_bars | `alpaca_bars` | broker paper | Qualitative entitlement only |
| fx | `frankfurter_fx` | none | ECB reference via frankfurter.dev `/v2/rates` |
| crypto | `coingecko_crypto` | none | Markets list; prices redacted |
| macro | `fred_macro`, `world_bank_indicator` | FRED key / none | Series titles only; no observation digits |
| news (global) | `gdelt_news` | none | **stub** — DOC API verified then 429; backoff pending |
| equity_bars (alt) | `twelve_data`, `marketstack` | researched | Not wired |
| internal | `catalog`, `library`, `operator` | N/A | Explicit request only |

Evidence titles/summaries are always leak-linted — **never** raw OHLC, FX rates, or quote levels.

## LLM + broker (runtime)

| Provider | Category | Runtime auth | Status | Smoke | Docs |
|----------|----------|--------------|--------|-------|------|
| Anthropic | LLM strategic | `user_api_keys` | shipped | `pnpm smoke:llm` | https://docs.anthropic.com |
| Mistral | LLM tactical | `user_api_keys` | shipped | `pnpm smoke:llm` | https://docs.mistral.ai |
| Groq | LLM compile | `user_api_keys` | shipped | `pnpm smoke:llm` | https://console.groq.com/docs |
| Cerebras / Fireworks / OpenRouter | LLM alt | `user_api_keys` | shipped | `pnpm smoke:llm` | provider docs |
| Alpaca paper | Broker + IEX | `broker_connections` | shipped | `pnpm smoke:alpaca-paper` | https://docs.alpaca.markets |
| Alpaca live | Broker | live gate | fail-closed | manual | https://docs.alpaca.markets |
| paper_sim | Internal | N/A | shipped | unit | broker-integration.md |
| Kalshi / Polymarket | Broker | M3/M4 | stub | — | venue docs |
| Stripe | Billing | platform | deferred M4 | — | https://docs.stripe.com |

## Free / open data — verified this session

| Source | Probe | Result | Product posture |
|--------|-------|--------|-----------------|
| Frankfurter `/v2/rates?base=USD` | HTTP | **200** | shipped gather |
| Frankfurter `/v2/latest` | HTTP | **404** | do not use |
| CoinGecko `/api/v3/ping` + markets | HTTP | **200** | shipped gather |
| World Bank `/v2/indicator` | HTTP | **200** | shipped gather |
| FRED series API | HTTP | **400** without real key (shape OK) | shipped + settings key |
| Alpha Vantage NEWS_SENTIMENT | HTTP | **200** demo notice | shipped + settings key |
| SEC `data.sec.gov` | HTTP | **200** | shipped |
| GDELT DOC ArtList | HTTP | **200** then **429** | stub until backoff |
| Twelve Data / Marketstack | docs | free tier exists | researched only |

## Live / streaming feed candidates (not yet product-wired)

| Feed | Mode | Auth | Status | Use when |
|------|------|------|--------|----------|
| Alpaca market data WS | websocket | broker keys | researched | live quotes after live gate |
| Finnhub WS trades/news | websocket | finnhub key | researched | optional live desk |
| Polygon WS | websocket | polygon key | researched | paid entitlement |
| CoinGecko REST poll | rest_poll | none | shipped (research) | crypto breadth, not tick trading |
| Frankfurter daily | rest_poll | none | shipped | FX reference, not L1 forex |

Live trading quotes remain on the **broker adapter path** with honest `feedClass`. Research gather is REST fan-out + qualitative evidence only.

## Auth modes

| Secret | Table | Encryption | UI |
|--------|-------|------------|-----|
| LLM | `user_api_keys` | `SETTINGS_ENCRYPTION_KEY` | Settings → LLM |
| Research | `user_research_keys` | same | Settings → Research (Brave, Marketaux, Finnhub, Polygon, FRED, Alpha Vantage) |
| Broker | `broker_connections` | `CREDENTIALS_ENCRYPTION_KEY` | Settings → Brokers |

Env keys authorize **smoke only** (D-027).

## Smoke

| Flag | Script |
|------|--------|
| `HFTR_LLM_SMOKE=1` | `pnpm smoke:llm` |
| `HFTR_RESEARCH_SMOKE=1` | `pnpm smoke:research` (Frankfurter, CoinGecko, World Bank always; keyed sources when present) |
| `ALPACA_PAPER_SMOKE=1` | `pnpm smoke:alpaca-paper` |

## Implementation pointers

| Area | Path |
|------|------|
| Source registry | `packages/contracts/src/research-source-registry.ts` |
| Gather + credential bag | `packages/adapters/src/research/gather.ts` |
| Free adapters | `frankfurter-fx`, `coingecko-crypto`, `fred-macro`, `alpha-vantage-news`, `world-bank-indicator` |
| Skill | `.cursor/skills/external-integrations/SKILL.md` |
| Workflow | `.cursor/workflows/credentialed-integrations.md` |

## Related

- TD-11 market data — `research/tech-decisions.md`
- Broker rollout — `architecture/broker-integration.md`
- Number handling — evidence must stay digit-safe for model paths
