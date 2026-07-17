import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { PatchLibraryInput } from '@hftr/contracts';
import { NotFoundError, scoping } from '@hftr/db';
import { libraries, libraryConcepts } from '@hftr/db/schema';
import { parseBody, withAuth } from '@/lib/api';
import { getOwnedLibrary } from '@/lib/libraries';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid(), libraryId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; libraryId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, libraryId } = Params.parse(await ctx.params);
    await getOwnedLibrary(db, clerkUserId, companyId, libraryId);
    const input = await parseBody(req, PatchLibraryInput);

    if (input.moduleId) {
      await scoping.getOwnedModule(db, clerkUserId, companyId, input.moduleId);
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.topicScope !== undefined) patch.topicScope = input.topicScope;
    if (input.masterLibrary !== undefined) patch.masterLibrary = input.masterLibrary;
    if (input.status !== undefined) patch.status = input.status;
    if (input.moduleId !== undefined) patch.moduleId = input.moduleId;

    const rows = await db
      .update(libraries)
      .set(patch)
      .where(and(eq(libraries.id, libraryId), eq(libraries.companyId, companyId)))
      .returning();
    const library = rows[0];
    if (!library) throw new NotFoundError('library');
    return { library };
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, libraryId } = Params.parse(await ctx.params);
    await getOwnedLibrary(db, clerkUserId, companyId, libraryId);

    await db.delete(libraryConcepts).where(eq(libraryConcepts.libraryId, libraryId));

    const rows = await db
      .delete(libraries)
      .where(and(eq(libraries.id, libraryId), eq(libraries.companyId, companyId)))
      .returning();
    if (!rows[0]) throw new NotFoundError('library');
    return { deleted: true };
  });
}
