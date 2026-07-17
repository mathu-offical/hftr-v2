import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { catalogEntries } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({
  catalog: z.enum([
    'strategy_families',
    'compound_strategies',
    'recovery_ladders',
    'guardrail_packages',
    'broker_policy_envelopes',
    'session_constraints',
    'compliance_packages',
    'sector_seeds',
    'event_archetypes',
    'macro_triggers',
    'trend_lead_patterns',
  ]),
});
type Ctx = { params: Promise<{ catalog: string }> };

/** Seeded catalog entries (title/tier/key only; payload on demand later). */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db }) => {
    const { catalog } = Params.parse(await ctx.params);
    const rows = await db
      .select({
        entryKey: catalogEntries.entryKey,
        title: catalogEntries.title,
        tier: catalogEntries.tier,
        catalogVersion: catalogEntries.catalogVersion,
      })
      .from(catalogEntries)
      .where(eq(catalogEntries.catalog, catalog))
      .orderBy(asc(catalogEntries.tier), asc(catalogEntries.title));
    return { entries: rows };
  });
}
