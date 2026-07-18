import { createHash } from 'node:crypto';
import {
  ControlSnapshot,
  type LeverState,
  type PhilosophyProfile,
  type WeightEnvelope,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { controlSnapshots } from '@hftr/db/schema';
import type { Clock } from '../clock';
import { CATALOG_VERSION, LIVE_GATE_BANDS_VERSION } from '../limits/catalog-loader';

const BROKER_ENVELOPE_VERSION = 'bpe-001';

export type ControlSnapshotWithoutHash = Omit<ControlSnapshot, 'contentHash'>;

export interface PersistControlSnapshotArgs {
  companyId: string;
  moduleId: string | null;
  philosophyProfile: PhilosophyProfile;
  leverState: LeverState;
  policyEnvelopeVersion: string;
  weightEnvelopes?: WeightEnvelope[];
}

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortKeysDeep(record[key]);
  }
  return sorted;
}

/** Canonical JSON for deterministic content hashing (excludes contentHash). */
export function canonicalControlSnapshotJson(
  snapshotWithoutHash: ControlSnapshotWithoutHash,
): string {
  return JSON.stringify(sortKeysDeep(snapshotWithoutHash));
}

export function controlSnapshotContentHash(
  snapshotWithoutHash: ControlSnapshotWithoutHash,
): string {
  return createHash('sha256')
    .update(canonicalControlSnapshotJson(snapshotWithoutHash), 'utf8')
    .digest('hex');
}

/**
 * Append-only persist of a replayable control-plane snapshot (D-029).
 */
export async function persistControlSnapshot(
  db: Db,
  clock: Clock,
  args: PersistControlSnapshotArgs,
): Promise<{ id: string; contentHash: string }> {
  const withoutHash: ControlSnapshotWithoutHash = {
    schemaVersion: 1,
    companyId: args.companyId,
    moduleId: args.moduleId,
    philosophyProfile: args.philosophyProfile,
    leverState: args.leverState,
    ...(args.weightEnvelopes !== undefined ? { weightEnvelopes: args.weightEnvelopes } : {}),
    envelopeVersions: {
      policyEnvelopeVersion: args.policyEnvelopeVersion,
      brokerEnvelopeVersion: BROKER_ENVELOPE_VERSION,
      sessionCatalogVersion: CATALOG_VERSION,
      guardrailCatalogVersion: CATALOG_VERSION,
      liveGateBandsVersion: LIVE_GATE_BANDS_VERSION,
    },
    capturedAt: clock.nowIso(),
  };

  const contentHash = controlSnapshotContentHash(withoutHash);
  const snapshot = ControlSnapshot.parse({ ...withoutHash, contentHash });

  const rows = await db
    .insert(controlSnapshots)
    .values({
      companyId: snapshot.companyId,
      moduleId: snapshot.moduleId,
      snapshot,
      schemaVersion: String(snapshot.schemaVersion),
      contentHash: snapshot.contentHash,
    })
    .returning({
      id: controlSnapshots.id,
      contentHash: controlSnapshots.contentHash,
    });

  const row = rows[0];
  if (!row) {
    throw new Error('control_snapshot_insert_failed');
  }

  return { id: row.id, contentHash: row.contentHash };
}
