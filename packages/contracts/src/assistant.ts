import { z } from 'zod';

/** Roles persisted in assistant_messages.role */
export const AssistantRole = z.enum(['user', 'assistant', 'system']);
export type AssistantRole = z.infer<typeof AssistantRole>;

/** Deterministic read-only lookup tools (no model calls). */
export const AssistantReadTool = z.enum([
  'company_summary',
  'module_status',
  'recent_executions',
  'positions',
  'trends',
  'queue_status',
  'capabilities',
]);
export type AssistantReadTool = z.infer<typeof AssistantReadTool>;

export const AssistantToolResultStatus = z.enum(['ok', 'failed']);
export type AssistantToolResultStatus = z.infer<typeof AssistantToolResultStatus>;

/**
 * Summary card returned by GET/POST and stored in tool_results jsonb.
 * Detailed lookup payloads are intentionally excluded from persistence.
 */
export const AssistantToolResultSummary = z
  .object({
    tool: AssistantReadTool,
    summary: z.string().min(1).max(2000),
    status: AssistantToolResultStatus.default('ok'),
  })
  .strict();
export type AssistantToolResultSummary = z.infer<typeof AssistantToolResultSummary>;

export const AssistantToolResults = z.array(AssistantToolResultSummary).max(10);
export type AssistantToolResults = z.infer<typeof AssistantToolResults>;

/** POST /api/companies/:companyId/assistant body */
export const AssistantPostInput = z.object({
  message: z.string().min(1).max(2000),
});
export type AssistantPostInput = z.infer<typeof AssistantPostInput>;

/** Cross-boundary assistant message (history + POST response). */
export const AssistantMessage = z.object({
  id: z.string().uuid(),
  role: AssistantRole,
  content: z.string(),
  toolResults: AssistantToolResults.nullable(),
  createdAt: z.string().datetime(),
});
export type AssistantMessage = z.infer<typeof AssistantMessage>;

export const AssistantGetResponse = z.object({
  messages: z.array(AssistantMessage),
});
export type AssistantGetResponse = z.infer<typeof AssistantGetResponse>;

export const AssistantPostResponse = z.object({
  userMessage: AssistantMessage,
  assistantMessage: AssistantMessage,
});
export type AssistantPostResponse = z.infer<typeof AssistantPostResponse>;

const AssistantToolResultSummaryFromDb = z
  .object({
    tool: AssistantReadTool,
    summary: z.string().min(1).max(2000),
    status: AssistantToolResultStatus.optional(),
  })
  .strip();

/** Normalize legacy rows that may still carry a detailed `data` field in jsonb. */
export function normalizeAssistantToolResultsFromDb(raw: unknown): AssistantToolResults | null {
  if (raw == null) return null;
  const rows = z.array(AssistantToolResultSummaryFromDb).parse(raw);
  return rows.map((row) => ({
    tool: row.tool,
    summary: row.summary,
    status: row.status ?? 'ok',
  }));
}

/** Validate summary cards before persistence (rejects detailed/extra fields). */
export function parseAssistantToolResultsForPersistence(raw: unknown): AssistantToolResults {
  return AssistantToolResults.parse(raw);
}
