import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { proposeFundRouteTransfers } from '@hftr/engine';
import { scoping } from '@hftr/db';
import { moduleLinks, modules } from '@hftr/db/schema';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const ProposeInput = z.object({
  amountCents: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
  sourceModuleId: z.string().uuid().optional(),
});

function parseAmountCents(value: string | number): bigint {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(422, 'invalid_amount');
  return BigInt(n);
}

function walkerErrorStatus(code: string): number {
  switch (code) {
    case 'invalid_amount':
      return 422;
    case 'source_not_found':
    case 'source_not_holding_fund':
    case 'ambiguous_source':
    case 'no_paths':
      return 422;
    default:
      return 422;
  }
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, ProposeInput);
    const amountCents = parseAmountCents(input.amountCents);

    const [moduleRows, linkRows] = await Promise.all([
      db
        .select({ id: modules.id, type: modules.type })
        .from(modules)
        .where(eq(modules.companyId, companyId)),
      db
        .select({
          fromModuleId: moduleLinks.fromModuleId,
          toModuleId: moduleLinks.toModuleId,
          linkKind: moduleLinks.linkKind,
        })
        .from(moduleLinks)
        .where(eq(moduleLinks.companyId, companyId)),
    ]);

    const outcome = proposeFundRouteTransfers({
      modules: moduleRows,
      links: linkRows,
      amountCents,
      ...(input.sourceModuleId ? { sourceModuleId: input.sourceModuleId } : {}),
    });

    if (!outcome.ok) {
      throw new ApiError(walkerErrorStatus(outcome.error.code), outcome.error.code, {
        detail: outcome.error.detail,
      });
    }

    return {
      paths: outcome.result.paths.map((path) => ({
        terminalModuleId: path.terminalModuleId,
        hops: path.hops.map((hop) => ({
          fromModuleId: hop.fromModuleId,
          toModuleId: hop.toModuleId,
          amountCents: hop.amountCents.toString(),
        })),
      })),
      proposals: outcome.result.proposals.map((proposal) => ({
        fromKind: proposal.fromKind,
        fromModuleId: proposal.fromModuleId,
        toKind: proposal.toKind,
        toModuleId: proposal.toModuleId,
        amountCents: proposal.amountCents.toString(),
      })),
    };
  });
}
