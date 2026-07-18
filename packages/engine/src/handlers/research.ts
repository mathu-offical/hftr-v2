import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ResearchModuleConfig, ResearchQueryMode } from '@hftr/contracts';
import { modules, researchRequests } from '@hftr/db/schema';
import { venueDate } from '../calendar/calendar';
import { buildResearchEnvelope } from '../research/envelope';
import { persistConceptBatch } from '../research/research-persist';
import { runResearchSynthesis } from '../research/synthesis';
import { upsertResearchRun } from '../research/run-state';
import { enqueue } from '../queue/queue';
import { curateDeterministic } from './research-deterministic';
import { registerHandler } from './registry';

/** Identity + intent only — never API keys (D-074; resolved in research.gather). */
const CuratePayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  topicScope: z.string().max(200).optional(),
  queryText: z.string().max(500).optional(),
  mode: ResearchQueryMode.optional(),
  topicId: z.string().uuid().optional(),
  sourceModuleId: z.string().uuid().optional(),
  sourceKinds: z.array(z.string()).max(24).optional(),
});

const StrategicPayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  topicScope: z.string().max(200).default(''),
});

/**
 * RESEARCH queue: thin orchestrator — creates request/run rows and enqueues gather.
 */
registerHandler('research.curate', async ({ db, clock, job }) => {
  const payload = CuratePayload.parse(job.payload);
  const now = new Date(clock.nowMs());

  const [mod] = await db
    .select({ config: modules.config })
    .from(modules)
    .where(and(eq(modules.id, payload.moduleId), eq(modules.companyId, payload.companyId)))
    .limit(1);
  if (!mod) throw new Error('module_not_found');

  const config = ResearchModuleConfig.parse(mod.config);
  const topicScope = payload.topicScope ?? config.topicScope;
  const queryText = payload.queryText ?? topicScope;
  const mode = payload.mode ?? 'opportunistic';
  const day = venueDate(clock.nowMs(), 'America/New_York');
  const idempotencyKey = `research-curate-${payload.moduleId}-${day}`;

  const envelope = buildResearchEnvelope({
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    idempotencyKey,
    causationRefs: [`job:${job.id}`],
  });

  const inserted = await db
    .insert(researchRequests)
    .values({
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      mode,
      queryText,
      topicScope,
      topicId: payload.topicId ?? null,
      sourceModuleId: payload.sourceModuleId ?? null,
      sourceKinds: payload.sourceKinds ?? [],
      maxEvidence: 8,
      status: 'queued',
      envelope,
    })
    .returning({ id: researchRequests.id });

  const requestRow = inserted[0];
  if (!requestRow) throw new Error('research_request_insert_failed');
  const requestId = requestRow.id;

  await upsertResearchRun(db, {
    requestId,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    phase: 'gather',
    now,
  });

  await enqueue(db, clock, {
    queueClass: 'RESEARCH',
    kind: 'research.gather',
    payload: {
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      requestId,
      queryText,
      topicScope,
      sourceKinds: payload.sourceKinds,
    },
    idempotencyKey: `research-gather-${requestId}`,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
  });
});

/**
 * STRATEGIC queue: re-run strategic synthesis (escalate path).
 * Falls back to deterministic catalog curation when gateway absent.
 */
registerHandler('research.strategic', async ({ db, clock, job, modelGateway }) => {
  const payload = StrategicPayload.parse(job.payload);
  const now = new Date(clock.nowMs());

  if (!modelGateway || process.env.HFTR_LLM_MODE === 'deterministic') {
    await curateDeterministic({
      db,
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      topicScope: payload.topicScope,
      now,
    });
    return;
  }

  const batch = await runResearchSynthesis({
    db,
    clock,
    job,
    modelGateway,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    topicScope: payload.topicScope,
    evidencePackages: [],
  });

  if (batch) {
    await persistConceptBatch({
      db,
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      batch,
      now,
      sourceClass: 'model_generated',
    });
    return;
  }

  await curateDeterministic({
    db,
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    topicScope: payload.topicScope,
    now,
  });
});
