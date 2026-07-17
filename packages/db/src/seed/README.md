# Seeds

Seed scripts load the vendored catalogs in `./catalogs/` (strategy families, guardrail
packages, recovery ladders, session constraints, broker policy envelopes, sector seeds,
event archetypes, macro triggers, trend-lead patterns) into versioned rows
(`catalog_version`, `literature_refs`). The catalogs were snapshotted from v1 into this
repo — v2 has no dependency on the v1 workspace.

Scripts:

- `seed-calendar.ts` — populates `exchange_calendars` for XNYS current + next year (done).
- `verify-trade-setup.ts` — seeds a dev company + active trading module and enqueues a
  `dispatch.paper_trade` job for loop verification (done).
- `seed-catalogs.ts` (M2) — parse `./catalogs/*.json` → validate against @hftr/contracts →
  upsert by catalog key.
- `seed-templates.ts` (M1) — company templates (day_trading_starter, crypto_starter, …).

Run with `pnpm --filter @hftr/db exec tsx src/seed/<script>.ts`.
