import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  LiveDataSourcesResponse,
  RESEARCH_SOURCE_REGISTRY,
  ResearchSourceKind,
  liveDataSourceLabel,
  resolveLiveApiSourceKind,
  resolveLiveDataSourceStatus,
  type ResearchSourceAvailability,
  type ResearchSourceDescriptor,
} from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { modules } from '@hftr/db/schema';
import { resolveResearchGatherCredentials, researchAvailabilityFromCredentials } from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const INTERNAL_SOURCE_KINDS = new Set<z.infer<typeof ResearchSourceKind>>([
  'catalog',
  'library',
  'operator',
]);

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

function indexLiveApiModulesBySourceKind(
  rows: Array<{ id: string; config: unknown }>,
): Map<z.infer<typeof ResearchSourceKind>, string[]> {
  const byKind = new Map<z.infer<typeof ResearchSourceKind>, string[]>();
  for (const row of rows) {
    const kind = resolveLiveApiSourceKind(row.config);
    if (!kind) continue;
    const existing = byKind.get(kind) ?? [];
    existing.push(row.id);
    byKind.set(kind, existing);
  }
  return byKind;
}

/**
 * List external research hydrators with credential readiness and canvas bindings.
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const gatherCredentials = await resolveResearchGatherCredentials(db, companyId);
    const availability = researchAvailabilityFromCredentials(gatherCredentials);

    const liveApiRows = await db
      .select({ id: modules.id, config: modules.config })
      .from(modules)
      .where(and(eq(modules.companyId, companyId), eq(modules.type, 'live_api')));

    const modulesByKind = indexLiveApiModulesBySourceKind(liveApiRows);
    const fetchedAt = new Date().toISOString();

    const sources = ResearchSourceKind.options
      .filter((kind) => !INTERNAL_SOURCE_KINDS.has(kind))
      .map((kind) => {
        const descriptor = RESEARCH_SOURCE_REGISTRY[kind];
        const ready = isSourceReady(descriptor, availability);
        return {
          kind,
          domain: descriptor.domain,
          label: liveDataSourceLabel(kind),
          authMode: descriptor.authMode,
          feedClass: descriptor.feedClass,
          implementation: descriptor.implementation,
          liveMode: descriptor.liveMode,
          status: resolveLiveDataSourceStatus(descriptor, ready),
          docsUrl: descriptor.docsUrl,
          notes: descriptor.notes,
          canvasModuleIds: modulesByKind.get(kind) ?? [],
        };
      });

    return LiveDataSourcesResponse.parse({ sources, fetchedAt });
  });
}
