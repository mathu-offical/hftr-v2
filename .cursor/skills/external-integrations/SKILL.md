---
name: external-integrations
description: Wire and verify Alpaca, LLM providers, Brave, Marketaux, Finnhub, Polygon, and SEC research sources in hftr-v2. Covers credential paths (settings UI vs env smoke), safety invariants, CLI smoke scripts, and IronBee settings verification. Use when adding adapters, research gather, LLM settings, or CI connectivity checks.
---

# External integrations (hftr-v2)

How to connect third-party services without breaking safety invariants.

## When to use

- Adding or changing broker adapters (`packages/adapters`)
- LLM provider transport or settings (`packages/llm`, `apps/web/app/api/settings`)
- Research gather sources (`packages/adapters/src/research`)
- CI / operator smoke for credentialed connectivity
- Debugging "missing key" or auth failures in settings UI

## Integration inventory

| Integration | Runtime auth | Storage | Smoke command | Status |
|-------------|--------------|---------|---------------|--------|
| **Anthropic** (strategic) | User settings key | `user_api_keys` encrypted | `pnpm smoke:llm` | shipped |
| **Mistral** (tactical/assistant) | User settings key | `user_api_keys` | `pnpm smoke:llm` | shipped |
| **Groq** (execution compile) | User settings key | `user_api_keys` | `pnpm smoke:llm` | shipped |
| **Cerebras / Fireworks / OpenRouter** | User settings key | `user_api_keys` | `pnpm smoke:llm` | shipped |
| **Alpaca paper** (broker) | User settings → bind | `broker_connections` encrypted | `pnpm smoke:alpaca-paper` | shipped (M2) |
| **Alpaca live** | User settings → bind | `broker_connections` | manual + live gate | fail-closed |
| **Brave Search** | User research keys | `user_research_keys` | `pnpm smoke:research` | shipped (D-039) |
| **Marketaux** (market news) | User research keys | `user_research_keys` | `pnpm smoke:research` | shipped (D-039) |
| **Alpaca news / bars** | Paper Alpaca broker creds | `broker_connections` | `pnpm smoke:research` | shipped gather (D-046) |
| **Finnhub news** | User research keys | `user_research_keys` | `pnpm smoke:research` | shipped gather (D-046) |
| **Polygon news** | User research keys | `user_research_keys` | `pnpm smoke:research` | shipped gather (D-046) |
| **SEC EDGAR** | None (public) | N/A | N/A | shipped (no key) |

Full matrix: `agent-docs/research/integrations-matrix.md`.

## Credential paths

### Production / dev runtime (always)

1. Operator opens **User settings** → **LLM providers** / **Research keys** / **Brokers**.
2. Keys saved via scoped API routes; encrypted at rest:
   - LLM: `SETTINGS_ENCRYPTION_KEY` → `user_api_keys`
   - Brokers: `CREDENTIALS_ENCRYPTION_KEY` → `broker_connections`
   - Research: `user_research_keys` (Brave, market_news, finnhub, polygon)
3. **Verify** button calls decrypt-then-ping (same logic as smoke scripts for LLM).
4. Company **bind** for brokers (`companies.broker_connection_id`).

**Never** read `process.env.*_API_KEY` to authorize a runtime LLM or research call (D-027, D-039).

### CI / local operator smoke (env only)

Opt-in flags prevent accidental spend:

```bash
# LLM providers (models-list or Anthropic format check)
HFTR_LLM_SMOKE=1 ANTHROPIC_API_KEY=... GROQ_API_KEY=... pnpm smoke:llm

# Research sources
HFTR_RESEARCH_SMOKE=1 BRAVE_API_KEY=... MARKETAUX_API_KEY=... FINNHUB_API_KEY=... POLYGON_API_KEY=... pnpm smoke:research

# Alpaca paper adapter
ALPACA_PAPER_SMOKE=1 ALPACA_PAPER_KEY=... ALPACA_PAPER_SECRET=... pnpm smoke:alpaca-paper
```

Without the `*_SMOKE=1` gate, scripts exit **0** with `skip:` — safe for default CI.

Env vars documented in `.env.example`; manifest synced in `packages/contracts/src/env.ts`.

## Safety rules

1. **User keys only at runtime** — deployment env keys do not authorize inference (D-027).
2. **Encrypt at rest** — never return plaintext keys to the browser after save.
3. **No secrets in logs** — smoke scripts print `ok` / `fail` / `skip` only; never key values.
4. **Leak lint** — all LLM outputs pass digit/datetime leak lint (`packages/contracts` leakLint).
5. **Paper vs live** — live dispatch fail-closed until live gate + arming (D-031); paper smoke never hits live URLs.
6. **Model boundary** — Groq compile is last model-bearing stage; gather/validate/admit are model-free.
7. **Retention** — respect `CompanyLlmPolicy.privacyMode` and `MODEL_CAPABILITY_REGISTRY` retention classes.

## LLM verify logic

Mirrors `apps/web/lib/llm-verify.ts`:

| Provider | Check |
|----------|-------|
| anthropic | `sk-ant-` prefix; no spend-free models endpoint |
| mistral, groq, cerebras, fireworks, openrouter | GET provider `/v1/models` (401/403 = fail) |

Implementation: `scripts/smoke-llm-providers.mjs`, `verifyLlmProviderKey` in web lib.

## Research verify logic

| Source | Check |
|--------|-------|
| brave_search | GET `api.search.brave.com/res/v1/web/search?count=1` + `X-Subscription-Token` |
| market_news | GET `api.marketaux.com/v1/news/all?limit=1` + `api_token` |
| alpaca_news | GET `data.alpaca.markets/v1beta1/news?limit=1` + APCA headers |
| finnhub_news | GET `finnhub.io/api/v1/news?category=general&token=` (or company-news) |
| polygon_news | GET `api.polygon.io/v2/reference/news?limit=1&apiKey=` |
| sec_edgar | Public filings fetch in adapter (no smoke key) |

Implementation: `packages/adapters/src/research/*`, `scripts/smoke-research-sources.mjs`.

## Alpaca broker spine

1. Settings → Brokers → save paper key + secret → **Verify**
2. Company drawer → bind verified connection
3. `GET /api/companies/:id/broker` shows entitlement (`alpaca_iex_paper`)
4. Automated smoke: `pnpm smoke:alpaca-paper` (cannot decrypt UI-saved creds)

See `agent-docs/ops/runbook.md` § Alpaca paper smoke.

## Verify steps (zero-trust)

### After code changes

```bash
node scripts/smoke-llm-providers.mjs          # expect skip without HFTR_LLM_SMOKE
node scripts/smoke-research-sources.mjs       # expect skip without HFTR_RESEARCH_SMOKE
pnpm --filter @hftr/contracts test            # env manifest ↔ .env.example
```

### With credentials (operator machine only)

```bash
HFTR_LLM_SMOKE=1 pnpm smoke:llm
HFTR_RESEARCH_SMOKE=1 pnpm smoke:research
ALPACA_PAPER_SMOKE=1 pnpm smoke:alpaca-paper
```

### UI path (IronBee)

1. `navigation_go-to` → settings modal
2. Save + **Verify** per provider
3. `a11y_take-aria-snapshot` — confirm text-first success/failure
4. `o11y_get-console-messages` — no errors

Prefer `execute` for multi-tab settings flows.

## Doc updates (same change)

| Change | Update |
|--------|--------|
| New provider or auth mode | `agent-docs/research/integrations-matrix.md` |
| Architecture shift | `agent-docs/architecture/broker-integration.md` or `llm-pipeline.md` |
| Product decision | `agent-docs/dev-intent/decisions-log.md` (D-nnn) |
| Stack choice | `agent-docs/research/tech-decisions.md` (TD-nn) |
| Operator procedure | `agent-docs/ops/runbook.md` |

## Related

- Workflow: `.cursor/workflows/credentialed-integrations.md`
- Rule: `.cursor/rules/external-integrations.mdc`
- Decision: D-027 (LLM/broker keys), D-039 (research gather)
