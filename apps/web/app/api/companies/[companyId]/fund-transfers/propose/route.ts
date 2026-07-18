import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  fundTransferRowsFromProposals,
  proposeFundRouteTransfers,
  type ProposeFundRouteTransfersResult,
} from '@hftr/engine';
import { scoping } from '@hftr/db';
import { fundTransfers, moduleLinks, modules } from '@hftr/db/schema';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const ProposeInput = z.object({
  amountCents: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
  sourceModuleId: z.string().uuid().optional(),
  /** When true, insert fund_transfers rows (status requested) for each hop. Default false. */
  commit: z.boolean().optional().default(false),
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

function serializePaths(paths: ProposeFundRouteTransfersResult['paths']) {
  return paths.map((path) => ({
    terminalModuleId: path.terminalModuleId,
    hops: path.hops.map((hop) => ({
      fromModuleId: hop.fromModuleId,
      toModuleId: hop.toModuleId,
      amountCents: hop.amountCents.toString(),
    })),
  }));
}

function serializeProposals(proposals: ProposeFundRouteTransfersResult['proposals']) {
  return proposals.map((proposal) => ({
    fromKind: proposal.fromKind,
    fromModuleId: proposal.fromModuleId,
    toKind: proposal.toKind,
    toModuleId: proposal.toModuleId,
    amountCents: proposal.amountCents.toString(),
  }));
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

    const response: {
      paths: ReturnType<typeof serializePaths>;
      proposals: ReturnType<typeof serializeProposals>;
      transfers?: Array<Record<string, unknown> & { amountCents: string }>;
    } = {
      paths: serializePaths(outcome.result.paths),
      proposals: serializeProposals(outcome.result.proposals),
    };

    if (input.commit) {
      const moduleIds = new Set<string>();
      for (const proposal of outcome.result.proposals) {
        moduleIds.add(proposal.fromModuleId);
        moduleIds.add(proposal.toModuleId);
      }
      for (const moduleId of moduleIds) {
        await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
      }

      const insertRows = fundTransferRowsFromProposals(outcome.result.proposals);
      const inserted =
        insertRows.length === 0
          ? []
          : await db
              .insert(fundTransfers)
              .values(
                insertRows.map((row) => ({
                  companyId,
                  fromKind: row.fromKind,
                  fromModuleId: row.fromModuleId,
                  toKind: row.toKind,
                  toModuleId: row.toModuleId,
                  amountCents: row.amountCents,
                  status: row.status,
                  requestedBy: row.requestedBy,
                })),
              )
              .returning();

      response.transfers = inserted.map((row) => ({
        ...row,
        amountCents: row.amountCents.toString(),
      }));
    }

    return response;
  });
}
