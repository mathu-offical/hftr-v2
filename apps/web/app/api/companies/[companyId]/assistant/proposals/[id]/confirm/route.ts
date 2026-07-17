import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AssistantEdit, AssistantEditProposal } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { assistantEdits } from '@hftr/db/schema';
import { ApiError, withAuth } from '@/lib/api';
import { applyAssistantEdit } from '@/lib/assistant-edits';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid(), id: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, id } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const rows = await db
      .select()
      .from(assistantEdits)
      .where(and(eq(assistantEdits.id, id), eq(assistantEdits.companyId, companyId)))
      .limit(1);
    const edit = rows[0];
    if (!edit) throw new ApiError(404, 'not_found');
    if (edit.status !== 'pending') throw new ApiError(409, 'proposal_already_resolved');

    const proposal = AssistantEditProposal.parse(edit.proposal);
    await applyAssistantEdit(db, clerkUserId, companyId, proposal);

    const [updated] = await db
      .update(assistantEdits)
      .set({ status: 'confirmed', resolvedAt: new Date() })
      .where(eq(assistantEdits.id, id))
      .returning();
    if (!updated) throw new ApiError(500, 'update_failed');

    return {
      proposal: AssistantEdit.parse({
        id: updated.id,
        companyId: updated.companyId,
        clerkUserId: updated.clerkUserId,
        tool: updated.tool,
        proposal,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      }),
    };
  });
}
