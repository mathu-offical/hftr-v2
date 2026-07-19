import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { CreateResearchTopicInput } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { engineInstances, modules, researchTopics } from '@hftr/db/schema';
import { bootstrapCompanyKnowledge } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { serializeTopic, topicConceptCounts } from '@/lib/research-topics';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    try {
      await bootstrapCompanyKnowledge({ db, companyId });
    } catch (err) {
      console.error('bootstrapCompanyKnowledge failed on topics GET', err);
    }
    const moduleId = z
      .string()
      .uuid()
      .nullable()
      .parse(new URL(req.url).searchParams.get('moduleId'));

    // D-166: seeded / listed topics require at least one research module.
    const researchMods = await db
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.companyId, companyId), eq(modules.type, 'research')));
    if (researchMods.length === 0) {
      return { topics: [] };
    }
    const researchModuleIds = new Set(researchMods.map((m) => m.id));

    // Live topic tree excludes archived (D-047); Archive panel lists soft-deleted.
    const rows = (
      await db
        .select()
        .from(researchTopics)
        .where(
          moduleId
            ? and(
                eq(researchTopics.companyId, companyId),
                eq(researchTopics.moduleId, moduleId),
                ne(researchTopics.status, 'archived'),
              )
            : and(eq(researchTopics.companyId, companyId), ne(researchTopics.status, 'archived')),
        )
        .orderBy(desc(researchTopics.createdAt))
        .limit(200)
    ).filter((row) => researchModuleIds.has(row.moduleId));

    const counts = await topicConceptCounts(
      db,
      rows.map((r) => r.id),
    );

    const moduleIds = [...new Set(rows.map((r) => r.moduleId))];
    const engineByModule = new Map<
      string,
      { engineInstanceId: string | null; engineLabel: string | null; researchModuleName: string }
    >();
    if (moduleIds.length > 0) {
      const moduleRows = await db
        .select({
          id: modules.id,
          name: modules.name,
          engineInstanceId: modules.engineInstanceId,
        })
        .from(modules)
        .where(and(eq(modules.companyId, companyId), inArray(modules.id, moduleIds)));
      const engineIds = [
        ...new Set(
          moduleRows
            .map((m) => m.engineInstanceId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const engineLabelById = new Map<string, string>();
      if (engineIds.length > 0) {
        const engines = await db
          .select({ id: engineInstances.id, label: engineInstances.label })
          .from(engineInstances)
          .where(and(eq(engineInstances.companyId, companyId), inArray(engineInstances.id, engineIds)));
        for (const eng of engines) engineLabelById.set(eng.id, eng.label);
      }
      for (const mod of moduleRows) {
        const engineLabel = mod.engineInstanceId
          ? (engineLabelById.get(mod.engineInstanceId) ?? null)
          : null;
        engineByModule.set(mod.id, {
          engineInstanceId: mod.engineInstanceId ?? null,
          engineLabel: engineLabel ?? mod.name,
          researchModuleName: mod.name,
        });
      }
    }

    return {
      topics: rows.map((row) =>
        serializeTopic(row, counts.get(row.id) ?? 0, engineByModule.get(row.moduleId)),
      ),
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
