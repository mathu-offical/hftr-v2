# Company Equity and Multi-Source Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist deterministic company equity and automatically bind every relevant verified
user connection to modules and engines according to first-class service requirements.

**Architecture:** Contracts declare equity projections and service capabilities. A migration
adds company equity fields, position provenance, and module-to-connection bindings. The engine
owns one deterministic recomputation function; web APIs trigger resolution/recomputation and
server-rendered cards read only the materialized projection.

**Tech Stack:** TypeScript strict, Zod, Drizzle/Postgres, Next.js App Router, Vitest, Playwright,
IronBee DevTools.

## Global Constraints

- Equity is `hard cash + current market value of confirmed nonzero open positions`.
- Only deterministic code may calculate or update equity; no model may handle authoritative
  financial numbers.
- Money is integer cents; source and derived values use ValueRefs with provenance.
- Root user settings own credentials. Modules/engines consume all relevant verified sources.
- Missing required execution capabilities fail closed; optional gaps warn without blocking.
- Quote events refresh equity; a 15-second fallback applies while live data is available.
- Failed recomputation preserves the last successful number and changes status.
- Browser verification uses IronBee DevTools only.

---

### Task 1: Equity and service capability contracts

**Files:**

- Create: `packages/contracts/src/services.ts`
- Create: `packages/contracts/src/services.test.ts`
- Modify: `packages/contracts/src/broker-connection.ts`
- Modify: `packages/contracts/src/templates.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**

- Produces `ServiceCapability`, `ServiceRequirement`, `ModuleServiceCoverage`,
  `CompanyEquityProjection`, `MODULE_SERVICE_REQUIREMENTS`, and
  `requirementsForEngine(template)`.

- [ ] **Step 1: Write failing contract tests**

```ts
expect(MODULE_SERVICE_REQUIREMENTS.trading.required).toContain('market_quotes');
expect(requirementsForEngine(dayTrading).required).toContain('trade_execution');
expect(
  CompanyEquityProjection.parse({
    equityCents: '1024530',
    status: 'fresh',
    asOfIso: '2026-07-17T20:00:00.000Z',
    version: 2,
  }),
).toBeTruthy();
```

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @hftr/contracts exec vitest run src/services.test.ts`
Expected: FAIL because `services.ts` does not exist.

- [ ] **Step 3: Implement contracts**

Use a finite capability enum:

```ts
export const ServiceCapability = z.enum([
  'market_quotes',
  'historical_bars',
  'trade_execution',
  'account_balances',
  'open_positions',
  'event_contract_quotes',
  'crypto_quotes',
  'research_provider',
]);
```

Declare module requirements by `ModuleType`; union and deduplicate member requirements for engine
templates. Extend connection summaries with normalized `serviceCapabilities`.

- [ ] **Step 4: Run green tests**

Run: `pnpm --filter @hftr/contracts exec vitest run src/services.test.ts`
Expected: PASS.

---

### Task 2: Equity and binding persistence

**Files:**

- Create: `packages/db/migrations/0018_company_equity_service_bindings.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Modify: `packages/db/src/schema/companies.ts`
- Modify: `packages/db/src/schema/brokers.ts`
- Modify: `packages/db/src/schema/identity.ts`
- Modify: `packages/db/src/schema/research.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `agent-docs/architecture/data-model.md`

**Interfaces:**

- Consumes contract enum strings from Task 1.
- Produces company equity columns and `moduleServiceBindings`.

- [ ] **Step 1: Write migration assertions**

Add a focused schema test or migration-text test asserting:

```ts
expect(companies.equityCents).toBeDefined();
expect(companies.equityStatus).toBeDefined();
expect(moduleServiceBindings.brokerConnectionId).toBeDefined();
expect(moduleServiceBindings.userApiKeyId).toBeDefined();
expect(positions.connectionId).toBeDefined();
```

- [ ] **Step 2: Run red test**

Run the focused DB test or `pnpm --filter @hftr/db exec tsc --noEmit`.
Expected: FAIL because columns/tables are absent.

- [ ] **Step 3: Add schema and migration**

Add to `companies`: nullable `equity_cents`, nullable `equity_ref`, nullable `equity_as_of`,
`equity_status` default `unavailable`, and integer `equity_version` default zero. Add nullable
`connection_id` and `venue` to `positions`. Add `module_service_bindings` with nullable
`broker_connection_id` / `user_api_key_id`, a CHECK requiring exactly one source, capability,
status, and `last_verified_at`; partial unique indexes prevent duplicate module/capability/source
bindings. Drop the exclusive company/connection unique constraint while retaining the legacy
nullable field for migration compatibility.

- [ ] **Step 4: Apply and verify migration**

Run: `pnpm --filter @hftr/db migrate`
Expected: migration succeeds.

---

### Task 3: Deterministic equity service

**Files:**

- Create: `packages/engine/src/equity/equity.ts`
- Create: `packages/engine/src/equity/equity.test.ts`
- Modify: `packages/engine/src/index.ts`
- Modify: `packages/engine/src/dispatch/paper-trade.ts`
- Modify: `packages/engine/src/dispatch/positions.ts`
- Modify: `packages/engine/src/handlers/reconcile.ts`

**Interfaces:**

- Produces:

```ts
recomputeCompanyEquity(
  db: Db,
  clock: Clock,
  companyId: string,
  trigger: EquityTrigger,
  marks?: readonly EquityMarkInput[],
): Promise<CompanyEquityProjection>
```

- [ ] **Step 1: Write failing pure-calculation tests**

Cover cash only, two open positions, deterministic median, broker market-value precedence,
zero-quantity exclusion, one missing mark causing unavailable, stale marks, and old-version
write rejection.

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @hftr/engine exec vitest run src/equity/equity.test.ts`
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement fixed-point equity calculation**

Use bigint cents throughout. Resolve paper cash from seed + ledger. Resolve broker cash and
position market values from the latest eligible snapshot. Record source values and derived equity
through `calcStore`; update the company projection only after a complete successful calculation.

- [ ] **Step 4: Wire action triggers**

After successful fill persistence and reconciliation, invoke recomputation. Preserve the action
result if recomputation fails, but mark equity unavailable/stale and emit an operational error.

- [ ] **Step 5: Run green tests**

Run: `pnpm --filter @hftr/engine exec vitest run src/equity/equity.test.ts`
Expected: PASS.

---

### Task 4: Multi-source service resolver

**Files:**

- Create: `packages/engine/src/services/resolve-module-services.ts`
- Create: `packages/engine/src/services/resolve-module-services.test.ts`
- Modify: `packages/engine/src/index.ts`
- Modify: `apps/web/lib/brokers.ts`
- Modify: `apps/web/lib/user-api-keys.ts`
- Modify: `apps/web/app/api/settings/brokers/[id]/verify/route.ts`
- Modify: `apps/web/app/api/companies/route.ts`
- Modify: `apps/web/app/api/companies/[companyId]/engines/route.ts`

**Interfaces:**

- Produces:

```ts
resolveCompanyServiceBindings(db: Db, clerkUserId: string, companyId: string):
  Promise<ModuleServiceCoverage[]>
```

- [ ] **Step 1: Write failing resolver tests**

Assert all matching verified sources bind, revoked/unverified sources do not, required gaps are
reported, and optional gaps do not block.

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @hftr/engine exec vitest run src/services/resolve-module-services.test.ts`
Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement resolver and triggers**

Load all user-owned verified broker/market connections and configured provider API keys,
normalize both into service sources, replace bindings for affected modules, and return text-first
coverage. Trigger after verify/revoke/removal and module/engine creation.

- [ ] **Step 4: Run green tests**

Run the focused resolver test; expected PASS.

---

### Task 5: Company projections, cards, and root settings

**Files:**

- Modify: `packages/db/src/scoping.ts`
- Modify: `apps/web/app/companies/page.tsx`
- Modify: `apps/web/components/CompanyCard.tsx`
- Modify: `apps/web/components/shell/UserSettingsModal.tsx`
- Create: `apps/web/app/api/companies/[companyId]/service-coverage/route.ts`
- Modify: `apps/web/e2e/companies.spec.ts`
- Modify: `agent-docs/product/product-spec.md`
- Modify: `agent-docs/ui-ux/ui-spec.md`
- Modify: `agent-docs/architecture/broker-integration.md`
- Modify: `agent-docs/dev-intent/decisions-log.md`

**Interfaces:**

- Consumes company equity fields and module coverage from Tasks 2–4.
- Produces cards with seed/current value and root connection capability coverage.

- [ ] **Step 1: Write failing E2E assertions**

```ts
await expect(card.getByText('Seed')).toBeVisible();
await expect(card.getByText('$10,000.00')).toBeVisible();
await expect(card.getByText('Current value')).toBeVisible();
```

- [ ] **Step 2: Run red E2E**

Run: `pnpm --filter @hftr/web exec playwright test e2e/companies.spec.ts -g "company card"`
Expected: FAIL because money rows do not exist.

- [ ] **Step 3: Render equity and service coverage**

Pass bigint values as strings into `CompanyCard`. Format with the shared bigint-safe dollars
formatter and tabular numerals. Display stale/unavailable text. Extend root settings connection
cards with normalized capability chips and affected/gap counts. Service coverage endpoint must
require company ownership.

- [ ] **Step 4: Verify**

Run web typecheck, lint, focused Playwright, then IronBee navigation → interaction → ARIA/screenshot
→ console check. Expected: all pass with no new console errors.

---

### Task 6: Fifteen-second fallback refresh

**Files:**

- Create: `packages/engine/src/equity/refresh.ts`
- Create: `packages/engine/src/equity/refresh.test.ts`
- Modify: `packages/engine/src/handlers/maintenance.ts`
- Modify: `packages/engine/src/handlers/index.ts`
- Modify: `agent-docs/architecture/job-orchestration.md`

**Interfaces:**

- Consumes `recomputeCompanyEquity`.
- Produces idempotent watcher scheduling for active companies with available quote services.

- [ ] **Step 1: Write failing cadence tests**

Verify active companies are due after 15 seconds, closed-market companies defer through the
calendar service, and duplicate jobs share an idempotency key.

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @hftr/engine exec vitest run src/equity/refresh.test.ts`
Expected: FAIL because refresh scheduling does not exist.

- [ ] **Step 3: Implement scheduled refresh**

Use the injectable clock and market calendar. Queue one idempotent refresh per company/window;
never busy-loop in a Vercel request.

- [ ] **Step 4: Run complete verification**

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, focused Playwright, and IronBee. Record unrelated
pre-existing failures separately; fix all failures introduced by this plan.
