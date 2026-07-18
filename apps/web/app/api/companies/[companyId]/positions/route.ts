import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { positions } from '@hftr/db/schema';
import {
  createSystemClock,
  exitReasonLabel,
  getSession,
  getSyntheticQuote,
  isCashSessionClosed,
  recoveryPhaseForExit,
  resolvePositionExitReason,
  sessionPhase,
  venueDate,
} from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * Positions with mark-to-market and read-only next model-free exit preview
 * (ATR/RR/session_close/etc.) for the right-panel Positions inspector.
 * Target-exit deadline preview omitted here (ValueRef resolve stays in
 * maintenance.position_exits); other catalog exits still surface.
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const clock = createSystemClock();
    const nowMs = clock.nowMs();
    const session = await getSession(db, 'XNYS', venueDate(nowMs, 'America/New_York'));
    const phase = sessionPhase(session, nowMs);

    const rows = await db
      .select()
      .from(positions)
      .where(eq(positions.companyId, companyId))
      .orderBy(desc(positions.updatedAt));

    const openRows = rows.filter((p) => p.qty > 0n);
    const openedDuringOpenById = new Map<string, boolean>();
    await Promise.all(
      openRows.map(async (p) => {
        const openedAtMs = p.createdAt.getTime();
        const openSession = await getSession(
          db,
          'XNYS',
          venueDate(openedAtMs, 'America/New_York'),
        );
        const openedPhase = sessionPhase(openSession, openedAtMs);
        openedDuringOpenById.set(p.id, !isCashSessionClosed(openedPhase));
      }),
    );

    return {
      positions: rows.map((p) => {
        const quote = getSyntheticQuote(p.symbol, clock);
        const markCents = quote.lastCents ?? p.avgCostCents;
        const unrealized = p.qty * BigInt(markCents - p.avgCostCents);

        let nextExitReason: string | null = null;
        let nextExitLabel: string | null = null;
        let recoveryPhase: string | null = null;

        if (p.qty > 0n) {
          const reason = resolvePositionExitReason({
            avgCostCents: p.avgCostCents,
            markCents,
            targetExitMs: null,
            openedAtMs: p.createdAt.getTime(),
            nowMs,
            sessionPhase: phase,
            openedDuringOpenSession: openedDuringOpenById.get(p.id) ?? true,
          });
          if (reason) {
            nextExitReason = reason;
            nextExitLabel = exitReasonLabel(reason);
            recoveryPhase = recoveryPhaseForExit(reason);
          }
        }

        return {
          ...p,
          markCents,
          unrealizedPnlCents: unrealized,
          nextExitReason,
          nextExitLabel,
          recoveryPhase,
        };
      }),
    };
  });
}
