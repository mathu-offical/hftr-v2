import { z } from 'zod';
import { resolveCompanyServiceBindings } from '@hftr/engine';
import { scoping } from '@hftr/db';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * GET module↔service coverage for a company (D-090).
 * Re-resolves bindings from verified broker capabilities and returns text-first gaps.
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const coverage = await resolveCompanyServiceBindings(db, clerkUserId, companyId);
    return {
      companyId,
      modules: coverage.map((c) => ({
        moduleId: c.moduleId,
        moduleType: c.moduleType,
        required: c.required,
        optional: c.optional,
        boundCapabilities: c.boundCapabilities,
        missingRequired: c.missingRequired,
        missingOptional: c.missingOptional,
        bindings: c.bindings,
      })),
    };
  });
}
