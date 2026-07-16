# hftr v2

Autonomous, compliance-first trading platform: users compose **companies** of modules
(research → data → trend → trading → policy) on a live canvas. LLM tiers steer strategy through
bounded choices; a deterministic, model-free core handles every number, timestamp, and order.

Full documentation lives in [`agent-docs/`](agent-docs/README.md). The initializing spec is
[`DevSpecs/hftr-v2.init.spec.md`](DevSpecs/hftr-v2.init.spec.md) (read-only).

## Layout

| Path | Purpose |
|---|---|
| `apps/web` | Next.js 15 app: UI shell, canvas, panels, hardened API routes |
| `packages/contracts` | Zod schemas + types for every cross-boundary artifact |
| `packages/db` | Drizzle schema, migrations, ownership-scoped query helpers |
| `packages/engine` | Deterministic core: job queue, clock/calendar, numeric calculator, dispatch, verification. No framework imports |
| `packages/llm` | Provider clients (Claude / Mistral / Groq), schema-locked call wrapper, budgets |
| `packages/adapters` | Broker adapters (paper sim, Alpaca, Kalshi, …) behind one interface |
| `agent-docs` | Living documentation: architecture, plans, decisions (curation contract inside) |

## Safety invariants (see AGENTS.md — non-negotiable)

1. Last model-bearing stage = execution-agent compile. Everything below is model-free.
2. LLMs never handle raw financial numbers or authoritative dates/times (ValueRef +
   deterministic calculator/clock/calendar only).
3. Guardrails + verification schemas immutable; only bounded band positions mutate.
4. One engine for paper and live; live is fail-closed until explicit gates pass.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in values (see comments)
pnpm db:migrate              # apply migrations to DATABASE_URL
pnpm dev                     # apps/web on :3000
```

Verify: `pnpm typecheck && pnpm test && pnpm lint`. Health check: `GET /api/health`.
