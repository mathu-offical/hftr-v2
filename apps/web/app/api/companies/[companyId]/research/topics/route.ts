import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CreateResearchTopicInput } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { researchTopics } from '@hftr/db/schema';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { serializeTopic, topicConceptCounts } from '@/lib/research-topics';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const moduleId = z
      .string()
      .uuid()
      .nullable()
      .parse(new URL(req.url).searchParams.get('moduleId'));

    const rows = await db
      .select()
      .from(researchTopics)
      .where(
        moduleId
          ? and(eq(researchTopics.companyId, companyId), eq(researchTopics.moduleId, moduleId))
          : eq(researchTopics.companyId, companyId),
      )
      .orderBy(desc(researchTopics.createdAt))
      .limit(200);

    const counts = await topicConceptCounts(
      db,
      rows.map((r) => r.id),
    );
    return {
      topics: rows.map((row) => serializeTopic(row, counts.get(row.id) ?? 0)),
    };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, CreateResearchTopicInput);

    const module_ = await scoping.getOwnedModule(db, clerkUserId, companyId, input.moduleId);
    if (module_.type !== 'research') {
      throw new ApiError(422, 'module_type_not_research');
    }

    if (input.parentTopicId) {
      const parentRows = await db
        .select({ id: researchTopics.id })
        .from(researchTopics)
        .where(
          and(
            eq(researchTopics.id, input.parentTopicId),
            eq(researchTopics.companyId, companyId),
            eq(researchTopics.moduleId, input.moduleId),
          ),
        )
        .limit(1);
      if (!parentRows[0]) throw new ApiError(422, 'parent_topic_not_found');
    }

    const inserted = await db
      .insert(researchTopics)
      .values({
        companyId,
        moduleId: input.moduleId,
        parentTopicId: input.parentTopicId ?? null,
        title: input.title,
        priority: input.priority,
        provenance: input.provenance ?? null,
        synopsisMd: input.synopsisMd ?? '',
      })
      .returning();
    const topic = inserted[0];
    if (!topic) throw new ApiError(500, 'topic_insert_failed');
    return { topic: serializeTopic(topic, 0) };
  });
}
