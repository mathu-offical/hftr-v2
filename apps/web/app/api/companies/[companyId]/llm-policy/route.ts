import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  admitsRetention,
  CompanyLlmPolicy,
  LlmTier,
  MODEL_CAPABILITY_REGISTRY,
} from '@hftr/contracts';
import { companies, userApiKeys } from '@hftr/db/schema';
import { ApiError, parseBody, requireCompany, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const PatchLlmPolicyInput = CompanyLlmPolicy.partial();

function validateTierModels(policy: CompanyLlmPolicy): void {
  for (const tier of LlmTier.options) {
    const modelId = policy.tierModels[tier];
    if (!modelId) continue;
    const capability = MODEL_CAPABILITY_REGISTRY.find(
      (m) => m.available && m.modelId === modelId && m.tiers.includes(tier),
    );
    if (!capability) {
      throw new ApiError(400, 'model_not_allowlisted');
    }
    if (!admitsRetention(capability, policy)) {
      throw new ApiError(400, 'retention_blocked');
    }
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const company = await requireCompany(db, companyId, clerkUserId);

    const [anthropicKey] = await db
      .select({ retentionAttested: userApiKeys.retentionAttested })
      .from(userApiKeys)
      .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, 'anthropic')))
      .limit(1);

    const policy = CompanyLlmPolicy.parse(company.llmPolicy ?? {});

    return {
      policy,
      brokerConnectionId: company.brokerConnectionId,
      userAnthropicZdrAttested: anthropicKey?.retentionAttested === 'org_zdr',
    };
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const company = await requireCompany(db, companyId, clerkUserId);
    const patch = await parseBody(req, PatchLlmPolicyInput);

    const merged = CompanyLlmPolicy.parse({
      ...CompanyLlmPolicy.parse(company.llmPolicy ?? {}),
      ...patch,
      tierModels: {
        ...CompanyLlmPolicy.parse(company.llmPolicy ?? {}).tierModels,
        ...(patch.tierModels ?? {}),
      },
    });

    validateTierModels(merged);

    const updated = await db
      .update(companies)
      .set({ llmPolicy: merged, updatedAt: new Date() })
      .where(and(eq(companies.id, companyId), eq(companies.clerkUserId, clerkUserId)))
      .returning({
        llmPolicy: companies.llmPolicy,
        brokerConnectionId: companies.brokerConnectionId,
      });

    const [anthropicKey] = await db
      .select({ retentionAttested: userApiKeys.retentionAttested })
      .from(userApiKeys)
      .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, 'anthropic')))
      .limit(1);

    return {
      policy: CompanyLlmPolicy.parse(updated[0]!.llmPolicy),
      brokerConnectionId: updated[0]!.brokerConnectionId,
      userAnthropicZdrAttested: anthropicKey?.retentionAttested === 'org_zdr',
    };
  });
}
