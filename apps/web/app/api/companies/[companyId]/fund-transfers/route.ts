import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { fundTransfers } from '@hftr/db/schema';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const EndpointKind = z.enum(['module', 'company_pool', 'reserve']);

const CreateTransferInput = z
  .object({
    fromKind: EndpointKind,
    fromModuleId: z.string().uuid().nullable().optional(),
    toKind: EndpointKind,
    toModuleId: z.string().uuid().nullable().optional(),
    amountCents: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
  })
  .superRefine((val, ctx) => {
    if (val.fromKind === 'module' && !val.fromModuleId) {
      ctx.addIssue({ code: 'custom', message: 'fromModuleId required when fromKind is module' });
    }
    if (val.toKind === 'module' && !val.toModuleId) {
      ctx.addIssue({ code: 'custom', message: 'toModuleId required when toKind is module' });
    }
    if (val.fromKind === val.toKind && val.fromModuleId === val.toModuleId) {
      ctx.addIssue({ code: 'custom', message: 'from and to endpoints must differ' });
    }
  });

function parseAmountCents(v: string | number): bigint {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(422, 'invalid_amount');
  return BigInt(n);
}

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const rows = await db
      .select()
      .from(fundTransfers)
      .where(eq(fundTransfers.companyId, companyId))
      .orderBy(desc(fundTransfers.createdAt))
      .limit(50);
    return {
      transfers: rows.map((t) => ({
        ...t,
        amountCents: t.amountCents.toString(),
      })),
    };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, CreateTransferInput);
    const amountCents = parseAmountCents(input.amountCents);

    if (input.fromModuleId) {
      await scoping.getOwnedModule(db, clerkUserId, companyId, input.fromModuleId);
    }
    if (input.toModuleId) {
      await scoping.getOwnedModule(db, clerkUserId, companyId, input.toModuleId);
    }

    const inserted = await db
      .insert(fundTransfers)
      .values({
        companyId,
        fromKind: input.fromKind,
        fromModuleId: input.fromModuleId ?? null,
        toKind: input.toKind,
        toModuleId: input.toModuleId ?? null,
        amountCents,
        status: 'requested',
        requestedBy: 'user',
      })
      .returning();

    const row = inserted[0]!;
    return {
      transfer: { ...row, amountCents: row.amountCents.toString() },
    };
  });
}
