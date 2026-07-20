/**
 * D-244: enqueue trading.loop_refine from an action_instruction's envelope
 * causation refs (compile.select: [trendId, leadId, treeId]).
 */

import { eq } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { actionInstructions, compileEvents, leadPackages } from '@hftr/db/schema';
import type { Clock } from '../clock';
import { enqueue } from '../queue/queue';

export type LoopRefineReason =
  | 'no_fill'
  | 'expired'
  | 'canceled'
  | 'rejected'
  | 'needs_recovery';

export async function enqueueLoopRefineFromInstruction(
  db: Db,
  clock: Clock,
  opts: {
    companyId: string;
    moduleId: string;
    instructionId: string;
    reason: LoopRefineReason;
  },
): Promise<boolean> {
  const [instr] = await db
    .select({ envelope: actionInstructions.envelope })
    .from(actionInstructions)
    .where(eq(actionInstructions.id, opts.instructionId))
    .limit(1);
  const env = (instr?.envelope ?? {}) as { causationRefs?: string[] };
  const causation = Array.isArray(env.causationRefs) ? env.causationRefs : [];
  const trendId = causation[0];
  const leadId = causation[1];
  const treeId = causation[2];
  if (!leadId || !treeId) return false;

  const [compileRow] = await db
    .select({ lineage: compileEvents.lineage })
    .from(compileEvents)
    .where(eq(compileEvents.instructionId, opts.instructionId))
    .limit(1);
  const lineage = (compileRow?.lineage ?? {}) as { loopRefineAttempt?: number };
  const attempt = typeof lineage.loopRefineAttempt === 'number' ? lineage.loopRefineAttempt : 0;

  const [lead] = await db
    .select({ controlSnapshot: leadPackages.controlSnapshot })
    .from(leadPackages)
    .where(eq(leadPackages.id, leadId))
    .limit(1);
  const controlSnapshot =
    lead?.controlSnapshot && typeof lead.controlSnapshot === 'object'
      ? (lead.controlSnapshot as Record<string, unknown>)
      : undefined;

  await enqueue(db, clock, {
    queueClass: 'TACTICAL',
    kind: 'trading.loop_refine',
    payload: {
      companyId: opts.companyId,
      moduleId: opts.moduleId,
      leadId,
      treeId,
      ...(trendId ? { trendId } : {}),
      reason: opts.reason,
      attempt,
      ...(controlSnapshot ? { controlSnapshot } : {}),
    },
    idempotencyKey: `loop-refine-${treeId}-${opts.reason}-${attempt + 1}`,
    priority: 'HIGH',
    companyId: opts.companyId,
    moduleId: opts.moduleId,
  });
  return true;
}
