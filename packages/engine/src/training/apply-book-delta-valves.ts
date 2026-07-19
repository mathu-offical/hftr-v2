import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  ControlSnapshot,
  DEFAULT_PHILOSOPHY_PROFILE,
  TrainingFeedbackDelta,
  type LeverState,
  type PhilosophyBandPosition,
  type PhilosophyProfile,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { companies, controlSnapshots, trainingFeedback } from '@hftr/db/schema';
import type { Clock } from '../clock';
import { persistControlSnapshot } from '../control-snapshot/persist';
import { resolvePhilosophyControl } from '../pipeline/philosophy-control';
import { applyControlSnapshotDelta } from './apply-control-snapshot-delta';
import {
  BOOK_DELTA_VALVE_BAND_ID,
  proposeBandPositionFromBookDeltas,
  type BookDeltaValveObservation,
} from './book-delta-valve-proposal';

export type ApplyBookDeltaValvesResult =
  | {
      ok: true;
      appliedSnapshotId: string;
      observationIds: string[];
      delta: Extract<TrainingFeedbackDelta, { mutationClass: 'band_position' }>;
      medianAbsBps: number | null;
    }
  | {
      ok: false;
      reason:
        | 'no_observations'
        | 'insufficient_samples'
        | 'no_step'
        | 'apply_failed'
        | 'company_not_found';
      detail?: string;
    };

function positionForBand(
  leverState: LeverState,
  bandId: string,
): PhilosophyBandPosition {
  const setting = leverState[bandId];
  if (setting && setting.mode === 'band') return setting.position;
  return 'typical';
}

function observationFromDelta(raw: unknown): BookDeltaValveObservation {
  const parsed = TrainingFeedbackDelta.safeParse(raw);
  if (!parsed.success || parsed.data.mutationClass !== 'book_delta') {
    return {};
  }
  const bps = parsed.data.fillPriceDeltaBps;
  if (typeof bps === 'number' && Number.isFinite(bps)) {
    return { fillPriceDeltaBps: bps };
  }
  // Linked without bps ⇒ shadow reject / pending path.
  return { providerReject: true };
}

/**
 * Consume unapplied book_delta training_feedback rows → bounded participation
 * valve step → control_snapshot + applied band_position feedback (D-205).
 * Model-free; fail-closed when samples are insufficient or step is zero.
 */
export async function applyBookDeltaValvesForModule(
  db: Db,
  clock: Clock,
  args: {
    companyId: string;
    moduleId: string;
    minSamples?: number;
    limit?: number;
  },
): Promise<ApplyBookDeltaValvesResult> {
  const limit = args.limit ?? 50;
  const rows = await db
    .select({
      id: trainingFeedback.id,
      delta: trainingFeedback.delta,
    })
    .from(trainingFeedback)
    .where(
      and(
        eq(trainingFeedback.companyId, args.companyId),
        eq(trainingFeedback.moduleId, args.moduleId),
        eq(trainingFeedback.mutationClass, 'book_delta'),
        isNull(trainingFeedback.appliedControlSnapshotId),
      ),
    )
    .orderBy(desc(trainingFeedback.createdAt))
    .limit(limit);

  if (rows.length === 0) {
    return { ok: false, reason: 'no_observations' };
  }

  const observations = rows.map((r) => observationFromDelta(r.delta));
  const companyRows = await db
    .select({
      philosophyProfile: companies.philosophyProfile,
    })
    .from(companies)
    .where(eq(companies.id, args.companyId))
    .limit(1);
  if (companyRows.length === 0) {
    return { ok: false, reason: 'company_not_found' };
  }

  const latestSnap = await db
    .select({ snapshot: controlSnapshots.snapshot })
    .from(controlSnapshots)
    .where(
      and(
        eq(controlSnapshots.companyId, args.companyId),
        eq(controlSnapshots.moduleId, args.moduleId),
      ),
    )
    .orderBy(desc(controlSnapshots.createdAt))
    .limit(1);

  let philosophyProfile: PhilosophyProfile = resolvePhilosophyControl({
    philosophyProfile: companyRows[0]!.philosophyProfile ?? DEFAULT_PHILOSOPHY_PROFILE,
  }).philosophyProfile;
  let leverState: LeverState = resolvePhilosophyControl({
    philosophyProfile,
  }).leverState;
  let policyEnvelopeVersion = 'paper_balanced_general_v1';

  if (latestSnap[0]) {
    const parsed = ControlSnapshot.safeParse(latestSnap[0].snapshot);
    if (parsed.success) {
      philosophyProfile = parsed.data.philosophyProfile;
      leverState = parsed.data.leverState;
      policyEnvelopeVersion =
        parsed.data.envelopeVersions.policyEnvelopeVersion ?? policyEnvelopeVersion;
    }
  }

  const proposal = proposeBandPositionFromBookDeltas({
    observations,
    currentPosition: positionForBand(leverState, BOOK_DELTA_VALVE_BAND_ID),
    ...(args.minSamples !== undefined ? { minSamples: args.minSamples } : {}),
    bandId: BOOK_DELTA_VALVE_BAND_ID,
  });

  if (!proposal.ok) {
    return {
      ok: false,
      reason: proposal.reason === 'unknown_band' ? 'apply_failed' : proposal.reason,
      detail: `samples=${proposal.sampleCount} medianAbsBps=${proposal.medianAbsBps}`,
    };
  }

  const applied = applyControlSnapshotDelta({
    leverState,
    delta: proposal.delta,
    outcomeScore: proposal.outcomeScore,
  });
  if (!applied.ok) {
    return { ok: false, reason: 'apply_failed', detail: applied.reason };
  }

  const { id: snapshotId } = await persistControlSnapshot(db, clock, {
    companyId: args.companyId,
    moduleId: args.moduleId,
    philosophyProfile,
    leverState: applied.leverState,
    policyEnvelopeVersion,
  });

  const observationIds = rows.map((r) => r.id);
  await db
    .update(trainingFeedback)
    .set({ appliedControlSnapshotId: snapshotId })
    .where(inArray(trainingFeedback.id, observationIds));

  await db.insert(trainingFeedback).values({
    companyId: args.companyId,
    moduleId: args.moduleId,
    mutationClass: 'band_position',
    delta: applied.applied,
    appliedControlSnapshotId: snapshotId,
  });

  return {
    ok: true,
    appliedSnapshotId: snapshotId,
    observationIds,
    delta: applied.applied as Extract<
      TrainingFeedbackDelta,
      { mutationClass: 'band_position' }
    >,
    medianAbsBps: proposal.medianAbsBps,
  };
}
