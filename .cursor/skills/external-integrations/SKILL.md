---
name: external-integrations
description: Wire and verify Alpaca, LLM providers, and multi-domain research sources (Brave, Marketaux, Finnhub, Polygon, FRED, Alpha Vantage, Frankfurter, CoinGecko, World Bank, SEC) in hftr-v2. Covers RESEARCH_SOURCE_REGISTRY, credential-ready fan-out, smoke vs runtime auth, and IronBee settings verification.
---

# External integrations (hftr-v2)

How to connect third-party services without breaking safety invariants.

## When to use

- Adding or changing broker adapters (`packages/adapters`)
- LLM provider transport or settings (`packages/llm`, `apps/web/app/api/settings`)
- Research gather sources (`packages/adapters/src/research`)
- Extending `RESEARCH_SOURCE_REGISTRY` / free-open fan-out (D-048)
- CI / operator smoke for credentialed connectivity

## Any-source fan-out (D-048)

1. Register the source in `packages/contracts/src/research-source-registry.ts`
   (domain, authMode, implementation, liveMode, docsUrl).
2. Add `ResearchSourceKind` (+ feed class) in `research-bus.ts`.
3. Ship adapter under `packages/adapters/src/research/` with leak-linted evidence.
4. Wire `gather.ts` switch + credential bag field if keyed.
5. If keyed: `ResearchKeyProvider` + settings UI + `loadResearchGatherKeys`.
6. `selectReadySourceKinds` / `resolveDefaultSourceKinds` auto-include when auth ready.
7. Smoke entry + matrix row. Max explicit kinds: **24**.

Do **not** put raw prices/rates/OHLC into EvidencePackage text.

## Integration inventory (high signal)

| Integration | Runtime auth | Smoke | Status |
|-------------|--------------|-------|--------|
| LLM tier providers (6) | `user_api_keys` | `pnpm smoke:llm` | shipped |
| Alpaca paper (+ news/bars gather) | `broker_connections` | `pnpm smoke:alpaca-paper` / research | shipped |
| Brave / Marketaux / Finnhub / Polygon | `user_research_keys` | `pnpm smoke:research` | shipped |
| FRED / Alpha Vantage | `user_research_keys` | `pnpm smoke:research` | shipped |
| Frankfurter / CoinGecko / World Bank / SEC | none | research smoke / unit | shipped |
| GDELT | none | — | stub (429 backoff) |
| Twelve Data / Marketstack | researched | — | not wired |
| Live WS (Alpaca/Finnhub/Polygon) | broker/key | — | researched candidates |

Full matrix: `agent-docs/research/integrations-matrix.md`.

## Credential paths

### Production / dev runtime

1. **User settings** → LLM / Research / Brokers.
2. Encrypt at rest (`SETTINGS_ENCRYPTION_KEY` / `CREDENTIALS_ENCRYPTION_KEY`).
3. Research keys: brave, market_news, finnhub, polygon, fred, alpha_vantage.
4. Never authorize runtime from `process.env.*_API_KEY` (D-027).

### CI / smoke (env only)

```bash
HFTR_LLM_SMOKE=1 pnpm smoke:llm
HFTR_RESEARCH_SMOKE=1 pnpm smoke:research
ALPACA_PAPER_SMOKE=1 pnpm smoke:alpaca-paper
```

Without flags, scripts exit 0 with `skip:`.

## Safety

1. User keys only at runtime.
2. Leak lint all evidence + LLM outputs.
3. Live fail-closed until gate (D-031).
4. Model boundary: no LLM below Groq compile; gather is model-free.
5. Honest `feedClass` labels (IEX vs SIP, free vs paid).

## Smoke endpoint cheat sheet

| Kind | Ping |
|------|------|
| frankfurter_fx | `GET api.frankfurter.dev/v2/rates?base=USD` |
| coingecko_crypto | `GET api.coingecko.com/api/v3/coins/markets?...` |
| world_bank_indicator | `GET api.worldbank.org/v2/indicator?format=json&per_page=1` |
| fred_macro | FRED series search + `FRED_API_KEY` |
| alpha_vantage_news | NEWS_SENTIMENT + `ALPHA_VANTAGE_API_KEY` |
| alpaca_news | `data.alpaca.markets/v1beta1/news` + APCA headers |

## Related

- Workflow: `.cursor/workflows/credentialed-integrations.md`
- Rule: `.cursor/rules/external-integrations.mdc`
- Decisions: D-027, D-039, D-046, D-048
