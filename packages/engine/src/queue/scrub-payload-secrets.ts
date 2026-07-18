import { eq, inArray } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { jobs } from '@hftr/db/schema';
import { FORBIDDEN_JOB_PAYLOAD_SECRET_KEYS, stripSecretsFromJobPayload } from './payload-secrets';

/**
 * Strip known secret fields from existing `jobs.payload` rows (D-074 migration).
 * Safe to run repeatedly; returns count of rows updated.
 */
export async function scrubSecretsFromJobPayloads(db: Db): Promise<number> {
  const rows = await db
    .select({ id: jobs.id, payload: jobs.payload })
    .from(jobs)
    .where(inArray(jobs.status, ['pending', 'active', 'failed', 'dead', 'completed']))
    .limit(1000);

  let updated = 0;
  for (const row of rows) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const next = stripSecretsFromJobPayload(payload);
    const dirty = FORBIDDEN_JOB_PAYLOAD_SECRET_KEYS.some((key) =>
      Object.prototype.hasOwnProperty.call(payload, key),
    );
    if (!dirty) continue;
    await db.update(jobs).set({ payload: next, updatedAt: new Date() }).where(eq(jobs.id, row.id));
    updated += 1;
  }
  return updated;
}
