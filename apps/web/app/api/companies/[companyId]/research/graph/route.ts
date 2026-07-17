import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { conceptLinks, concepts, libraryConcepts } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const CURATION_PRIORITY: Record<string, number> = {
  auto_admitted: 4,
  accepted: 3,
  proposed: 2,
  rejected: 1,
  archived: 0,
};

export async function GET(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const moduleId = z
      .string()
      .uuid()
      .nullable()
      .parse(new URL(req.url).searchParams.get('moduleId'));

    const conceptRows = await db
      .select()
      .from(concepts)
      .where(
        moduleId
          ? and(eq(concepts.companyId, companyId), eq(concepts.moduleId, moduleId))
          : eq(concepts.companyId, companyId),
      )
      .limit(500);

    const conceptIds = conceptRows.map((row) => row.id);
    const linkRows =
      conceptIds.length === 0
        ? []
        : await db
            .select()
            .from(conceptLinks)
            .where(
              and(
                eq(conceptLinks.companyId, companyId),
                inArray(conceptLinks.fromConceptId, conceptIds),
                inArray(conceptLinks.toConceptId, conceptIds),
              ),
            )
            .limit(1000);

    const curationByConcept = new Map<string, string>();
    if (conceptIds.length > 0) {
      const curationRows = await db
        .select({
          conceptId: libraryConcepts.conceptId,
          curationStatus: libraryConcepts.curationStatus,
        })
        .from(libraryConcepts)
        .where(inArray(libraryConcepts.conceptId, conceptIds))
        .limit(2000);
      for (const row of curationRows) {
        const prev = curationByConcept.get(row.conceptId);
        const next = row.curationStatus;
        if (
          !prev ||
          (CURATION_PRIORITY[next] ?? 0) > (CURATION_PRIORITY[prev] ?? 0)
        ) {
          curationByConcept.set(row.conceptId, next);
        }
      }
    }

    const tagSet = new Set<string>();
    const nodes = conceptRows.map((row) => {
      const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
      for (const tag of tags) tagSet.add(tag);
      const curationStatus = curationByConcept.get(row.id) ?? null;
      return {
        id: row.id,
        moduleId: row.moduleId,
        title: row.title,
        body: row.body,
        tags,
        sourceClass: row.sourceClass,
        status: row.status,
        sourceRef: row.sourceRef ?? null,
        researchRunId: row.researchRunId ?? null,
        curationStatus,
      };
    });

    const links = linkRows.map((row) => ({
      id: row.id,
      fromConceptId: row.fromConceptId,
      toConceptId: row.toConceptId,
      relation: row.relation,
      weightBand: row.weightBand,
      sourceClass: row.sourceClass,
    }));

    return {
      nodes,
      links,
      tags: [...tagSet].sort(),
    };
  });
}
