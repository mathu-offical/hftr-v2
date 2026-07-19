import { z } from 'zod';
import {
  LiveDataSourceQueryRequest,
  LiveDataSourceQueryResponse,
  RESEARCH_SOURCE_REGISTRY,
  ResearchSourceKind,
  defaultBrowseQueryForDomain,
  evidenceToLiveDataSourceWidget,
  liveDataSourceFormForDomain,
  liveDataSourceIsCompleteList,
  liveDataSourcePresetsForDomain,
  resolveLiveDataSourceMaxResults,
  resolveLiveDataSourceStatus,
  type ResearchSourceAvailability,
  type ResearchSourceDescriptor,
} from '@hftr/contracts';
import { gatherEvidencePackages, buildOperatorLivePreviewWidgets } from '@hftr/adapters';
import { scoping } from '@hftr/db';
import { resolveResearchGatherCredentials, researchAvailabilityFromCredentials } from '@hftr/engine';
import { withAuth } from '@/lib/api';
import {
  liveDataSourceQueryApiCacheKey,
  loadLiveDataSourceQueryApiCached,
} from '@/lib/live-data-source-query-api-cache';

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
 * Successful responses are TTL-cached so diagnostics do not over-query providers (D-152).
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
    const presets = liveDataSourcePresetsForDomain(descriptor.domain);
    const form = liveDataSourceFormForDomain(descriptor.domain);
    const completeList = liveDataSourceIsCompleteList(kind);
    const maxResults = resolveLiveDataSourceMaxResults(kind, body.maxResults);
    const forceRefresh = body.forceRefresh;

    if (status === 'stub' || status === 'researched') {
      return LiveDataSourceQueryResponse.parse({
        kind,
        mode: body.mode,
        query: body.query,
        status,
        domain: descriptor.domain,
        widgets: [],
        presets,
        form,
        completeList,
        cached: false,
        errors: [{ code: status === 'stub' ? 'not_implemented' : 'researched_only' }],
        fetchedAt: new Date().toISOString(),
      });
    }

    if (status === 'missing_key') {
      return LiveDataSourceQueryResponse.parse({
        kind,
        mode: body.mode,
        query: body.query,
        status,
        domain: descriptor.domain,
        widgets: [],
        presets,
        form,
        completeList,
        cached: false,
        errors: [{ code: 'missing_key' }],
        fetchedAt: new Date().toISOString(),
      });
    }

    const query =
      body.mode === 'browse' && !body.query.trim()
        ? defaultBrowseQueryForDomain(descriptor.domain)
        : body.query.trim() || defaultBrowseQueryForDomain(descriptor.domain);

    const cacheKey = liveDataSourceQueryApiCacheKey({
      companyId,
      kind,
      mode: body.mode,
      query,
      maxResults,
    });

    const { data, fromCache } = await loadLiveDataSourceQueryApiCached(
      cacheKey,
      async () => {
        // Operator live preview (may include numeric display fields for UI only).
        try {
          const preview = await buildOperatorLivePreviewWidgets({
            kind,
            query,
            maxResults,
            forceRefresh,
            credentials: {
              ...(gatherCredentials.alpacaKeyId
                ? { alpacaKeyId: gatherCredentials.alpacaKeyId }
                : {}),
              ...(gatherCredentials.alpacaSecret
                ? { alpacaSecret: gatherCredentials.alpacaSecret }
                : {}),
            },
          });
          if (preview && preview.widgets.length > 0) {
            return LiveDataSourceQueryResponse.parse({
              kind,
              mode: body.mode,
              query,
              status,
              domain: descriptor.domain,
              widgets: preview.widgets,
              presets,
              form,
              completeList,
              cached: preview.fromCache,
              errors: [],
              fetchedAt: new Date(preview.fetchedAtMs).toISOString(),
            });
          }
        } catch {
          // Fall through to qualitative evidence packages.
        }

        const { packages, errors } = await gatherEvidencePackages({
          query,
          sourceKinds: [kind],
          allowlist: [],
          blocklist: [],
          maxEvidence: maxResults,
          ...gatherCredentials,
          secAllowEmptyOnError: true,
          marketNewsAllowDeterministicFallback: true,
        });

        const widgets = packages.slice(0, maxResults).map((pkg, i) =>
          evidenceToLiveDataSourceWidget(pkg, {
            domain: descriptor.domain,
            index: i,
            query,
          }),
        );

        return LiveDataSourceQueryResponse.parse({
          kind,
          mode: body.mode,
          query,
          status,
          domain: descriptor.domain,
          widgets,
          presets,
          form,
          completeList,
          cached: false,
          errors: errors.map((e) => ({ code: e.code.slice(0, 80) })),
          fetchedAt: new Date().toISOString(),
        });
      },
      { force: forceRefresh },
    );

    if (fromCache) {
      return LiveDataSourceQueryResponse.parse({
        ...data,
        cached: true,
      });
    }
    return data;
  });
}
