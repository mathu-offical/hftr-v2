import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { BindCompanyBrokerInput, CompanyBrokerStatus, type Venue } from '@hftr/contracts';
import { brokerBalancesSnapshot, companies } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { createSystemClock, getCompanyBalanceCents, resolveExecutionContext } from '@hftr/engine';
import { ApiError, parseBody, requireCompany, withAuth } from '@/lib/api';
import {
  assertConnectionUnbound,
  getOwnedBrokerConnection,
  summarizeBrokerConnections,
} from '@/lib/brokers';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const FEED_LABEL_BY_VENUE: Partial<Record<Venue, string>> = {
  alpaca: 'alpaca_iex_paper',
  paper_sim: 'paper_sim_fixture',
};

function minBigint(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const company = await requireCompany(db, companyId, clerkUserId);
    const virtualBalanceCents = await getCompanyBalanceCents(db, companyId);
    const mode = company.mode;
    const liveGateBlocked = mode === 'live';

    let connection: Awaited<ReturnType<typeof summarizeBrokerConnections>>[number] | null = null;
    let venue: Venue = 'paper_sim';
    let feedEntitlementLabel: string | null = null;
    let brokerSnapshot: {
      cashCents: number;
      buyingPowerCents: number;
      asOfIso: string;
    } | null = null;

    if (company.brokerConnectionId) {
      const connections = await summarizeBrokerConnections(db, clerkUserId);
      connection = connections.find((c) => c.id === company.brokerConnectionId) ?? null;
      if (connection) {
        venue = connection.venue as Venue;
        feedEntitlementLabel = FEED_LABEL_BY_VENUE[venue] ?? null;

        const snapshotRows = await db
          .select({
            cashCents: brokerBalancesSnapshot.cashCents,
            buyingPowerCents: brokerBalancesSnapshot.buyingPowerCents,
            asOf: brokerBalancesSnapshot.asOf,
          })
          .from(brokerBalancesSnapshot)
          .where(eq(brokerBalancesSnapshot.connectionId, connection.id))
          .orderBy(desc(brokerBalancesSnapshot.asOf))
          .limit(1);

        const stored = snapshotRows[0];
        if (stored) {
          brokerSnapshot = {
            cashCents: Number(stored.cashCents),
            buyingPowerCents: Number(stored.buyingPowerCents),
            asOfIso: stored.asOf.toISOString(),
          };
        } else if (connection.status === 'connected' && mode === 'paper') {
          try {
            const execCtx = await resolveExecutionContext(db, createSystemClock(), companyId);
            const live = await execCtx.adapter.getBalances();
            brokerSnapshot = {
              cashCents: live.cashCents,
              buyingPowerCents: live.buyingPowerCents,
              asOfIso: live.asOfIso,
            };
          } catch {
            // fail-closed: omit snapshot when adapter cannot hydrate
          }
        }
      }
    }

    const brokerBp = brokerSnapshot !== null ? BigInt(brokerSnapshot.buyingPowerCents) : null;
    const effectiveCapCents =
      connection && brokerBp !== null
        ? minBigint(virtualBalanceCents, brokerBp)
        : virtualBalanceCents;

    return CompanyBrokerStatus.parse({
      bound: connection !== null,
      connection,
      venue,
      feedEntitlementLabel,
      virtualBalanceCents: virtualBalanceCents.toString(),
      brokerSnapshot,
      effectiveCapCents: effectiveCapCents.toString(),
      mode,
      liveGateBlocked,
    });
  });
}

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
