# @hftr/engine

The deterministic core. **Model-free and framework-free**: no LLM SDKs, no Next.js/React
imports — pure TypeScript over `@hftr/contracts` + `@hftr/db`. Everything below the
execution-agent compile stage lives here (AGENTS.md invariant 1).

| Dir | Purpose | Doc |
|---|---|---|
| `src/queue/` | Postgres job queue: enqueue (idempotent), claim (`FOR UPDATE SKIP LOCKED`), complete/fail with backoff, lease sweep | `agent-docs/architecture/job-orchestration.md` |
| `src/handlers/` | Job handler registry (`kind` → handler fn); handlers are idempotent | same |
| `src/clock.ts` | Single injectable clock authority — the only legal source of "now" | `number-handling.md` §4c |
| `src/calendar/` | Market calendar service: session lookup, phase, time-to-close (reads `exchange_calendars`) | same |
| `src/calc/` | Numeric Reference Architecture: fixed-point store, unit algebra, static ops, expression evaluator, sanity gauntlet, descriptors, leak linter | `number-handling.md` |
| `src/dispatch/` | (M2) deterministic order dispatch — the only caller of `BrokerAdapter.submitOrder` | `broker-integration.md` |
| `src/verification/` | (M2) schema-locked trade verification + recovery ladders | `v1-carryover.md` |

## Key functions

- `enqueue(db, def)` / `claimJobs(db, opts)` / `completeJob` / `failJob` / `sweepExpiredLeases`
- `createSystemClock()` / `createFixedClock(atMs)` — inject; never call `Date.now()` elsewhere
- `calc.record(db, input)` — ingest a raw value from an authorized source → `ValueRef`
- `calc.evaluate(db, request, caller)` — run a static op or bounded expression over refs;
  applies unit algebra, staleness checks, sanity envelopes; appends to `calc_operations`
- `calc.describe(db, ref, bands?)` — qualitative descriptor block for model context
- `leakLint(output, whitelistPaths)` — rejects raw numerics/datetimes in model output
