import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  getCompanyBalanceCents,
  getModuleBalanceCents,
  moduleTransferLedgerEntries,
  transferDescription,
  transferLedgerDeltaCents,
  validateTransferDecision,
} from '@hftr/engine';
import { scoping } from '@hftr/db';
import { fundTransfers, ledgerEntries } from '@hftr/db/schema';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({
  companyId: z.string().uuid(),
  id: z.string().uuid(),
});
type Ctx = { params: Promise<{ companyId: string; id: string }> };

const DecisionInput = z.object({
  decision: z.enum(['approve', 'reject']),
});

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, id } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, DecisionInput);

    const rows = await db
      .select()
      .from(fundTransfers)
      .where(and(eq(fundTransfers.id, id), eq(fundTransfers.companyId, companyId)))
      .limit(1);
    const transfer = rows[0];
    if (!transfer) throw new ApiError(404, 'transfer_not_found');

    const check = validateTransferDecision(transfer, input.decision);
    if (!check.ok) throw new ApiError(409, check.code);

    if (input.decision === 'reject') {
      const updated = await db
        .update(fundTransfers)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(eq(fundTransfers.id, id))
        .returning();
      const row = updated[0]!;
      return { transfer: { ...row, amountCents: row.amountCents.toString() } };
    }

    const companyBalanceCents = await getCompanyBalanceCents(db, companyId);
    const delta = transferLedgerDeltaCents(transfer);
    const companyBalanceAfter = delta !== 0n ? companyBalanceCents + delta : companyBalanceCents;

    const moduleEntries =
      transfer.fromKind === 'module' &&
      transfer.toKind === 'module' &&
      transfer.fromModuleId &&
      transfer.toModuleId
        ? moduleTransferLedgerEntries(transfer, companyBalanceCents, {
            fromModuleBalanceCents: await getModuleBalanceCents(
              db,
              companyId,
              transfer.fromModuleId,
            ),
            toModuleBalanceCents: await getModuleBalanceCents(db, companyId, transfer.toModuleId),
          })
        : [];

    const updated = await db
      .update(fundTransfers)
      .set({ status: 'settled', approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(fundTransfers.id, id))
      .returning();

    if (delta !== 0n) {
      await db.insert(ledgerEntries).values({
        companyId,
        moduleId: transfer.toModuleId ?? transfer.fromModuleId ?? null,
        kind: 'transfer',
        amountCents: delta,
        balanceAfterCents: companyBalanceAfter,
        traceId: null,
        description: transferDescription(transfer),
      });
    }

    if (moduleEntries.length > 0) {
      await db.insert(ledgerEntries).values(
        moduleEntries.map((entry) => ({
          companyId,
          moduleId: entry.moduleId,
          kind: 'transfer' as const,
          amountCents: entry.amountCents,
          balanceAfterCents: entry.balanceAfterCents,
          traceId: null,
          description: entry.description,
        })),
      );
    }

    const row = updated[0]!;
    return {
      transfer: { ...row, amountCents: row.amountCents.toString() },
      ledgerDeltaCents: delta.toString(),
      moduleLedgerEntryCount: moduleEntries.length,
    };
  });
}
