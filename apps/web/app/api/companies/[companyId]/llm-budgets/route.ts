import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { LlmBudgetsResponse, LlmProvider } from '@hftr/contracts';
import { llmBudgets, userApiKeys } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const ENV_KEY_BY_PROVIDER = {
  anthropic: 'ANTHROPIC_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  groq: 'GROQ_API_KEY',
} as const;

/** Provider operating budgets are intentionally separate from trading capital. */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

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
    const budgetsByProvider = new Map(budgetRows.map((row) => [row.provider, row]));
    const userKeyProviders = new Set(keyRows.map((row) => row.provider));

    return LlmBudgetsResponse.parse({
      providers: LlmProvider.options.map((provider) => {
        const budget = budgetsByProvider.get(provider);
        const credentialSource = userKeyProviders.has(provider)
          ? 'user_key'
          : process.env[ENV_KEY_BY_PROVIDER[provider]]
            ? 'environment'
            : 'unconfigured';
        return {
          provider,
          credentialSource,
          maxCalls: budget?.maxCalls ?? null,
          consumedCalls: budget?.consumedCalls ?? 0,
          maxCostCents: budget?.maxCostCents ?? null,
          consumedCostCents: budget?.consumedCostCents ?? 0,
          windowMinutes: budget?.windowMinutes ?? null,
          windowStartedAt: budget?.windowStartedAt.toISOString() ?? null,
        };
      }),
    });
  });
}
