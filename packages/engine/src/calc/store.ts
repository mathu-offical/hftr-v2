import { createHash, randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { numericValues } from '@hftr/db/schema';
import { NumericKind, SanityEnvelope, TEMPORAL_KINDS, ValueSourceClass } from '@hftr/contracts';
import type { Clock } from '../clock';

/**
 * Append-only ValueRef store (number-handling.md §3).
 * Values enter ONLY through record(); they never mutate.
 */

export interface RecordInput {
  kind: NumericKind;
  unit: string;
  scale: number;
  valueInt: bigint;
  timezone?: string | null;
  sourceClass: ValueSourceClass;
  sourceId: string;
  ttlMs: number;
  parentRefs?: string[];
  sanity?: SanityEnvelope;
  companyId?: string | null;
  moduleId?: string | null;
}

export type StoredRow = typeof numericValues.$inferSelect;

const DEFAULT_SANITY: SanityEnvelope = {
  minInt: null,
  maxInt: null,
  maxAgeMs: null,
  mustBePositive: false,
};

export function newRef(): string {
  return `nv_${randomUUID().replaceAll('-', '')}`;
}

function lineageHash(input: RecordInput, ref: string): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        ref,
        kind: input.kind,
        valueInt: input.valueInt.toString(),
        scale: input.scale,
        sourceId: input.sourceId,
        parents: input.parentRefs ?? [],
      }),
    )
    .digest('hex')
    .slice(0, 32);
}

export async function record(db: Db, clock: Clock, input: RecordInput): Promise<string> {
  if (TEMPORAL_KINDS.has(input.kind) && !input.timezone) {
    throw new Error(`temporal kind ${input.kind} requires an IANA timezone`);
  }
  const ref = newRef();
  await db.insert(numericValues).values({
    ref,
    kind: input.kind,
    unit: input.unit,
    scale: input.scale,
    valueInt: input.valueInt,
    timezone: input.timezone ?? null,
    sourceClass: input.sourceClass,
    sourceId: input.sourceId,
    capturedAt: new Date(clock.nowMs()),
    ttlMs: BigInt(input.ttlMs),
    parentRefs: input.parentRefs ?? [],
    sanityEnvelope: input.sanity ?? DEFAULT_SANITY,
    companyId: input.companyId ?? null,
    moduleId: input.moduleId ?? null,
    lineageHash: lineageHash(input, ref),
  });
  return ref;
}

export async function load(db: Db, ref: string): Promise<StoredRow> {
  const rows = await db.select().from(numericValues).where(eq(numericValues.ref, ref)).limit(1);
  const row = rows[0];
  if (!row) throw new Error(`unknown ValueRef: ${ref}`);
  return row;
}

export async function loadMany(db: Db, refs: string[]): Promise<Map<string, StoredRow>> {
  const out = new Map<string, StoredRow>();
  for (const ref of refs) {
    out.set(ref, await load(db, ref)); // fine at current fan-in; batch later if hot
  }
  return out;
}

/**
 * Latest append-only ValueRef for a sourceId (peak marks, etc.).
 * Returns null when none recorded yet.
 */
export async function loadLatestBySourceId(
  db: Db,
  sourceId: string,
): Promise<StoredRow | null> {
  const rows = await db
    .select()
    .from(numericValues)
    .where(eq(numericValues.sourceId, sourceId))
    .orderBy(desc(numericValues.capturedAt))
    .limit(1);
  return rows[0] ?? null;
}

export function isExpired(row: StoredRow, clock: Clock): boolean {
  return clock.nowMs() > row.capturedAt.getTime() + Number(row.ttlMs);
}
