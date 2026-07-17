import { eq } from 'drizzle-orm';
import type { LlmProvider } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { llmArtifacts } from '@hftr/db/schema';

export interface StoredArtifact {
  output: unknown;
  provider: LlmProvider;
  model: string;
  schemaRef: string;
}

export async function loadArtifact(db: Db, idempotencyKey: string): Promise<StoredArtifact | null> {
  const rows = await db
    .select({
      output: llmArtifacts.output,
      provider: llmArtifacts.provider,
      model: llmArtifacts.model,
      schemaRef: llmArtifacts.schemaRef,
    })
    .from(llmArtifacts)
    .where(eq(llmArtifacts.idempotencyKey, idempotencyKey))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }
  return row;
}

export interface StoreArtifactInput {
  idempotencyKey: string;
  companyId: string | null;
  schemaRef: string;
  provider: LlmProvider;
  model: string;
  output: unknown;
  llmCallId: string | null;
}

export async function storeArtifact(db: Db, input: StoreArtifactInput): Promise<void> {
  await db
    .insert(llmArtifacts)
    .values({
      idempotencyKey: input.idempotencyKey,
      companyId: input.companyId,
      schemaRef: input.schemaRef,
      provider: input.provider,
      model: input.model,
      output: input.output,
      llmCallId: input.llmCallId,
    })
    .onConflictDoNothing({ target: llmArtifacts.idempotencyKey });
}
