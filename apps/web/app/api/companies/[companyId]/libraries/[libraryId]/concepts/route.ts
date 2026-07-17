import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { concepts, libraryConcepts } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';
import { getOwnedLibrary } from '@/lib/libraries';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid(), libraryId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; libraryId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, libraryId } = Params.parse(await ctx.params);
    await getOwnedLibrary(db, clerkUserId, companyId, libraryId);

    const rows = await db
      .select({
        id: libraryConcepts.id,
        libraryId: libraryConcepts.libraryId,
        conceptId: libraryConcepts.conceptId,
        curationStatus: libraryConcepts.curationStatus,
        createdAt: libraryConcepts.createdAt,
        updatedAt: libraryConcepts.updatedAt,
        title: concepts.title,
        body: concepts.body,
        tags: concepts.tags,
        sourceClass: concepts.sourceClass,
      })
      .from(libraryConcepts)
      .innerJoin(concepts, eq(concepts.id, libraryConcepts.conceptId))
      .where(eq(libraryConcepts.libraryId, libraryId))
      .limit(500);

    const libraryConceptsOut = rows.map((row) => ({
      id: row.id,
      libraryId: row.libraryId,
      conceptId: row.conceptId,
      curationStatus: row.curationStatus,
      title: row.title,
      body: row.body,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      sourceClass: row.sourceClass,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return { libraryConcepts: libraryConceptsOut };
  });
}
