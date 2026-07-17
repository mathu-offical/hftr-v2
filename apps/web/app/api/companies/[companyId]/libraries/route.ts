import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CreateLibraryInput } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { libraries } from '@hftr/db/schema';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const rows = await db
      .select()
      .from(libraries)
      .where(eq(libraries.companyId, companyId))
      .orderBy(desc(libraries.createdAt))
      .limit(200);
    return { libraries: rows };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, CreateLibraryInput);

    if (input.moduleId) {
      await scoping.getOwnedModule(db, clerkUserId, companyId, input.moduleId);
    }

    let inserted;
    try {
      inserted = await db
        .insert(libraries)
        .values({
          companyId,
          name: input.name,
          topicScope: input.topicScope,
          masterLibrary: input.masterLibrary,
          moduleId: input.moduleId ?? null,
        })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw new ApiError(409, 'library_name_exists');
      throw err;
    }
    const library = inserted[0];
    if (!library) throw new ApiError(500, 'library_insert_failed');
    return { library };
  });
}
