import { and, eq } from 'drizzle-orm';
import { resolveBrokerAdapter } from '@hftr/adapters';
import { brokerBalancesSnapshot, brokerConnections } from '@hftr/db/schema';
import { decryptSecret } from '@hftr/secrets';
import { enqueue, pruneCompleted, sweepExpiredLeases } from '../queue/queue';
import { registerHandler } from './registry';

const COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function parseStoredCredentials(plain: string): unknown {
  return JSON.parse(plain) as unknown;
}

/** Defensive sweep: reclaim expired leases, prune old completed jobs, enqueue balance snapshot. */
registerHandler('maintenance.sweep', async ({ db, clock }) => {
  await sweepExpiredLeases(db, clock);
  await pruneCompleted(db, clock, COMPLETED_RETENTION_MS);
  await enqueue(db, clock, {
    queueClass: 'VERIFY',
    kind: 'maintenance.broker_balances',
    payload: {},
    idempotencyKey: `broker-balances-${venueMinuteBucket(clock.nowMs())}`,
    priority: 'LOW',
  });
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
