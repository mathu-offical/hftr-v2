# M0 Sprint Spec — Foundation (execution-level detail)

Concrete, ordered tasks for milestone M0 from `master-build-plan.md`. Each task lists exact
outputs so an implementation session can execute without re-planning. Versions below are
"latest stable at install time" — record actual pinned versions here once installed.

## T0.1 — Monorepo scaffold

- `pnpm init` at repo root; `pnpm-workspace.yaml` with `apps/*`, `packages/*` (ONLY real
  packages — no phantom entries, v1 lesson).
- Root: `turbo.json` (tasks: `build`, `dev`, `lint`, `typecheck`, `test`), `tsconfig.base.json`
  (strict: true, noUncheckedIndexedAccess, exactOptionalPropertyTypes), `.gitignore`, ESLint
  flat config + Prettier.
- `apps/web`: `create-next-app` (App Router, TS, Tailwind v4, src dir off — use `app/` +
  `src/` split matching v1 convention: `app/` routes, `src/` components/lib).
- `packages/contracts`: tsup build, zod dep, exports `./src/index.ts` barrel by domain
  (`foundation.ts`, `numeric.ts`, `pipeline.ts`, `modules.ts`, `broker.ts`, `llm.ts`).
- `packages/db`: drizzle-orm + drizzle-kit + `@neondatabase/serverless`; folders
  `schema/` (one file per domain, mirroring data-model.md sections), `migrations/`,
  `scoping.ts`, `seed/`.
- `packages/engine`: zero framework deps (zod + contracts + db only). Folders: `queue/`,
  `handlers/`, `calc/`, `dispatch/`, `verification/` (calc/dispatch/verification empty stubs
  with README pointers to owning docs).
- `packages/adapters`, `packages/llm`: skeletons with interface files only.
- Definition of done: `pnpm turbo typecheck lint test build` green from clean clone.

## T0.2 — Clerk auth

- `@clerk/nextjs`; `middleware.ts` protecting everything except `/`, `/sign-in`, `/sign-up`,
  `/api/health`, `/api/billing/webhook`, `/api/cron/*` (secret-gated instead).
- App shell layout with `<ClerkProvider>`, user button placeholder in top bar.
- `users_profile` upsert on first authenticated request (server helper `ensureProfile()`).
- Env: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.

## T0.3 — Database + migrations 001–003

- Neon project (fresh, per D-006); `DATABASE_URL` standard var (not `POSTGRES_URL`).
- Drizzle schema files + generated migrations, in three commits:
  - **001 identity/billing:** `users_profile`, `platform_credits`, `credit_ledger`,
    `subscriptions`.
  - **002 companies/modules:** `companies`, `modules`, `module_links`, `fund_transfers`.
  - **003 orchestration:** `jobs`, `job_schedules`, `llm_calls`, `llm_budgets`.
- `scoping.ts`: `ownedCompany(userId, companyId)`, `ownedModule(...)` helpers returning typed
  scoped query builders; vitest asserting handlers can't import raw table objects (lint rule or
  export discipline: schema tables are not exported from the package barrel, only scoped
  helpers + explicit admin/seed entrypoints).
- `migrations/README.md` kept current from day one (v1 drift lesson: 006 was undocumented).

## T0.4 — Contracts seed (v1 carryover, phase 1)

Port into `packages/contracts` with zod schemas + unit tests (round-trip parse):
- Enums: authority/mutation classes, queue classes, priority bands, timeout classes.
- `HandoffEnvelope`, `SanityEnvelope`, `ValueRef` + `NumericKind` (numeric + temporal kinds) +
  descriptor enums incl. temporal descriptors (D-008/D-009), failure-code families incl.
  `numeric_leak`, `numeric_sanity_block`.
- Clock module stub (`packages/engine/clock.ts`, injectable) + lint rule banning direct
  `Date.now()`/`new Date()` in engine/llm packages, active from the first commit so temporal
  discipline never needs retrofitting.
- `ENVIRONMENT_REQUIREMENTS` manifest (name, required-in `dev|preview|prod`, consumer package) —
  test asserts `.env.example` matches it exactly.

## T0.5 — Deploy skeleton

- Vercel project (new) linked to repo; `vercel.json` with cron placeholder (`/api/cron/tick`
  every minute, disabled flag until M1) — crons documented in job-orchestration.md.
- `/api/health`: checks DB round-trip + reports migration head + git sha; no auth.
- `.env.example` complete for M0 scope; Preview env seeded with Neon branch DB.
- CI: GitHub Actions — pnpm cache, `turbo typecheck lint test`, drizzle migration dry-run
  against ephemeral Postgres (docker service) to guarantee reproducibility from zero.

## T0.6 — Design tokens + shell chrome

- `tokens.css`: color scale (`#0a0e14` base family), semantic state colors (watch amber,
  blocked red, overnight violet, paper cyan, live red), radii, spacing, font stacks
  (mono tabular-nums for numbers), wired into Tailwind v4 `@theme`.
- shadcn/ui init (button, dialog, dropdown, tabs, toast); Lucide installed.
- Top bar v0: logo, company switcher placeholder, mode badge placeholder, credits meter
  placeholder, settings link, Clerk user button. Empty canvas area below.

## Gate G0 checklist

- [ ] Clean-clone bootstrap: `pnpm i && pnpm turbo build test` green
- [ ] Sign-up → sign-in → profile row created → sign-out verified in browser (Playwright flow 0)
- [ ] `drizzle-kit` migrations reproduce schema from empty DB in CI
- [ ] Vercel preview + production deploys green; `/api/health` OK on both
- [ ] `.env.example` ↔ `ENVIRONMENT_REQUIREMENTS` test green
- [ ] agent-docs updated: pinned versions recorded here; decisions/deviations logged
