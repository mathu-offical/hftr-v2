import { and, eq } from 'drizzle-orm';
import { LlmBudgetsResponse, LlmProvider } from '@hftr/contracts';
import { llmBudgets, userApiKeys } from '@hftr/db/schema';
import { requireCompany, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await ctx.params;
  return withAuth(async ({ db, clerkUserId }) => {
    await requireCompany(db, companyId, clerkUserId);

    const [budgetRows, keyRows] = await Promise.all([
      db
        .select()
        .from(llmBudgets)
        .where(and(eq(llmBudgets.scope, 'company'), eq(llmBudgets.scopeId, companyId))),
      db
        .select({ provider: userApiKeys.provider })
        .from(userApiKeys)
        .where(eq(userApiKeys.clerkUserId, clerkUserId)),
    ]);

    const userKeyProviders = new Set(keyRows.map((r) => r.provider));
    const byProvider = new Map(budgetRows.map((r) => [r.provider, r]));

    return LlmBudgetsResponse.parse({
      providers: LlmProvider.options.map((provider) => {
        const row = byProvider.get(provider);
        return {
          provider,
          credentialSource: userKeyProviders.has(provider) ? 'user_key' : 'unconfigured',
          maxCalls: row?.maxCalls ?? null,
          consumedCalls: row?.consumedCalls ?? 0,
          maxCostCents: row?.maxCostCents ?? null,
          consumedCostCents: row?.consumedCostCents ?? 0,
          windowMinutes: row?.windowMinutes ?? null,
          windowStartedAt: row?.windowStartedAt?.toISOString() ?? null,
        };
      }),
    });
  });
}
