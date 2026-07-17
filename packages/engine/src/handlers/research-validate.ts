import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { EvidencePackage } from '@hftr/contracts';
import { concepts, researchRequests } from '@hftr/db/schema';
import { validateEvidencePackages } from '../research/validation';
import {
  listEvidenceForRequest,
  loadResearchRequest,
  upsertResearchResult,
  upsertResearchRun,
} from '../research/run-state';
import { enqueue } from '../queue/queue';
import { estimateLlmJobCost } from '../queue/llm-cost-estimate';
import { registerHandler } from './registry';

const ValidatePayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  requestId: z.string().uuid(),
  researchRunId: z.string().uuid().optional(),
});

registerHandler('research.validate', async ({ db, clock, job }) => {
  const payload = ValidatePayload.parse(job.payload);
  const now = new Date(clock.nowMs());

  const request = await loadResearchRequest(db, payload.requestId);
  if (!request || request.companyId !== payload.companyId) {
    throw new Error('research_request_not_found');
  }

  const evidenceRows = await listEvidenceForRequest(db, payload.requestId);
  const evidencePackages = evidenceRows.map((row) =>
    EvidencePackage.parse(row.package ?? row),
  );

  const existing = await db
    .select({ title: concepts.title })
    .from(concepts)
    .where(and(eq(concepts.moduleId, payload.moduleId), eq(concepts.status, 'active')))
    .limit(40);

  const validation = validateEvidencePackages({
    evidencePackages,
    queryText: request.queryText,
    topicScope: request.topicScope,
    existingConceptTitles: existing.map((r) => r.title),
    nowMs: clock.nowMs(),
  });

  const evidenceIds = evidenceRows.map((r) => r.id);

  if (!validation.overallPass) {
    await upsertResearchRun(db, {
      requestId: payload.requestId,
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      phase: 'failed',
      evidenceCount: evidenceIds.length,
      validationPassed: false,
      now,
    });

    await upsertResearchResult(db, {
      requestId: payload.requestId,
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      status: 'validation_failed',
      evidenceIds,
      artifactRefs: validation.artifactRefs,
      validation,
      failureReason: validation.gates
        .filter((g) => !g.passed)
        .map((g) => g.gateId)
        .join(','),
      envelope: request.envelope as Record<string, unknown>,
      now,
    });

    await db
      .update(researchRequests)
      .set({ status: 'failed', updatedAt: now })
      .where(eq(researchRequests.id, payload.requestId));
    return;
  }

  await upsertResearchRun(db, {
    requestId: payload.requestId,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    phase: 'validate',
    evidenceCount: evidenceIds.length,
    validationPassed: true,
    now,
  });

  await upsertResearchResult(db, {
    requestId: payload.requestId,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    status: 'validated',
    evidenceIds,
    artifactRefs: validation.artifactRefs,
    validation,
    envelope: request.envelope as Record<string, unknown>,
    now,
  });

  await db
    .update(researchRequests)
    .set({ status: 'synthesizing', updatedAt: now })
    .where(eq(researchRequests.id, payload.requestId));

  await enqueue(db, clock, {
    queueClass: 'STRATEGIC',
    kind: 'research.synthesize',
    payload: {
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      requestId: payload.requestId,
      researchRunId: payload.researchRunId,
      topicScope: request.topicScope,
    },
    costEstimate: estimateLlmJobCost('research.synthesize'),
    idempotencyKey: `research-synthesize-${payload.requestId}`,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
  });
});
