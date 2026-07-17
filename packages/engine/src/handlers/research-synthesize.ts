import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { EvidencePackage } from '@hftr/contracts';
import { researchRequests } from '@hftr/db/schema';
import { persistConceptBatch } from '../research/research-persist';
import {
  listEvidenceForRequest,
  loadResearchRequest,
  upsertResearchResult,
  upsertResearchRun,
} from '../research/run-state';
import { buildDeterministicBatchFromEvidence, runResearchSynthesis } from '../research/synthesis';
import { enqueue } from '../queue/queue';
import { venueDate } from '../calendar/calendar';
import { estimateLlmJobCost } from '../queue/llm-cost-estimate';
import { registerHandler } from './registry';

const SynthesizePayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  requestId: z.string().uuid(),
  researchRunId: z.string().uuid().optional(),
  topicScope: z.string().max(200).optional(),
});

registerHandler('research.synthesize', async ({ db, clock, job, modelGateway }) => {
  const payload = SynthesizePayload.parse(job.payload);
  const now = new Date(clock.nowMs());

  const request = await loadResearchRequest(db, payload.requestId);
  if (!request || request.companyId !== payload.companyId) {
    throw new Error('research_request_not_found');
  }

  const topicScope = payload.topicScope ?? request.topicScope;
  const evidenceRows = await listEvidenceForRequest(db, payload.requestId);
  const evidencePackages = evidenceRows.map((row) => EvidencePackage.parse(row.package ?? row));

  let batch =
    modelGateway && process.env.HFTR_LLM_MODE !== 'deterministic'
      ? await runResearchSynthesis({
          db,
          clock,
          job,
          modelGateway,
          companyId: payload.companyId,
          moduleId: payload.moduleId,
          topicScope,
        })
      : null;
  const synthesizedViaModel = batch != null;

  if (!batch) {
    batch = buildDeterministicBatchFromEvidence({ evidencePackages, topicScope });
  }

  const runId =
    payload.researchRunId ??
    (await upsertResearchRun(db, {
      requestId: payload.requestId,
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      phase: 'synthesize',
      evidenceCount: evidenceRows.length,
      now,
    }));

  const conceptIds = await persistConceptBatch({
    db,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    batch,
    now,
    researchRunId: runId,
    sourceClass: synthesizedViaModel ? 'model_generated' : 'deterministic_placeholder',
    curationStatus: 'proposed',
    topicId: request.topicId ?? null,
  });

  await upsertResearchRun(db, {
    requestId: payload.requestId,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    phase: 'synthesize',
    evidenceCount: evidenceRows.length,
    conceptCount: conceptIds.length,
    now,
  });

  await upsertResearchResult(db, {
    requestId: payload.requestId,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    status: 'synthesized',
    evidenceIds: evidenceRows.map((r) => r.id),
    conceptIds,
    envelope: request.envelope as Record<string, unknown>,
    now,
  });

  await db
    .update(researchRequests)
    .set({ status: 'admitting', updatedAt: now })
    .where(eq(researchRequests.id, payload.requestId));

  await enqueue(db, clock, {
    queueClass: 'RESEARCH',
    kind: 'research.admit',
    payload: {
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      requestId: payload.requestId,
      researchRunId: runId,
      conceptIds,
    },
    idempotencyKey: `research-admit-${payload.requestId}`,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
  });

  if (batch.escalateToStrategic) {
    const day = venueDate(clock.nowMs(), 'America/New_York');
    await enqueue(db, clock, {
      queueClass: 'STRATEGIC',
      kind: 'research.strategic',
      costEstimate: estimateLlmJobCost('research.strategic'),
      payload: {
        companyId: payload.companyId,
        moduleId: payload.moduleId,
        topicScope,
      },
      idempotencyKey: `strategic-research-${payload.moduleId}-${topicScope}-${day}`,
      priority: 'NORMAL',
      companyId: payload.companyId,
      moduleId: payload.moduleId,
    });
  }
});
