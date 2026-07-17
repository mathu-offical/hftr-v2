import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { PatchResearchTopicInput } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { researchTopics } from '@hftr/db/schema';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import {
  bumpTopicQuery,
  loadTopicMemberships,
  serializeTopic,
  topicConceptCounts,
} from '@/lib/research-topics';

export const dynamic = 'force-dynamic';

const Params = z.object({
  companyId: z.string().uuid(),
  topicId: z.string().uuid(),
});
type Ctx = { params: Promise<{ companyId: string; topicId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, topicId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const [row] = await db
      .select()
      .from(researchTopics)
      .where(and(eq(researchTopics.id, topicId), eq(researchTopics.companyId, companyId)))
      .limit(1);
    if (!row) throw new ApiError(404, 'topic_not_found');

    const now = new Date();
    await bumpTopicQuery(db, topicId, now);

    const memberships = await loadTopicMemberships(db, topicId);
    const counts = await topicConceptCounts(db, [topicId]);
    const [fresh] = await db
      .select()
      .from(researchTopics)
      .where(eq(researchTopics.id, topicId))
      .limit(1);

    return {
      topic: {
        ...serializeTopic(fresh ?? row, counts.get(topicId) ?? memberships.length),
        memberships,
      },
    };
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, topicId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, PatchResearchTopicInput);

    const [existing] = await db
      .select()
      .from(researchTopics)
      .where(and(eq(researchTopics.id, topicId), eq(researchTopics.companyId, companyId)))
      .limit(1);
    if (!existing) throw new ApiError(404, 'topic_not_found');

    if (input.parentTopicId) {
      const [parent] = await db
        .select({ id: researchTopics.id })
        .from(researchTopics)
        .where(
          and(
            eq(researchTopics.id, input.parentTopicId),
            eq(researchTopics.companyId, companyId),
            eq(researchTopics.moduleId, existing.moduleId),
          ),
        )
        .limit(1);
      if (!parent) throw new ApiError(422, 'parent_topic_not_found');
    }

    const [updated] = await db
      .update(researchTopics)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.parentTopicId !== undefined ? { parentTopicId: input.parentTopicId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.provenance !== undefined ? { provenance: input.provenance } : {}),
        ...(input.synopsisMd !== undefined ? { synopsisMd: input.synopsisMd } : {}),
        updatedAt: new Date(),
      })
      .where(eq(researchTopics.id, topicId))
      .returning();

    if (!updated) throw new ApiError(500, 'topic_update_failed');
    const counts = await topicConceptCounts(db, [topicId]);
    return { topic: serializeTopic(updated, counts.get(topicId) ?? 0) };
  });
}
