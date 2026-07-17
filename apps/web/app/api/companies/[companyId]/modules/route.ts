import { z } from 'zod';
import { CreateModuleInput, MODULE_CONFIG_SCHEMAS } from '@hftr/contracts';
import { modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const MAX_MODULES_PER_COMPANY = 60;

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const rows = await scoping.listModules(db, clerkUserId, companyId);
    return { modules: rows };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, CreateModuleInput);

    if (input.type === 'math') {
      throw new ApiError(422, 'math_module_is_singleton'); // auto-created with the company
    }

    const existing = await scoping.listModules(db, clerkUserId, companyId);
    if (existing.length >= MAX_MODULES_PER_COMPANY) {
      throw new ApiError(422, 'module_limit_reached');
    }

    // Per-type config validation (schema registry from contracts).
    const config = MODULE_CONFIG_SCHEMAS[input.type].parse(input.config ?? {});

    const inserted = await db
      .insert(modules)
      .values({
        companyId,
        type: input.type,
        name: input.name,
        config,
        canvasPosition: input.canvasPosition ?? { x: 0, y: 0 },
        status: 'draft',
      })
      .returning();
    return { module: inserted[0] };
  });
}
