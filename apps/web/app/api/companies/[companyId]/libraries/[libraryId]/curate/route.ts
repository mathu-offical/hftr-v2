import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CurateLibraryConceptInput } from '@hftr/contracts';
import { NotFoundError } from '@hftr/db';
import { concepts, libraryConcepts } from '@hftr/db/schema';
import { bumpConceptConfidence } from '@hftr/engine';
import { parseBody, withAuth } from '@/lib/api';
import { getOwnedLibrary } from '@/lib/libraries';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid(), libraryId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; libraryId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, libraryId } = Params.parse(await ctx.params);
    await getOwnedLibrary(db, clerkUserId, companyId, libraryId);
    const input = await parseBody(req, CurateLibraryConceptInput);

    const conceptRows = await db
      .select({ id: concepts.id })
      .from(concepts)
      .where(and(eq(concepts.id, input.conceptId), eq(concepts.companyId, companyId)))
      .limit(1);
    if (!conceptRows[0]) throw new NotFoundError('concept');

    const rows = await db
      .insert(libraryConcepts)
      .values({
        libraryId,
        conceptId: input.conceptId,
        curationStatus: input.curationStatus,
      })
      .onConflictDoUpdate({
        target: [libraryConcepts.libraryId, libraryConcepts.conceptId],
        set: {
          curationStatus: input.curationStatus,
          updatedAt: new Date(),
        },
      })
      .returning();
    const libraryConcept = rows[0];
    if (!libraryConcept) throw new NotFoundError('library_concept');

    // Qualitative confidence advances on positive curation events (D-047).
    if (
      input.curationStatus === 'accepted' ||
      input.curationStatus === 'auto_admitted'
    ) {
      await bumpConceptConfidence(db, input.conceptId, 'verify', new Date());
    }

    return { libraryConcept };
  });
}
