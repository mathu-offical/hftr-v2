/**
 * Verification helper (run with tsx): ensures a company + active trading
 * module exist for the dev user, then enqueues a dispatch.paper_trade job.
 * The running web server's /api/queue/drain executes it — proving the whole
 * loop (queue → handler → engine → trace/verify/ledger) in the live app.
 */
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../client';
import { companies, modules } from '../schema/companies';
import { jobs } from '../schema/orchestration';

const OWNER = 'dev_local_user';

// Scenario arg: buy (default) | sell | oversell | scan
const SCENARIO = process.argv[2] ?? 'buy';

async function main() {
  const db = getDb();

  let company = (
    await db.select().from(companies).where(eq(companies.clerkUserId, OWNER)).limit(1)
  )[0];
  if (!company) {
    company = (
      await db
        .insert(companies)
        .values({
          clerkUserId: OWNER,
          name: 'Verification Co',
          philosophyPrompt: 'loop verification',
          mode: 'paper',
          seedCreditsCents: 10_000_00n,
        })
        .returning()
    )[0]!;
  }

  let trading = (
    await db
      .select()
      .from(modules)
      .where(and(eq(modules.companyId, company.id), eq(modules.type, 'trading')))
      .limit(1)
  )[0];
  if (!trading) {
    trading = (
      await db
        .insert(modules)
        .values({
          companyId: company.id,
          type: 'trading',
          subtype: 'day',
          name: 'Verify Trader',
          status: 'active',
          config: {},
          canvasPosition: { x: 600, y: 200 },
        })
        .returning()
    )[0]!;
  } else if (trading.status !== 'active') {
    await db.update(modules).set({ status: 'active' }).where(eq(modules.id, trading.id));
  }

  if (SCENARIO === 'scan') {
    let trend = (
      await db
        .select()
        .from(modules)
        .where(and(eq(modules.companyId, company.id), eq(modules.type, 'trend')))
        .limit(1)
    )[0];
    if (!trend) {
      trend = (
        await db
          .insert(modules)
          .values({
            companyId: company.id,
            type: 'trend',
            name: 'Verify Scanner',
            status: 'active',
            config: { focus: 'verification', maxActiveTrends: 10, cadenceMinutes: 30 },
            canvasPosition: { x: 340, y: 200 },
          })
          .returning()
      )[0]!;
    }
    await db.insert(jobs).values({
      queueClass: 'RESEARCH',
      kind: 'trend.scan',
      payload: {
        companyId: company.id,
        moduleId: trend.id,
        symbols: ['AAPL', 'MSFT', 'NVDA', 'TSLA'],
        lookbackMinutes: 60,
      },
      idempotencyKey: `verify-scan-${randomUUID()}`,
      priority: 50,
      runAfter: new Date(),
      maxAttempts: 3,
      companyId: company.id,
      moduleId: trend.id,
    });
    console.log(JSON.stringify({ scenario: SCENARIO, companyId: company.id, moduleId: trend.id }));
    return;
  }

  const trade =
    SCENARIO === 'oversell'
      ? { actionVerb: 'sell', quantity: 10_000 }
      : SCENARIO === 'sell'
        ? { actionVerb: 'sell', quantity: 2 }
        : { actionVerb: 'buy', quantity: 5 };

  await db.insert(jobs).values({
    queueClass: 'DISPATCH',
    kind: 'dispatch.paper_trade',
    payload: {
      companyId: company.id,
      moduleId: trading.id,
      symbol: 'AAPL',
      orderType: 'market',
      limitPriceCents: null,
      ...trade,
    },
    idempotencyKey: `verify-${randomUUID()}`,
    priority: 80,
    runAfter: new Date(),
    maxAttempts: 3,
    companyId: company.id,
    moduleId: trading.id,
  });

  console.log(JSON.stringify({ scenario: SCENARIO, companyId: company.id, moduleId: trading.id }));
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
