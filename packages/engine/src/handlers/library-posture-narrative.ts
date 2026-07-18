/**
 * Posture narrative stage (D-120) — seal-grounded synthesis after movers/sector/daily.
 * Deterministic template from seal titles/bands (leak-safe). LLM narrative schemas deferred.
 */

import { eq } from 'drizzle-orm';
import { SystemTopicScope } from '@hftr/contracts';
import { z } from 'zod';
import { concepts, libraryConcepts, modules } from '@hftr/db/schema';
import { ensureSystemLibrary } from '../libraries/ensure-system-library';
import { loadLatestValidSeal } from '../research/seal-load';
import {
  completeSynthesisRunAfterNarrative,
  recordSynthesisStage,
} from '../research/market-hub-synthesis';
import { registerHandler } from './registry';

const Payload = z.object({
  companyId: z.string().uuid(),
  synthesisRunId: z.string().uuid(),
  phase: z.string().max(40).optional(),
});

function buildDeterministicNarrative(opts: {
  moversTitle: string | null;
  moversBand: string | null;
  sectorTitle: string | null;
  sectorBand: string | null;
  dailyTitle: string | null;
  dailyBand: string | null;
  phase: string;
}): string {
  return [
    '# Posture synthesis narrative',
    '',
    'Qualitative rollup of sealed posture views. Bands only — no raw marks or quantities.',
    '',
    '## Movers board',
    '',
    opts.moversTitle
      ? `Sealed «${opts.moversTitle}» with corroboration band **${opts.moversBand ?? 'unknown'}**.`
      : 'Movers board seal not available for this run.',
    '',
    '## Sector bulletin',
    '',
    opts.sectorTitle
      ? `Sealed «${opts.sectorTitle}» with corroboration band **${opts.sectorBand ?? 'unknown'}**.`
      : 'Sector bulletin seal not available for this run.',
    '',
    '## Daily summary',
    '',
    opts.dailyTitle
      ? `Phase **${opts.phase}** sealed as «${opts.dailyTitle}» (band **${opts.dailyBand ?? 'unknown'}**).`
      : `Phase **${opts.phase}** daily summary seal not available.`,
    '',
    '## Operator note',
    '',
    'Use Market posture Sync for full hub projection. Live equity/marks poll separately (D-112).',
  ].join('\n');
}

registerHandler('library.posture_narrative', async ({ db, clock, job }) => {
  const payload = Payload.parse(job.payload);
  const now = new Date(clock.nowMs());
  const nowMs = clock.nowMs();
  const runId = payload.synthesisRunId;

  await recordSynthesisStage(db, {
    runId,
    companyId: payload.companyId,
    stageId: 'narrative',
    status: 'running',
    summary: 'Composing seal-grounded posture narrative',
    justificationLines: ['Deterministic template from seal titles/bands'],
    jobId: job.id,
    now,
  });

  const movers = await loadLatestValidSeal(db, {
    companyId: payload.companyId,
    kind: 'movers_board',
    subjectKey: 'daily',
    nowMs,
  });
  const sector = await loadLatestValidSeal(db, {
    companyId: payload.companyId,
    kind: 'sector_bulletin',
    subjectKey: 'sector_daily',
    nowMs,
  });
  const phase = payload.phase ?? 'pre_open';
  const daily = await loadLatestValidSeal(db, {
    companyId: payload.companyId,
    kind: 'daily_summary_phase',
    subjectKey: `phase_${phase}`,
    nowMs,
  });

  const body = buildDeterministicNarrative({
    moversTitle: movers?.view.title ?? null,
    moversBand: movers?.corroborationBand ?? null,
    sectorTitle: sector?.view.title ?? null,
    sectorBand: sector?.corroborationBand ?? null,
    dailyTitle: daily?.view.title ?? null,
    dailyBand: daily?.corroborationBand ?? null,
    phase,
  });

  const companyModules = await db
    .select({ id: modules.id, type: modules.type })
    .from(modules)
    .where(eq(modules.companyId, payload.companyId));
  const ownerModuleId =
    companyModules.find((m) => m.type === 'research')?.id ??
    companyModules.find((m) => m.type === 'librarian')?.id ??
    companyModules.find((m) => m.type === 'library')?.id;

  if (ownerModuleId) {
    const libraryId = await ensureSystemLibrary(
      db,
      payload.companyId,
      SystemTopicScope.DAILY_SUMMARIES,
      now,
      { refreshPlaceholders: false },
    );
    const inserted = await db
      .insert(concepts)
      .values({
        companyId: payload.companyId,
        moduleId: ownerModuleId,
        title: 'posture_synthesis_narrative',
        body,
        tags: ['posture', 'synthesis', 'narrative'],
        sourceRef: movers ? `seal:${movers.sealId}` : `posture-run:${runId}`,
        sourceClass: 'deterministic_placeholder',
        primaryLibraryId: libraryId,
        updatedAt: now,
      })
      .returning({ id: concepts.id });
    const conceptId = inserted[0]?.id;
    if (conceptId) {
      await db.insert(libraryConcepts).values({
        libraryId,
        conceptId,
        curationStatus: 'auto_admitted',
      });
    }
  }

  await recordSynthesisStage(db, {
    runId,
    companyId: payload.companyId,
    stageId: 'narrative',
    status: 'succeeded',
    summary: 'Deterministic seal-grounded narrative',
    justificationLines: ['Deterministic template from seal titles/bands'],
    jobId: job.id,
    now: new Date(clock.nowMs()),
  });

  const partial = !movers || !sector || !daily;
  await completeSynthesisRunAfterNarrative(db, {
    runId,
    companyId: payload.companyId,
    now: new Date(clock.nowMs()),
    partial,
  });
});
