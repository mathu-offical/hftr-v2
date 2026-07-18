import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { EvidencePackage } from '@hftr/contracts';
import { concepts, researchRequests } from '@hftr/db/schema';
import { validateEvidencePackages } from '../research/validation';
import { recordCurationScoreEvent } from '../research/curation-score';
import { buildRejectRepairHints } from '../research/reject-repair';
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

  // Weak-supervision prior telemetry (D-071) — raw ratios stay in rawMeta only.
  for (const gate of validation.gates) {
    await recordCurationScoreEvent({
      db,
      companyId: payload.companyId,
      gateId: gate.gateId,
      scoreBand: gate.scoreBand,
      passed: gate.passed,
      reason: gate.reason,
      rawMeta: {
        evidenceCount: evidencePackages.length,
        relevanceBand: validation.relevanceBand,
      },
      now,
    });
  }

  const evidenceIds = evidenceRows.map((r) => r.id);

  // D-071: band-only repairHints for librarian reject-repair (never raw ratios).
  const failedGates = validation.gates.filter((g) => !g.passed);
  const repairHints = buildRejectRepairHints({
    shapeOk: failedGates.every((g) => g.gateId !== 'coherence'),
    overallBand: validation.relevanceBand,
    grounded: failedGates.every(
      (g) => g.gateId !== 'source_entitlement' && g.gateId !== 'leak_recheck',
    ),
    existingHints: failedGates.map((g) => g.reason).filter((r) => r.length > 0),
  }).map((h) => h.hint);
  const validationWithHints = { ...validation, repairHints };

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
      validation: validationWithHints,
      failureReason: failedGates.map((g) => g.gateId).join(','),
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
    validation: validationWithHints,
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
