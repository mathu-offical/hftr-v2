import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { conceptLinks, concepts, libraryConcepts } from '@hftr/db/schema';
import { bootstrapCompanyKnowledge } from '@hftr/engine';
import { withAuth } from '@/lib/api';
import { bumpConceptQueries, listLibraryNests } from '@/lib/research-topics';

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
    // Idempotent backfill so existing companies get seeded mechanisms in galaxy (D-044).
    try {
      await bootstrapCompanyKnowledge({ db, companyId });
    } catch (err) {
      console.error('bootstrapCompanyKnowledge failed on graph GET', err);
    }
    const url = new URL(req.url);
    const moduleId = z.string().uuid().nullable().parse(url.searchParams.get('moduleId'));
    const bumpQueries = url.searchParams.get('bumpQueries') === '1';

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
    if (bumpQueries && conceptIds.length > 0) {
      await bumpConceptQueries(db, conceptIds, new Date());
    }

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
    const librariesByConcept = new Map<string, string[]>();
    if (conceptIds.length > 0) {
      const curationRows = await db
        .select({
          conceptId: libraryConcepts.conceptId,
          libraryId: libraryConcepts.libraryId,
          curationStatus: libraryConcepts.curationStatus,
        })
        .from(libraryConcepts)
        .where(inArray(libraryConcepts.conceptId, conceptIds))
        .limit(2000);
      for (const row of curationRows) {
        const prev = curationByConcept.get(row.conceptId);
        const next = row.curationStatus;
        if (!prev || (CURATION_PRIORITY[next] ?? 0) > (CURATION_PRIORITY[prev] ?? 0)) {
          curationByConcept.set(row.conceptId, next);
        }
        const libs = librariesByConcept.get(row.conceptId) ?? [];
        libs.push(row.libraryId);
        librariesByConcept.set(row.conceptId, libs);
      }
    }

    const tagSet = new Set<string>();
    const nodes = conceptRows.map((row) => {
      const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
      for (const tag of tags) tagSet.add(tag);
      const curationStatus = curationByConcept.get(row.id) ?? null;
      const allLibs = librariesByConcept.get(row.id) ?? [];
      const primary = row.primaryLibraryId;
      const secondaryLibraryIds = allLibs.filter((id) => id !== primary);
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
        primaryLibraryId: primary,
        secondaryLibraryIds,
        queryCount: row.queryCount ?? 0,
        referenceCount: row.referenceCount ?? 0,
        lastQueriedAt: row.lastQueriedAt?.toISOString() ?? null,
        lastReferencedAt: row.lastReferencedAt?.toISOString() ?? null,
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

    const libraryNests = await listLibraryNests(db, companyId);

    return {
      nodes,
      links,
      tags: [...tagSet].sort(),
      libraries: libraryNests,
    };
  });
}
