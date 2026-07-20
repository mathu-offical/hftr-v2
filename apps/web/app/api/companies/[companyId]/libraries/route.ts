import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { CreateLibraryInput } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { libraries, modules } from '@hftr/db/schema';
import { bootstrapCompanyKnowledge } from '@hftr/engine';
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
    try {
      await bootstrapCompanyKnowledge({ db, companyId });
    } catch (err) {
      console.error('bootstrapCompanyKnowledge failed on libraries GET', err);
    }
    const rows = await db
      .select()
      .from(libraries)
      .where(and(eq(libraries.companyId, companyId), eq(libraries.status, 'active')))
      .orderBy(desc(libraries.createdAt))
      .limit(200);

    // D-216: attach hub module config so Library shelves can show compound shelves.
    const hubModuleIds = rows
      .filter((row) => row.isEngineDataHub && row.moduleId)
      .map((row) => row.moduleId!)
      .filter((id, i, arr) => arr.indexOf(id) === i);
    const hubConfigByModule = new Map<string, Record<string, unknown>>();
    if (hubModuleIds.length > 0) {
      const hubMods = await db
        .select({ id: modules.id, config: modules.config })
        .from(modules)
        .where(and(eq(modules.companyId, companyId), inArray(modules.id, hubModuleIds)));
      for (const mod of hubMods) {
        hubConfigByModule.set(mod.id, (mod.config ?? {}) as Record<string, unknown>);
      }
    }

    return {
      libraries: rows.map((row) => ({
        ...row,
        moduleConfig:
          row.isEngineDataHub && row.moduleId
            ? (hubConfigByModule.get(row.moduleId) ?? null)
            : null,
      })),
    };
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
