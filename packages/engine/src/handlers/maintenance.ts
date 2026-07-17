import { and, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { resolveBrokerAdapter } from '@hftr/adapters';
import {
  assistantEdits,
  assistantMessages,
  brokerBalancesSnapshot,
  brokerConnections,
} from '@hftr/db/schema';
import { decryptSecret } from '@hftr/secrets';
import { materializeSchedules } from '../schedules/materialize';
import { countTracesOlderThan } from '../live-gates/gather';
import { enqueue, pruneCompleted, sweepExpiredLeases } from '../queue/queue';
import { registerHandler } from './registry';

const COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TRACE_HOT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function parseStoredCredentials(plain: string): unknown {
  return JSON.parse(plain) as unknown;
}

/** Defensive sweep: reclaim expired leases, prune old completed jobs, materialize schedules, enqueue balance snapshot. */
registerHandler('maintenance.sweep', async ({ db, clock }) => {
  await sweepExpiredLeases(db, clock);
  await pruneCompleted(db, clock, COMPLETED_RETENTION_MS);
  await materializeSchedules(db, clock);
  await enqueue(db, clock, {
    queueClass: 'MAINTENANCE',
    kind: 'maintenance.retention',
    payload: {},
    idempotencyKey: `retention-${venueMinuteBucket(clock.nowMs())}`,
    priority: 'LOW',
  });
  await enqueue(db, clock, {
    queueClass: 'VERIFY',
    kind: 'maintenance.broker_balances',
    payload: {},
    idempotencyKey: `broker-balances-${venueMinuteBucket(clock.nowMs())}`,
    priority: 'LOW',
  });
});

/**
 * Retention audit (M6, D-030).
 *
 * Archive policy: append-only tables (`action_traces`, `verification_records`,
 * `assistant_messages`, `assistant_edits`, `credit_ledger`) are never hard-deleted
 * by app code. This handler counts rows beyond the 90-day hot window and logs for
 * operator audit until a cold-archive + purge job ships.
 *
 * Non-append `jobs` rows in `completed` status are pruned on a 7-day window by
 * `pruneCompleted` from `maintenance.sweep` — not from this handler.
 */
registerHandler('maintenance.retention', async ({ db, clock }) => {
  const nowMs = clock.nowMs();
  const staleTraces = await countTracesOlderThan(db, TRACE_HOT_RETENTION_MS, nowMs);
  const staleMessages = await countAssistantMessagesOlderThan(db, TRACE_HOT_RETENTION_MS, nowMs);
  const staleEdits = await countAssistantEditsOlderThan(db, TRACE_HOT_RETENTION_MS, nowMs);

  if (staleTraces > 0 || staleMessages > 0 || staleEdits > 0) {
    console.info('maintenance.retention: rows beyond 90d hot window (no purge)', {
      staleTraces,
      staleAssistantMessages: staleMessages,
      staleAssistantEdits: staleEdits,
      retentionDays: 90,
    });
  }
});

async function countAssistantMessagesOlderThan(
  db: Db,
  retentionMs: number,
  nowMs: number,
): Promise<number> {
  const cutoff = new Date(nowMs - retentionMs);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(assistantMessages)
    .where(lt(assistantMessages.createdAt, cutoff));
  return row?.count ?? 0;
}

async function countAssistantEditsOlderThan(
  db: Db,
  retentionMs: number,
  nowMs: number,
): Promise<number> {
  const cutoff = new Date(nowMs - retentionMs);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(assistantEdits)
    .where(lt(assistantEdits.createdAt, cutoff));
  return row?.count ?? 0;
}

/** Materialize due job_schedules into enqueued jobs (idempotent per schedule window). */
registerHandler('maintenance.materialize_schedules', async ({ db, clock }) => {
  await materializeSchedules(db, clock);
});

function venueMinuteBucket(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 16);
}

/** No-op used by queue smoke tests and drain verification. */
registerHandler('maintenance.noop', async () => {
  // intentionally empty
});

/**
 * Periodic broker balance snapshots for connected paper connections.
 * Live connections are skipped (fail-closed). Per-connection failures are
 * swallowed so one bad credential does not block the rest.
 */
registerHandler('maintenance.broker_balances', async ({ db, clock }) => {
  const connections = await db
    .select()
    .from(brokerConnections)
    .where(and(eq(brokerConnections.status, 'connected'), eq(brokerConnections.mode, 'paper')));

  for (const conn of connections) {
    if (conn.mode === 'live') {
      continue;
    }

    try {
      const plain = decryptSecret(conn.ciphertext, 'broker_credentials');
      const adapter = resolveBrokerAdapter({
        connection: {
          venue: conn.venue,
          mode: conn.mode,
          status: conn.status,
          credentials: parseStoredCredentials(plain),
        },
        nowMs: () => clock.nowMs(),
        paperSim: {
          getQuote: () => {
            throw new Error('paper_sim_unexpected_in_broker_balances');
          },
          startingCashCents: 0,
        },
      });

      const balances = await adapter.getBalances();
      const positions = adapter.getPositions ? await adapter.getPositions() : [];

      await db.insert(brokerBalancesSnapshot).values({
        connectionId: conn.id,
        cashCents: BigInt(balances.cashCents),
        buyingPowerCents: BigInt(balances.buyingPowerCents),
        positions,
        asOf: new Date(balances.asOfIso),
      });
    } catch {
      // Per-connection failure — continue with remaining connections.
    }
  }
});
