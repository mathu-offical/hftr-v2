import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { BindCompanyBrokerInput } from '@hftr/contracts';
import { companies } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { assertConnectionUnbound, getOwnedBrokerConnection } from '@/lib/brokers';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, BindCompanyBrokerInput);

    if (input.brokerConnectionId) {
      const connection = await getOwnedBrokerConnection(db, clerkUserId, input.brokerConnectionId);
      if (connection.status !== 'connected') {
        throw new ApiError(400, 'broker_connection_not_connected');
      }
      if (connection.mode === 'live') {
        throw new ApiError(400, 'live_gate_blocked');
      }
      try {
        await assertConnectionUnbound(db, input.brokerConnectionId, companyId);
      } catch {
        throw new ApiError(409, 'broker_connection_already_bound');
      }
    }

    const updated = await db
      .update(companies)
      .set({ brokerConnectionId: input.brokerConnectionId, updatedAt: new Date() })
      .where(and(eq(companies.id, companyId), eq(companies.clerkUserId, clerkUserId)))
      .returning({
        id: companies.id,
        brokerConnectionId: companies.brokerConnectionId,
      });

    return { company: updated[0] };
  });
}
