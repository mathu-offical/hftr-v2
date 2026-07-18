# Integrations matrix (hftr-v2)

Provider inventory: auth mode, implementation status, smoke commands, and official docs.
Updated 2026-07-17 (D-046).

**Decisions:** D-027 (LLM/broker user keys), D-039 (research gather), D-031 (live gate),
D-046 (direct market/news gather sources).

## Summary

| Provider | Category | Runtime auth | Status | Smoke | Docs |
|----------|----------|--------------|--------|-------|------|
| Anthropic | LLM (strategic) | `user_api_keys` | shipped | `pnpm smoke:llm` | https://docs.anthropic.com |
| Mistral | LLM (tactical/assistant) | `user_api_keys` | shipped | `pnpm smoke:llm` | https://docs.mistral.ai |
| Groq | LLM (execution compile) | `user_api_keys` | shipped | `pnpm smoke:llm` | https://console.groq.com/docs |
| Cerebras | LLM (alt execution/tactical) | `user_api_keys` | shipped | `pnpm smoke:llm` | https://inference-docs.cerebras.ai |
| Fireworks | LLM (alt) | `user_api_keys` | shipped | `pnpm smoke:llm` | https://docs.fireworks.ai |
| OpenRouter | LLM (ZDR routing) | `user_api_keys` | shipped | `pnpm smoke:llm` | https://docs.openrouter.ai |
| Alpaca paper | Broker + IEX quotes/bars | `broker_connections` | shipped (M2) | `pnpm smoke:alpaca-paper` | https://docs.alpaca.markets |
| Alpaca live | Broker | `broker_connections` + live gate | fail-closed | manual only | https://docs.alpaca.markets |
| Alpaca news | Research gather | paper Alpaca broker creds | shipped (D-046) | `pnpm smoke:research` | https://docs.alpaca.markets/reference/news-1 |
| Alpaca bars (research) | Research gather (qualitative) | paper Alpaca broker creds | shipped (D-046) | unit tests | `packages/adapters/src/research/alpaca-bars-evidence.ts` |
| Brave Search | Research gather | `user_research_keys` (`brave`) | shipped | `pnpm smoke:research` | https://api.search.brave.com/app/documentation |
| Marketaux | Research gather (news) | `user_research_keys` (`market_news`) | shipped | `pnpm smoke:research` | https://www.marketaux.com/documentation |
| Finnhub | Research gather (news) | `user_research_keys` (`finnhub`) | shipped (D-046) | `pnpm smoke:research` | https://finnhub.io/docs/api/company-news |
| Polygon.io | Research gather (news) | `user_research_keys` (`polygon`) | shipped (D-046) | `pnpm smoke:research` | https://polygon.io/docs/stocks/get_v2_reference_news |
| SEC EDGAR | Research gather (filings) | none (public) | shipped | N/A | https://www.sec.gov/edgar/search-and-access |
| paper_sim | Internal broker | N/A | shipped | unit tests | `architecture/broker-integration.md` |
| Kalshi | Broker | planned M3 | stub | — | https://docs.kalshi.com |
| Polymarket | Broker | planned M4 | stub | — | https://docs.polymarket.com |
| Stripe | Billing | platform secret | deferred (M4) | — | https://docs.stripe.com |

## Auth modes

### User settings (production)

| Secret type | Table | Encryption key | UI surface |
|-------------|-------|----------------|------------|
| LLM API keys | `user_api_keys` | `SETTINGS_ENCRYPTION_KEY` | User settings → LLM providers |
| Research keys | `user_research_keys` | `SETTINGS_ENCRYPTION_KEY` | User settings → Research |
| Broker credentials | `broker_connections` | `CREDENTIALS_ENCRYPTION_KEY` | User settings → Brokers |

Verify flows decrypt server-side and ping provider (never return plaintext to client).

### Environment (CI / smoke only)

Deployment env vars **do not** authorize runtime calls (D-027).

| Flag | Script | Purpose |
|------|--------|---------|
| `HFTR_LLM_SMOKE=1` | `scripts/smoke-llm-providers.mjs` | Models-list / format verify per present `*_API_KEY` |
| `HFTR_RESEARCH_SMOKE=1` | `scripts/smoke-research-sources.mjs` | Brave, Marketaux, Alpaca news, Finnhub, Polygon |
| `ALPACA_PAPER_SMOKE=1` | `scripts/smoke-alpaca-paper.mjs` | Alpaca paper adapter vitest smoke |

Without flags, scripts exit 0 with `skip:`.

## Env variable map (smoke)

| Variable | Provider | Alias |
|----------|----------|-------|
| `ANTHROPIC_API_KEY` | Anthropic | — |
| `MISTRAL_API_KEY` | Mistral | — |
| `GROQ_API_KEY` | Groq | — |
| `CEREBRAS_API_KEY` | Cerebras | — |
| `FIREWORKS_API_KEY` | Fireworks | — |
| `OPENROUTER_API_KEY` | OpenRouter | — |
| `BRAVE_API_KEY` | Brave | — |
| `MARKETAUX_API_KEY` | Marketaux | `MARKET_NEWS_API_KEY` |
| `FINNHUB_API_KEY` | Finnhub | — |
| `POLYGON_API_KEY` | Polygon | — |
| `ALPACA_PAPER_KEY` | Alpaca | `ALPACA_PAPER_KEY_ID` |
| `ALPACA_PAPER_SECRET` | Alpaca | — |

Manifest: `packages/contracts/src/env.ts` (kept in sync with `.env.example` by test).

## Implementation pointers

| Area | Path |
|------|------|
| LLM verify | `apps/web/lib/llm-verify.ts` |
| LLM transport | `packages/llm/src/providers.ts` |
| LLM contracts | `packages/contracts/src/llm.ts` |
| Brave gather | `packages/adapters/src/research/brave-search.ts` |
| Market news | `packages/adapters/src/research/market-news.ts` |
| Finnhub news | `packages/adapters/src/research/finnhub-news.ts` |
| Polygon news | `packages/adapters/src/research/polygon-news.ts` |
| Alpaca news | `packages/adapters/src/alpaca/news.ts` |
| Alpaca bars evidence | `packages/adapters/src/research/alpaca-bars-evidence.ts` |
| Gather orchestrator | `packages/adapters/src/research/gather.ts` |
| Alpaca adapter | `packages/adapters/src/alpaca/` |
| Settings API | `apps/web/app/api/settings/` |
| Operator runbook | `agent-docs/ops/runbook.md` |
| Cursor skill | `.cursor/skills/external-integrations/SKILL.md` |

## Related

- `architecture/broker-integration.md` — venue rollout and funding UX
- `architecture/llm-pipeline.md` — tier boundary and gather placement
- `research/tech-decisions.md` — TD-08 brokers, TD-11 market data
