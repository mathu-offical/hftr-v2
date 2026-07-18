# Credentialed integrations playbook

Step-by-step for wiring Alpaca, LLM providers, Brave, Marketaux, Finnhub, and Polygon in hftr-v2.

**Skill:** `.cursor/skills/external-integrations/SKILL.md`
**Matrix:** `agent-docs/research/integrations-matrix.md`
**Decision:** D-046

## Prerequisites

- Local `.env.local` with `DATABASE_URL`, Clerk keys (or `DEV_AUTH_BYPASS=1`), encryption keys
- Neon / Vercel CLIs if deploying (optional for local smoke)

## 1. Database and deploy surface

```bash
pnpm db:migrate
```

Record any new required env names in `packages/contracts/src/env.ts` + `.env.example` (test enforces parity).

## 2. Settings UI — operator keys (runtime path)

1. Start dev: `pnpm --filter @hftr/web exec next dev -p 3001`
2. IronBee: open app → **User settings**
3. **LLM providers** tab: enter keys per tier provider → **Save** → **Verify**
4. **Research** tab: Brave, Market news, Finnhub, Polygon → **Save**
5. **Brokers** tab: Alpaca paper key + secret → **Save** → **Verify** (enables gather `alpaca_news` / `alpaca_bars`)
6. Company drawer → **Bind** verified Alpaca connection

Verify: `o11y_get-console-messages` clean; snapshot shows text-first verify status.

## 3. CLI smoke (CI / operator, env keys)

Scripts are opt-in — default CI stays green without secrets.

```bash
# Skip path (exit 0)
node scripts/smoke-llm-providers.mjs
node scripts/smoke-research-sources.mjs
node scripts/smoke-alpaca-paper.mjs

# Credentialed runs (export keys in shell — never commit)
HFTR_LLM_SMOKE=1 pnpm smoke:llm
HFTR_RESEARCH_SMOKE=1 pnpm smoke:research
ALPACA_PAPER_SMOKE=1 pnpm smoke:alpaca-paper
```

Optional: `ALPACA_PAPER_SUBMIT=1` for submit+cancel smoke (operator intent only).

## 4. IronBee settings verification

Multi-step flow — prefer `execute`:

1. `navigation_go-to` → authenticated canvas
2. Open settings modal → Research tab → confirm Finnhub + Polygon rows
3. `a11y_take-aria-snapshot` after navigation
4. `o11y_get-console-messages` at end

## 5. Document and decide

| Artifact | When |
|----------|------|
| `agent-docs/research/integrations-matrix.md` | Any provider/status/smoke change |
| `agent-docs/ops/runbook.md` | Operator procedure change |
| `agent-docs/research/tech-decisions.md` | New stack/vendor (TD-nn) |
| `agent-docs/dev-intent/decisions-log.md` | User-facing product decision (D-nnn) |

Do **not** edit `DevSpecs/`.

## 6. Tests before done

```bash
pnpm --filter @hftr/contracts test   # env manifest
pnpm --filter @hftr/adapters exec vitest run src/research/
pnpm typecheck
```

## 7. End of run

Follow `.cursor/workflows/verify-and-ship.md` — verify → curate → commit (when user requests or workspace end-of-run).

## Quick reference

| Integration | Runtime table | Smoke |
|-------------|---------------|-------|
| LLM | `user_api_keys` | `HFTR_LLM_SMOKE=1 pnpm smoke:llm` |
| Brave / Marketaux / Finnhub / Polygon | `user_research_keys` | `HFTR_RESEARCH_SMOKE=1 pnpm smoke:research` |
| Alpaca paper (+ news/bars gather) | `broker_connections` | `ALPACA_PAPER_SMOKE=1 pnpm smoke:alpaca-paper` |
| SEC EDGAR | none (public) | adapter unit tests |
