import { z } from 'zod';
import {
  LiveDataSourceQueryRequest,
  LiveDataSourceQueryResponse,
  RESEARCH_SOURCE_REGISTRY,
  ResearchSourceKind,
  defaultBrowseQueryForDomain,
  resolveLiveDataSourceStatus,
  type ResearchSourceAvailability,
  type ResearchSourceDescriptor,
} from '@hftr/contracts';
import { gatherEvidencePackages } from '@hftr/adapters';
import { scoping } from '@hftr/db';
import { resolveResearchGatherCredentials, researchAvailabilityFromCredentials } from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({
  companyId: z.string().uuid(),
  kind: ResearchSourceKind,
});
type Ctx = { params: Promise<{ companyId: string; kind: string }> };

function isSourceReady(
  descriptor: ResearchSourceDescriptor,
  available: ResearchSourceAvailability,
): boolean {
  switch (descriptor.authMode) {
    case 'none':
      return true;
    case 'research_key':
      return descriptor.keyProvider
        ? available.researchKeys.includes(descriptor.keyProvider)
        : false;
    case 'broker_paper':
      return available.hasAlpacaPaper;
    default: {
      const _exhaustive: never = descriptor.authMode;
      return _exhaustive;
    }
  }
}

/**
 * Lazy operator query/browse for one hydrator. Does not write evidence to DB.
 * Secrets resolve at call time only (D-074).
 */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, kind } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const body = LiveDataSourceQueryRequest.parse(await req.json().catch(() => ({})));
    const descriptor = RESEARCH_SOURCE_REGISTRY[kind];
    const gatherCredentials = await resolveResearchGatherCredentials(db, companyId);
    const availability = researchAvailabilityFromCredentials(gatherCredentials);
    const ready = isSourceReady(descriptor, availability);
    const status = resolveLiveDataSourceStatus(descriptor, ready);
    const fetchedAt = new Date().toISOString();

    if (status === 'stub' || status === 'researched') {
      return LiveDataSourceQueryResponse.parse({
        kind,
        mode: body.mode,
        query: body.query,
        status,
        widgets: [],
        errors: [{ code: status === 'stub' ? 'not_implemented' : 'researched_only' }],
        fetchedAt,
      });
    }

    if (status === 'missing_key') {
      return LiveDataSourceQueryResponse.parse({
        kind,
        mode: body.mode,
        query: body.query,
        status,
        widgets: [],
        errors: [{ code: 'missing_key' }],
        fetchedAt,
      });
    }

    const query =
      body.mode === 'browse' && !body.query.trim()
        ? defaultBrowseQueryForDomain(descriptor.domain)
        : body.query.trim() || defaultBrowseQueryForDomain(descriptor.domain);

    const { packages, errors } = await gatherEvidencePackages({
      query,
      sourceKinds: [kind],
      allowlist: [],
      blocklist: [],
      maxEvidence: body.maxResults,
      ...gatherCredentials,
      secAllowEmptyOnError: true,
      marketNewsAllowDeterministicFallback: true,
    });

    const widgets = packages.slice(0, body.maxResults).map((pkg, i) => ({
      id: pkg.digest.slice(0, 16) || `${kind}-${i}`,
      title: pkg.title,
      summary: pkg.summary,
      feedClass: pkg.feedClass,
      authorityClass: pkg.authorityClass,
      externalRef: pkg.externalRef,
      expiresAt: pkg.expiresAt,
    }));

    return LiveDataSourceQueryResponse.parse({
      kind,
      mode: body.mode,
      query,
      status,
      widgets,
      errors: errors.map((e) => ({ code: e.code.slice(0, 80) })),
      fetchedAt,
    });
  });
}
