# Credentialed integrations playbook

Step-by-step for Alpaca, LLMs, and multi-domain research sources in hftr-v2.

**Skill:** `.cursor/skills/external-integrations/SKILL.md`  
**Secrets:** `.cursor/skills/secrets-hygiene/SKILL.md` (D-074 — never enqueue keys)  
**Matrix:** `agent-docs/research/integrations-matrix.md`  
**Decisions:** D-046, D-048, D-074

## Prerequisites

- Local `.env.local` with `DATABASE_URL`, Clerk keys (or `DEV_AUTH_BYPASS=1`), encryption keys
- Neon / Vercel CLIs if deploying (optional for local smoke)

## 1. Database and deploy surface

```bash
pnpm db:migrate
```

Keep `packages/contracts/src/env.ts` + `.env.example` in parity (test-enforced).

## 2. Settings UI — operator keys (runtime path)

1. Start dev: `pnpm --filter @hftr/web exec next dev -p 3001`
2. IronBee: open app → **User settings**
3. **LLM providers** → Save → Verify
4. **Research** → Brave, Marketaux, Finnhub, Polygon, **FRED**, **Alpha Vantage**
5. **Brokers** → Alpaca paper (enables `alpaca_news` / `alpaca_bars`)
6. Bind verified Alpaca on a company

Public sources (no key): SEC, Frankfurter FX, CoinGecko, World Bank — auto-selected when gather has no explicit kinds (`resolveDefaultSourceKinds`).

**Runtime auth rule:** keys stay encrypted at rest; gather/LLM resolve them at
handler/call time only. Curate/query enqueue payloads must **not** include
`*ApiKey` / `alpacaSecret` fields (D-074).

## 3. CLI smoke

```bash
node scripts/smoke-llm-providers.mjs
node scripts/smoke-research-sources.mjs
node scripts/smoke-alpaca-paper.mjs

HFTR_LLM_SMOKE=1 pnpm smoke:llm
HFTR_RESEARCH_SMOKE=1 pnpm smoke:research
ALPACA_PAPER_SMOKE=1 pnpm smoke:alpaca-paper
```

Research smoke always pings Frankfurter `/v2/rates`, CoinGecko markets, World Bank indicators; keyed sources when env present.
Smoke scripts must never print secret values.

## 4. Extending sources (D-048)

Follow skill recipe: registry descriptor → `ResearchSourceKind` → leak-linted adapter → gather switch → optional settings key → smoke + matrix.
Wire credentials via `resolveResearchGatherCredentials` — **never** job payload fields.

Max explicit `sourceKinds`: **24**. Fan-out is isolated `Promise.all`.

## 5. Secrets audit (before ship)

Run `.cursor/workflows/secrets-hygiene-audit.md` (or `/secrets-audit`).

## 6. Document

| Artifact | When |
|----------|------|
| `integrations-matrix.md` | Any provider/status/live-feed change |
| `tech-decisions.md` TD-11 | Market-data posture change |
| `decisions-log.md` | Product decision (D-nnn) |
| `ops/security-audit.md` | Secrets protocol change |

Do **not** edit `DevSpecs/`.

## Quick reference

| Integration | Runtime | Smoke |
|-------------|---------|-------|
| LLM (6) | `user_api_keys` | `pnpm smoke:llm` |
| Research keys | `user_research_keys` → handler resolve | `pnpm smoke:research` |
| Public FX/crypto/macro | none | research smoke |
| Alpaca paper | `broker_connections` | `pnpm smoke:alpaca-paper` |
