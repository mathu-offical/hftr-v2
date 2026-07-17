/**
 * Pipeline-spine verification scenario (run with tsx):
 *
 *   DATABASE_URL=... pnpm exec tsx src/seed/verify-promote.ts [up|down|flat]
 *
 * With no argument, promotes the newest trend_candidate regardless of
 * direction (down/flat exercise the compile block taxonomy). Passing a
 * direction picks the newest candidate with that direction — use `up` to
 * exercise the full compiled → dispatch → trace path.
 *
 * Picks the newest trend_candidate for the dev company (run the 'scan'
 * scenario in verify-trade-setup.ts first if none exist), enqueues a
 * trend.promote job, drains the queues in-process, then prints the full
 * spine result: lead status + six-gate evidence, decision tree status,
 * compile event result, and whether a dispatch trace was created. Proves
 * trend → admission → tree → compile → dispatch end to end against the
 * live database. Imports the engine by relative path because @hftr/db
 * cannot declare a package dependency on @hftr/engine (cycle).
 */
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { companies } from '../schema/companies';
import { actionTraces } from '../schema/pipeline';
import { compileEvents, decisionTrees, leadPackages } from '../schema/knowledge';
import { trendCandidates } from '../schema/research';
import { createSystemClock, drainQueues, enqueue } from '../../../engine/src/index';

const OWNER = 'dev_local_user';

const DIRECTION_ARG = process.argv[2];
const DIRECTION =
  DIRECTION_ARG === 'up' || DIRECTION_ARG === 'down' || DIRECTION_ARG === 'flat'
    ? DIRECTION_ARG
    : null;

async function main() {
  const db = getDb();
  const clock = createSystemClock();

  const company = (
    await db.select().from(companies).where(eq(companies.clerkUserId, OWNER)).limit(1)
  )[0];
  if (!company) throw new Error('dev company not found — run verify-trade-setup.ts first');

  const trend = (
    await db
      .select()
      .from(trendCandidates)
      .where(
        DIRECTION
          ? and(eq(trendCandidates.companyId, company.id), eq(trendCandidates.direction, DIRECTION))
          : eq(trendCandidates.companyId, company.id),
      )
      .orderBy(desc(trendCandidates.createdAt))
      .limit(1)
  )[0];
  if (!trend) throw new Error('no trend candidates — run "verify-trade-setup.ts scan" first');

  await enqueue(db, clock, {
    queueClass: 'RESEARCH',
    kind: 'trend.promote',
    payload: { companyId: company.id, moduleId: trend.moduleId, trendId: trend.id },
    idempotencyKey: `verify-promote-${trend.id}-${clock.nowMs()}`,
    priority: 'NORMAL',
    companyId: company.id,
    moduleId: trend.moduleId,
  });
  const drained = await drainQueues(db, clock, {
    workerId: 'verify-promote',
    budgetMs: 20_000,
    batchSize: 5,
  });

  const lead = (
    await db
      .select()
      .from(leadPackages)
      .where(eq(leadPackages.trendId, trend.id))
      .orderBy(desc(leadPackages.createdAt))
      .limit(1)
  )[0];
  const tree = lead
    ? (
        await db
          .select()
          .from(decisionTrees)
          .where(eq(decisionTrees.leadId, lead.id))
          .orderBy(desc(decisionTrees.createdAt))
          .limit(1)
      )[0]
    : undefined;
  const compileEvent = tree
    ? (
        await db
          .select()
          .from(compileEvents)
          .where(eq(compileEvents.treeId, tree.id))
          .orderBy(desc(compileEvents.createdAt))
          .limit(1)
      )[0]
    : undefined;
  const latestTrace = (
    await db
      .select()
      .from(actionTraces)
      .where(eq(actionTraces.companyId, company.id))
      .orderBy(desc(actionTraces.createdAt))
      .limit(1)
  )[0];
  // A dispatch trace counts only if it was written after we enqueued.
  const traceCreated =
    latestTrace !== undefined &&
    lead !== undefined &&
    latestTrace.createdAt.getTime() >= lead.createdAt.getTime();

  console.log(
    JSON.stringify(
      {
        drained,
        trend: { id: trend.id, symbol: trend.symbol, direction: trend.direction },
        lead: lead ? { id: lead.id, status: lead.status, gates: lead.gates } : null,
        tree: tree ? { id: tree.id, status: tree.status } : null,
        compile: compileEvent
          ? { result: compileEvent.result, blockReason: compileEvent.blockReason }
          : null,
        dispatchTrace: traceCreated ? { id: latestTrace!.id, outcome: latestTrace!.outcome } : null,
      },
      null,
      2,
    ),
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
