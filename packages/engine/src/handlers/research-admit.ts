import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { ResearchModuleConfig } from '@hftr/contracts';
import { libraryConcepts, modules, researchRequests } from '@hftr/db/schema';
import { bumpConceptConfidence } from '../libraries/archive';
import { resolveAdmissionStatus } from '../research/admission';
import {
  loadResearchRequest,
  upsertResearchResult,
  upsertResearchRun,
} from '../research/run-state';
import { registerHandler } from './registry';

const AdmitPayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  requestId: z.string().uuid(),
  researchRunId: z.string().uuid().optional(),
  conceptIds: z.array(z.string().uuid()).optional(),
});

registerHandler('research.admit', async ({ db, clock, job }) => {
  const payload = AdmitPayload.parse(job.payload);
  const now = new Date(clock.nowMs());

  const request = await loadResearchRequest(db, payload.requestId);
  if (!request || request.companyId !== payload.companyId) {
    throw new Error('research_request_not_found');
  }

  const [mod] = await db
    .select({ config: modules.config })
    .from(modules)
    .where(and(eq(modules.id, payload.moduleId), eq(modules.companyId, payload.companyId)))
    .limit(1);
  if (!mod) throw new Error('module_not_found');

  const config = ResearchModuleConfig.parse(mod.config);
  const admissionStatus = resolveAdmissionStatus(config.admissionMode);
  const resultStatus = admissionStatus === 'auto_admitted' ? 'admitted' : 'proposed';

  const conceptIds = payload.conceptIds ?? [];

  if (conceptIds.length > 0) {
    await db
      .update(libraryConcepts)
      .set({
        curationStatus: admissionStatus,
        researchRunId: payload.researchRunId ?? null,
        updatedAt: now,
      })
      .where(
        and(
          inArray(libraryConcepts.conceptId, conceptIds),
          eq(libraryConcepts.curationStatus, 'proposed'),
        ),
      );

    if (admissionStatus === 'auto_admitted') {
      for (const conceptId of conceptIds) {
        await bumpConceptConfidence(db, conceptId, 'verify', now);
      }
    }
  }

  await upsertResearchRun(db, {
    requestId: payload.requestId,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    phase: 'done',
    conceptCount: conceptIds.length,
    admissionApplied: admissionStatus,
    now,
  });

  await upsertResearchResult(db, {
    requestId: payload.requestId,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    status: resultStatus,
    conceptIds,
    admissionMode: config.admissionMode,
    envelope: request.envelope as Record<string, unknown>,
    now,
  });

  await db
    .update(researchRequests)
    .set({ status: 'completed', updatedAt: now })
    .where(eq(researchRequests.id, payload.requestId));
});
