import { z } from 'zod';
import { EngineExecutionBinding, PaperTradeQuotePreviewResponse } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import {
  createSystemClock,
  hydrateOperatorQuoteValueRefs,
  previewHonestyTagsFromResolvedQuote,
  resolveDispatchMarketQuote,
} from '@hftr/engine';
import { ApiError, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid(), moduleId: z.string().uuid() });
const Query = z.object({
  symbol: z
    .string()
    .min(1)
    .max(12)
    .regex(/^[A-Za-z.]+$/, 'letters only'),
  quantity: z.coerce.number().int().min(1).max(100_000).optional(),
});

type Ctx = { params: Promise<{ companyId: string; moduleId: string }> };

function markCentsFromQuote(q: {
  lastCents?: number | null;
  bidCents?: number | null;
  askCents?: number | null;
}): string | null {
  if (q.lastCents != null && Number.isFinite(q.lastCents)) return String(q.lastCents);
  if (
    q.bidCents != null &&
    q.askCents != null &&
    Number.isFinite(q.bidCents) &&
    Number.isFinite(q.askCents)
  ) {
    return String(Math.round((q.bidCents + q.askCents) / 2));
  }
  if (q.bidCents != null && Number.isFinite(q.bidCents)) return String(q.bidCents);
  if (q.askCents != null && Number.isFinite(q.askCents)) return String(q.askCents);
  return null;
}

/**
 * Read-only MarketModel quote class for the paper trade inspector (D-192 / D-194).
 * Hydrates ad-hoc ValueRefs then uses the same resolveDispatchMarketQuote path as dispatch.
 */
export async function GET(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    const module_ = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
    if (module_.type !== 'trading') {
      throw new ApiError(422, 'not_a_trading_module');
    }

    const url = new URL(req.url);
    const query = Query.parse({
      symbol: url.searchParams.get('symbol') ?? '',
      quantity: url.searchParams.get('quantity') ?? undefined,
    });
    const symbol = query.symbol.trim().toUpperCase();

    const bindingParsed = EngineExecutionBinding.safeParse(
      (module_.config as { executionBinding?: unknown } | null)?.executionBinding ?? {},
    );
    const routingMode = bindingParsed.success
      ? bindingParsed.data.routingMode
      : 'funds_only';

    const clock = createSystemClock();
    await hydrateOperatorQuoteValueRefs({
      db,
      clock,
      companyId,
      moduleId,
      symbol,
    });
    const resolved = await resolveDispatchMarketQuote({
      db,
      clock,
      companyId,
      symbol,
    });

    const honestyTags = previewHonestyTagsFromResolvedQuote(resolved, { routingMode });
    const markCents = resolved.usedLive ? markCentsFromQuote(resolved.quote) : null;

    return PaperTradeQuotePreviewResponse.parse({
      symbol,
      usedLive: resolved.usedLive,
      priorSessionMark: resolved.priorSessionMark === true,
      sourceClass: resolved.sourceClass,
      feedClass: resolved.quote.feedClass ?? null,
      markCents,
      honestyTags,
      impactProxyLikely: (query.quantity ?? 1) >= 2,
    });
  });
}
