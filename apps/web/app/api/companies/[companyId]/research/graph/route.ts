import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { ResearchGraphResponse } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import {
  conceptLinks,
  concepts,
  libraryConcepts,
  researchTopics,
  topicConcepts,
} from '@hftr/db/schema';
import { bootstrapCompanyKnowledge } from '@hftr/engine';
import { withAuth } from '@/lib/api';
import { buildArticleOrbits, buildFolderStars, buildLibraryArticleOrbits, mergeArticleOrbits } from '@/lib/galaxy-graph-nesting';
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
    // Idempotent backfill so existing companies get seeded mechanisms in galaxy (D-045).
    try {
      await bootstrapCompanyKnowledge({ db, companyId });
    } catch (err) {
      console.error('bootstrapCompanyKnowledge failed on graph GET', err);
    }
    const url = new URL(req.url);
    const moduleId = z.string().uuid().nullable().parse(url.searchParams.get('moduleId'));
    const bumpQueries = url.searchParams.get('bumpQueries') === '1';

    // Live galaxy excludes archived concepts (D-047); Archive panel lists soft-deleted.
    const conceptRows = await db
      .select()
      .from(concepts)
      .where(
        moduleId
          ? and(
              eq(concepts.companyId, companyId),
              eq(concepts.moduleId, moduleId),
              eq(concepts.status, 'active'),
            )
          : and(eq(concepts.companyId, companyId), eq(concepts.status, 'active')),
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
        confidenceBand: row.confidenceBand ?? 'medium',
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

    const nestingConcepts = nodes.map((node) => ({
      id: node.id,
      title: node.title,
      body: node.body,
      tags: node.tags,
      primaryLibraryId: node.primaryLibraryId,
    }));
    const conceptsById = new Map(nestingConcepts.map((c) => [c.id, c]));
    const folders = buildFolderStars(nestingConcepts, libraryNests);

    const topicRows = await db
      .select({
        id: researchTopics.id,
        title: researchTopics.title,
      })
      .from(researchTopics)
      .where(
        moduleId
          ? and(
              eq(researchTopics.companyId, companyId),
              eq(researchTopics.status, 'active'),
              eq(researchTopics.moduleId, moduleId),
            )
          : and(eq(researchTopics.companyId, companyId), eq(researchTopics.status, 'active')),
      )
      .limit(500);

    const topicIds = topicRows.map((row) => row.id);
    const membershipRows =
      topicIds.length === 0
        ? []
        : await db
            .select({
              topicId: topicConcepts.topicId,
              conceptId: topicConcepts.conceptId,
            })
            .from(topicConcepts)
            .where(inArray(topicConcepts.topicId, topicIds))
            .limit(8000);

    const topicOrbits = buildArticleOrbits(topicRows, membershipRows, conceptsById);
    const libraryArticleOrbits = buildLibraryArticleOrbits(nestingConcepts, libraryNests);
    const articles = mergeArticleOrbits(topicOrbits, libraryArticleOrbits);

    return ResearchGraphResponse.parse({
      nodes,
      links,
      tags: [...tagSet].sort(),
      libraries: libraryNests,
      folders,
      articles,
    });
  });
}
