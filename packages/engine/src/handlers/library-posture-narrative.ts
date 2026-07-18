/**
 * Posture narrative stage (D-120) — seal-grounded synthesis after movers/sector/daily.
 * Waits for parallel seal stages, then deterministic book↔tape rollup (leak-safe).
 * LLM narrative schemas deferred.
 */

import { and, desc, eq } from 'drizzle-orm';
import { SystemTopicScope } from '@hftr/contracts';
import { z } from 'zod';
import {
  concepts,
  libraryConcepts,
  modules,
  positions,
  watchlistItems,
  leadPackages,
} from '@hftr/db/schema';
import { ensureSystemLibrary } from '../libraries/ensure-system-library';
import { loadLatestValidSeal } from '../research/seal-load';
import { buildPostureContextRollup } from '../research/posture-context-rollup';
import {
  completeSynthesisRunAfterNarrative,
  recordSynthesisStage,
  waitForSealStages,
} from '../research/market-hub-synthesis';
import { registerHandler } from './registry';

const Payload = z.object({
  companyId: z.string().uuid(),
  synthesisRunId: z.string().uuid(),
  phase: z.string().max(40).optional(),
});

const NARRATIVE_TITLE = 'posture_synthesis_narrative';

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
    summary: 'Waiting for movers / sector / daily seal stages',
    justificationLines: ['Parallel reseal jobs; narrative gated on stage terminal'],
    jobId: job.id,
    now,
  });

  const sealsReady = await waitForSealStages(db, runId, {
    timeoutMs: 90_000,
    pollMs: 1_500,
  });

  if (sealsReady.timedOut) {
    await recordSynthesisStage(db, {
      runId,
      companyId: payload.companyId,
      stageId: 'narrative',
      status: 'running',
      summary: 'Seal wait timed out — composing with available seals',
      justificationLines: [
        `seal_movers ${sealsReady.movers.status ?? 'missing'}`,
        `sector ${sealsReady.sector.status ?? 'missing'}`,
        `daily ${sealsReady.daily.status ?? 'missing'}`,
      ],
      jobId: job.id,
      now: new Date(clock.nowMs()),
    });
  }

  const movers = await loadLatestValidSeal(db, {
    companyId: payload.companyId,
    kind: 'movers_board',
    subjectKey: 'daily',
    nowMs: clock.nowMs(),
  });
  const sector = await loadLatestValidSeal(db, {
    companyId: payload.companyId,
    kind: 'sector_bulletin',
    subjectKey: 'sector_daily',
    nowMs: clock.nowMs(),
  });
  const phase = payload.phase ?? 'pre_open';
  const daily = await loadLatestValidSeal(db, {
    companyId: payload.companyId,
    kind: 'daily_summary_phase',
    subjectKey: `phase_${phase}`,
    nowMs: clock.nowMs(),
  });

  const heldRows = await db
    .select({ symbol: positions.symbol, qty: positions.qty })
    .from(positions)
    .where(eq(positions.companyId, payload.companyId));
  const heldSymbols = heldRows
    .filter((r) => r.qty !== 0n)
    .map((r) => r.symbol);

  const watchRows = await db
    .select({ symbol: watchlistItems.symbol, status: watchlistItems.status })
    .from(watchlistItems)
    .where(eq(watchlistItems.companyId, payload.companyId));
  const watchSymbols = watchRows
    .filter((w) => w.status === 'watching' || w.status === 'suggested_verified')
    .map((w) => w.symbol);

  const leadRows = await db
    .select({ symbol: leadPackages.symbol })
    .from(leadPackages)
    .where(eq(leadPackages.companyId, payload.companyId))
    .limit(40);
  const pipelineSymbols = leadRows.map((l) => l.symbol);

  const moverSymbols =
    movers?.view.items
      ?.map((it) => it.symbolOrSector)
      .filter((s): s is string => typeof s === 'string' && s.length > 0) ?? [];

  const rollup = buildPostureContextRollup({
    heldSymbols,
    watchSymbols,
    pipelineSymbols,
    moverSymbols,
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

  let conceptId: string | null = null;
  if (ownerModuleId) {
    const libraryId = await ensureSystemLibrary(
      db,
      payload.companyId,
      SystemTopicScope.DAILY_SUMMARIES,
      new Date(clock.nowMs()),
      { refreshPlaceholders: false },
    );

    const [existing] = await db
      .select({ id: concepts.id })
      .from(concepts)
      .where(
        and(
          eq(concepts.companyId, payload.companyId),
          eq(concepts.title, NARRATIVE_TITLE),
          eq(concepts.status, 'active'),
        ),
      )
      .orderBy(desc(concepts.updatedAt))
      .limit(1);

    const sourceRef = `posture-run:${runId}`;
    const writeAt = new Date(clock.nowMs());
    if (existing) {
      await db
        .update(concepts)
        .set({
          body: rollup.body,
          tags: ['posture', 'synthesis', 'narrative'],
          sourceRef,
          sourceClass: 'deterministic_placeholder',
          primaryLibraryId: libraryId,
          updatedAt: writeAt,
        })
        .where(eq(concepts.id, existing.id));
      conceptId = existing.id;
    } else {
      const inserted = await db
        .insert(concepts)
        .values({
          companyId: payload.companyId,
          moduleId: ownerModuleId,
          title: NARRATIVE_TITLE,
          body: rollup.body,
          tags: ['posture', 'synthesis', 'narrative'],
          sourceRef,
          sourceClass: 'deterministic_placeholder',
          primaryLibraryId: libraryId,
          updatedAt: writeAt,
        })
        .returning({ id: concepts.id });
      conceptId = inserted[0]?.id ?? null;
      if (conceptId) {
        await db.insert(libraryConcepts).values({
          libraryId,
          conceptId,
          curationStatus: 'auto_admitted',
        });
      }
    }
  }

  const partial =
    !movers ||
    !sector ||
    !daily ||
    !sealsReady.movers.ok ||
    !sealsReady.sector.ok ||
    !sealsReady.daily.ok ||
    sealsReady.timedOut;

  await recordSynthesisStage(db, {
    runId,
    companyId: payload.companyId,
    stageId: 'narrative',
    status: 'succeeded',
    summary: rollup.summaryLines.slice(0, 2).join(' · ').slice(0, 2000),
    justificationLines: [
      ...rollup.justificationLines,
      ...(conceptId ? [`Narrative concept ${conceptId.slice(0, 8)}…`] : ['No concept owner module']),
    ],
    jobId: job.id,
    now: new Date(clock.nowMs()),
  });

  await completeSynthesisRunAfterNarrative(db, {
    runId,
    companyId: payload.companyId,
    now: new Date(clock.nowMs()),
    partial,
  });
});
