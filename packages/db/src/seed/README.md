# Seeds

Seed scripts load the v1 catalogs (strategy families, guardrail packages, recovery ladders,
session constraints, broker policy envelopes, sector seeds, event archetypes, macro triggers)
from `../../hftr` JSON sources into versioned rows (`catalog_version`, `literature_refs`).

Planned scripts (M0 T0.4 / M2):
- `seed-catalogs.ts` — parse v1 JSON → validate against @hftr/contracts → upsert by catalog key.
- `seed-calendar.ts` — populate `exchange_calendars` for XNYS/XNAS current + next year.
- `seed-templates.ts` — company templates (day_trading_starter, crypto_starter, …).

Run with `pnpm --filter @hftr/db exec tsx src/seed/<script>.ts` once written.
