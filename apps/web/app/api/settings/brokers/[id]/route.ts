import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { brokerConnections, companies } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';
import { getOwnedBrokerConnection } from '@/lib/brokers';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().uuid() });
type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { id } = Params.parse(await ctx.params);
    await getOwnedBrokerConnection(db, clerkUserId, id);

    await db
      .update(companies)
      .set({ brokerConnectionId: null, updatedAt: new Date() })
      .where(eq(companies.brokerConnectionId, id));

    await db
      .update(brokerConnections)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(and(eq(brokerConnections.id, id), eq(brokerConnections.clerkUserId, clerkUserId)));

    return { revoked: true };
  });
}
