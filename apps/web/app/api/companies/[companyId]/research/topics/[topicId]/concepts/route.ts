import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { PutTopicConceptsInput } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { researchTopics } from '@hftr/db/schema';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { loadTopicMemberships, replaceTopicConcepts } from '@/lib/research-topics';

export const dynamic = 'force-dynamic';

const Params = z.object({
  companyId: z.string().uuid(),
  topicId: z.string().uuid(),
});
type Ctx = { params: Promise<{ companyId: string; topicId: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, topicId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, PutTopicConceptsInput);

    const [topic] = await db
      .select({ id: researchTopics.id })
      .from(researchTopics)
      .where(and(eq(researchTopics.id, topicId), eq(researchTopics.companyId, companyId)))
      .limit(1);
    if (!topic) throw new ApiError(404, 'topic_not_found');

    const now = new Date();
    try {
      await replaceTopicConcepts(db, {
        companyId,
        topicId,
        items: input.concepts.map((c, i) => ({
          conceptId: c.conceptId,
          sortOrder: c.sortOrder ?? i,
          role: c.role ?? null,
        })),
        now,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'concept_not_in_company') {
        throw new ApiError(422, 'concept_not_in_company');
      }
      throw err;
    }

    const memberships = await loadTopicMemberships(db, topicId);
    return { memberships };
  });
}

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, topicId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const [topic] = await db
      .select({ id: researchTopics.id })
      .from(researchTopics)
      .where(and(eq(researchTopics.id, topicId), eq(researchTopics.companyId, companyId)))
      .limit(1);
    if (!topic) throw new ApiError(404, 'topic_not_found');

    const memberships = await loadTopicMemberships(db, topicId);
    return { memberships };
  });
}
