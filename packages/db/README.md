# @hftr/db

Drizzle schema + migrations + ownership-scoped query helpers for the fresh Neon Postgres
database (D-006). Canonical schema doc: `agent-docs/architecture/data-model.md` — keep both in
sync in the same change.

## Rules

- **Ownership scoping:** API handlers never import table objects directly; they use the scoped
  helpers in `src/scoping.ts` which require a `clerk_user_id` and verify company/module
  ownership before returning rows. Raw tables are exported only from `./schema` for the engine,
  migrations, and seeds.
- **Append-only tables** (`action_traces`, `verification_records`, `credit_ledger`,
  `assistant_edits`, `numeric_values`, `calc_operations`): no update/delete helpers exist.
- **Fixed-point money/time:** integer cents (`*_cents`) or `value_int + scale`; never float.
- Migrations live in `migrations/` and are documented in `migrations/README.md` from day one.

## Layout

| File                          | Contents                                                      |
| ----------------------------- | ------------------------------------------------------------- |
| `src/schema/identity.ts`      | users_profile, platform_credits, credit_ledger, subscriptions |
| `src/schema/companies.ts`     | companies, modules, module_links, fund_transfers              |
| `src/schema/orchestration.ts` | jobs, job_schedules, llm_calls, llm_budgets                   |
| `src/schema/numeric.ts`       | numeric_values, calc_operations, exchange_calendars           |
| `src/client.ts`               | Neon serverless drizzle client factory                        |
| `src/scoping.ts`              | ownership-scoped accessors used by all API handlers           |
| `src/seed/`                   | seed scripts + vendored catalogs (`src/seed/catalogs/`)       |

Later milestones add: research/knowledge, pipeline (trends→traces), simulations, assistant
tables (see data-model.md for the full target schema).
