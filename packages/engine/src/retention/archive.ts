import { inArray, lt } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import {
  actionTraces,
  actionTracesArchive,
  assistantEdits,
  assistantEditsArchive,
  assistantMessages,
  assistantMessagesArchive,
} from '@hftr/db/schema';

const RETENTION_BATCH_SIZE = 100;

export interface ArchiveRetentionCounts {
  tracesArchived: number;
  messagesArchived: number;
  editsArchived: number;
}

/** Archive rows older than cutoff, then delete from hot tables (never delete without archive). */
export async function archiveStaleHotRows(db: Db, cutoff: Date): Promise<ArchiveRetentionCounts> {
  const counts: ArchiveRetentionCounts = {
    tracesArchived: 0,
    messagesArchived: 0,
    editsArchived: 0,
  };

  counts.tracesArchived += await archiveActionTracesBatch(db, cutoff);
  counts.messagesArchived += await archiveAssistantMessagesBatch(db, cutoff);
  counts.editsArchived += await archiveAssistantEditsBatch(db, cutoff);

  return counts;
}

async function archiveActionTracesBatch(db: Db, cutoff: Date): Promise<number> {
  const rows = await db
    .select()
    .from(actionTraces)
    .where(lt(actionTraces.createdAt, cutoff))
    .orderBy(actionTraces.createdAt)
    .limit(RETENTION_BATCH_SIZE);
  if (rows.length === 0) return 0;

  const archivedAt = new Date();
  await db.insert(actionTracesArchive).values(
    rows.map((row) => ({
      id: row.id,
      taskId: row.taskId,
      companyId: row.companyId,
      moduleId: row.moduleId,
      venue: row.venue,
      mode: row.mode,
      outcome: row.outcome,
      fills: row.fills,
      simulatorGapTags: row.simulatorGapTags,
      sessionLegalitySnapshot: row.sessionLegalitySnapshot,
      policyEnvelopeVersion: row.policyEnvelopeVersion,
      failureCode: row.failureCode,
      createdAt: row.createdAt,
      archivedAt,
    })),
  );

  await db.delete(actionTraces).where(
    inArray(
      actionTraces.id,
      rows.map((r) => r.id),
    ),
  );
  return rows.length;
}

async function archiveAssistantMessagesBatch(db: Db, cutoff: Date): Promise<number> {
  const rows = await db
    .select()
    .from(assistantMessages)
    .where(lt(assistantMessages.createdAt, cutoff))
    .orderBy(assistantMessages.createdAt)
    .limit(RETENTION_BATCH_SIZE);
  if (rows.length === 0) return 0;

  const archivedAt = new Date();
  await db.insert(assistantMessagesArchive).values(
    rows.map((row) => ({
      id: row.id,
      companyId: row.companyId,
      clerkUserId: row.clerkUserId,
      role: row.role,
      content: row.content,
      toolResults: row.toolResults,
      createdAt: row.createdAt,
      archivedAt,
    })),
  );

  await db.delete(assistantMessages).where(
    inArray(
      assistantMessages.id,
      rows.map((r) => r.id),
    ),
  );
  return rows.length;
}

async function archiveAssistantEditsBatch(db: Db, cutoff: Date): Promise<number> {
  const rows = await db
    .select()
    .from(assistantEdits)
    .where(lt(assistantEdits.createdAt, cutoff))
    .orderBy(assistantEdits.createdAt)
    .limit(RETENTION_BATCH_SIZE);
  if (rows.length === 0) return 0;

  const archivedAt = new Date();
  await db.insert(assistantEditsArchive).values(
    rows.map((row) => ({
      id: row.id,
      companyId: row.companyId,
      clerkUserId: row.clerkUserId,
      tool: row.tool,
      proposal: row.proposal,
      status: row.status,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
      archivedAt,
    })),
  );

  await db.delete(assistantEdits).where(
    inArray(
      assistantEdits.id,
      rows.map((r) => r.id),
    ),
  );
  return rows.length;
}
