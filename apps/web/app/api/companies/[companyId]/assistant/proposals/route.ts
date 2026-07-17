import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  AssistantEdit,
  AssistantEditProposal,
  AssistantProposalsResponse,
  CreateAssistantProposalInput,
  validateAllocateFundsAmount,
} from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { assistantEdits } from '@hftr/db/schema';
import { parseBody, withAuth, ApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

function serializeEdit(row: typeof assistantEdits.$inferSelect): AssistantEdit {
  return AssistantEdit.parse({
    id: row.id,
    companyId: row.companyId,
    clerkUserId: row.clerkUserId,
    tool: row.tool,
    proposal: AssistantEditProposal.parse(row.proposal),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  });
}

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const rows = await db
      .select()
      .from(assistantEdits)
      .where(and(eq(assistantEdits.companyId, companyId), eq(assistantEdits.status, 'pending')))
      .orderBy(desc(assistantEdits.createdAt))
      .limit(50);
    return AssistantProposalsResponse.parse({ proposals: rows.map(serializeEdit) });
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const proposal = await parseBody(req, CreateAssistantProposalInput);
    if (proposal.tool === 'allocate_funds' && !validateAllocateFundsAmount(proposal)) {
      throw new ApiError(422, 'allocate_funds_requires_amount_cents_xor_amount_from');
    }
    const [row] = await db
      .insert(assistantEdits)
      .values({
        companyId,
        clerkUserId,
        tool: proposal.tool,
        proposal,
        status: 'pending',
      })
      .returning();
    if (!row) throw new Error('insert_failed');
    return { proposal: serializeEdit(row) };
  });
}
