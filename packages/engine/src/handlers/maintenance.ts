import { and, eq } from 'drizzle-orm';
import { resolveBrokerAdapter } from '@hftr/adapters';
import { brokerBalancesSnapshot, brokerConnections } from '@hftr/db/schema';
import { decryptSecret } from '@hftr/secrets';
import { materializeSchedules } from '../schedules/materialize';
import { enqueue, pruneCompleted, sweepExpiredLeases } from '../queue/queue';
import { scrubSecretsFromJobPayloads } from '../queue/scrub-payload-secrets';
import { archiveStaleHotRows } from '../retention/archive';
import { enqueueDueEquityRefreshJobs } from '../equity/schedule-refresh';
import { registerHandler } from './registry';

const COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TRACE_HOT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function parseStoredCredentials(plain: string): unknown {
  return JSON.parse(plain) as unknown;
}

/** Defensive sweep: reclaim expired leases, prune old completed jobs, materialize schedules, enqueue balance snapshot. */
registerHandler('maintenance.sweep', async ({ db, clock }) => {
  await sweepExpiredLeases(db, clock);
  // D-074: redact any legacy plaintext keys left in jobs.payload before prune.
  const scrubbed = await scrubSecretsFromJobPayloads(db);
  if (scrubbed > 0) {
    console.info('maintenance.sweep: scrubbed secret fields from job payloads', { scrubbed });
  }
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
  // D-084: 15s equity fallback while XNYS session is open (idempotent per window).
  await enqueueDueEquityRefreshJobs(db, clock);
});

/**
 * Retention archive (M6, D-036).
 *
 * Moves rows older than the 90-day hot window from hot tables into archive tables,
 * then deletes from hot storage. Batches up to 10 rounds per sweep.
 *
 * Non-append `jobs` rows in `completed` status are pruned on a 7-day window by
 * `pruneCompleted` from `maintenance.sweep` — not from this handler.
 */
registerHandler('maintenance.retention', async ({ db, clock }) => {
  const cutoff = new Date(clock.nowMs() - TRACE_HOT_RETENTION_MS);
  const totals = { tracesArchived: 0, messagesArchived: 0, editsArchived: 0 };

  for (let round = 0; round < 10; round += 1) {
    const counts = await archiveStaleHotRows(db, cutoff);
    totals.tracesArchived += counts.tracesArchived;
    totals.messagesArchived += counts.messagesArchived;
    totals.editsArchived += counts.editsArchived;
    if (
      counts.tracesArchived === 0 &&
      counts.messagesArchived === 0 &&
      counts.editsArchived === 0
    ) {
      break;
    }
  }

  if (totals.tracesArchived > 0 || totals.messagesArchived > 0 || totals.editsArchived > 0) {
    console.info('maintenance.retention: archived stale hot rows', {
      ...totals,
      retentionDays: 90,
      cutoff: cutoff.toISOString(),
    });
  }
});

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
