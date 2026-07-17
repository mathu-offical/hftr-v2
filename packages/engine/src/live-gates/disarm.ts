import { and, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { companies } from '@hftr/db/schema';

export type AutoDisarmReason =
  'broker_verify_failed' | 'stale_evidence' | 'execution_context_blocked';

/**
 * Fail-closed live disarm: clears operator arming and bound evidence pointer.
 * Evidence rows remain append-only in `live_gate_evidence`.
 */
export async function autoDisarmCompany(
  db: Db,
  companyId: string,
  reason: AutoDisarmReason,
): Promise<boolean> {
  const [updated] = await db
    .update(companies)
    .set({
      liveArmedAt: null,
      liveGateEvidenceId: null,
      updatedAt: new Date(),
    })
    .where(and(eq(companies.id, companyId), isNotNull(companies.liveArmedAt)))
    .returning({ id: companies.id });

  if (updated) {
    console.info('live_gate_auto_disarm', { companyId, reason });
    return true;
  }
  return false;
}

/** Disarm every armed company bound to a broker connection (verify failure path). */
export async function autoDisarmCompaniesForBroker(
  db: Db,
  brokerConnectionId: string,
  reason: AutoDisarmReason,
): Promise<number> {
  const armed = await db
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(eq(companies.brokerConnectionId, brokerConnectionId), isNotNull(companies.liveArmedAt)),
    );
  let count = 0;
  for (const row of armed) {
    if (await autoDisarmCompany(db, row.id, reason)) count += 1;
  }
  return count;
}
