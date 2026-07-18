import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  AdapterCapabilities as AdapterCapabilitiesSchema,
  type ModuleType,
  type ServiceCapability,
  normalizeAdapterServiceCapabilities,
  normalizeResearchKeyServiceCapabilities,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import {
  brokerConnections,
  companies,
  moduleServiceBindings,
  modules,
  userResearchKeys,
} from '@hftr/db/schema';
import {
  resolveModuleServiceCoverage,
  type ModuleServiceSource,
  type ResolvedModuleServiceCoverage,
} from './resolve-module-services';

/**
 * Load verified user sources, resolve coverage per company module, and replace
 * persisted `module_service_bindings` rows (D-090 / D-093).
 *
 * Sources: connected brokers (stored capabilities JSON) + research gather keys.
 * LLM BYOK keys are not market/research service sources.
 */
export async function resolveCompanyServiceBindings(
  db: Db,
  clerkUserId: string,
  companyId: string,
): Promise<ResolvedModuleServiceCoverage[]> {
  const companyModules = await db
    .select({ id: modules.id, type: modules.type })
    .from(modules)
    .where(eq(modules.companyId, companyId));

  const brokers = await db
    .select()
    .from(brokerConnections)
    .where(
      and(
        eq(brokerConnections.clerkUserId, clerkUserId),
        inArray(brokerConnections.status, ['connected']),
      ),
    );

  const researchKeys = await db
    .select({ id: userResearchKeys.id, provider: userResearchKeys.provider })
    .from(userResearchKeys)
    .where(eq(userResearchKeys.clerkUserId, clerkUserId));

  const sources: ModuleServiceSource[] = [
    ...brokers.map((b) => {
      const caps = b.capabilities
        ? AdapterCapabilitiesSchema.safeParse(b.capabilities)
        : null;
      const normalized = normalizeAdapterServiceCapabilities(
        caps?.success ? caps.data : null,
      );
      // Alpaca paper market-data path can also fetch OHLC (promote / evidence).
      const withBars =
        b.venue === 'alpaca' && !normalized.includes('historical_bars')
          ? ([...normalized, 'historical_bars'] as ServiceCapability[]).sort()
          : normalized;
      return {
        id: b.id,
        kind: 'broker_connection' as const,
        available: true,
        capabilities: withBars,
      };
    }),
    ...researchKeys.map((k) => ({
      id: k.id,
      kind: 'user_research_key' as const,
      available: true,
      capabilities: normalizeResearchKeyServiceCapabilities(k.provider),
    })),
  ];

  const coverage = resolveModuleServiceCoverage(
    companyModules.map((m) => ({
      moduleId: m.id,
      moduleType: m.type as ModuleType,
    })),
    sources,
  );

  await db.delete(moduleServiceBindings).where(eq(moduleServiceBindings.companyId, companyId));

  const now = new Date();
  const rows = coverage.flatMap((c) =>
    c.bindings.map((b) => ({
      companyId,
      moduleId: b.moduleId,
      sourceKind: b.sourceKind,
      capability: b.capability,
      brokerConnectionId: b.sourceKind === 'broker_connection' ? b.sourceId : null,
      userApiKeyId: b.sourceKind === 'user_api_key' ? b.sourceId : null,
      userResearchKeyId: b.sourceKind === 'user_research_key' ? b.sourceId : null,
      status: 'bound' as const,
      lastVerifiedAt: now,
      updatedAt: now,
    })),
  );

  if (rows.length > 0) {
    await db.insert(moduleServiceBindings).values(rows);
  }

  return coverage;
}

/** Re-resolve bindings for every active company owned by the user (D-093). */
export async function resolveAllOwnedCompanyServiceBindings(
  db: Db,
  clerkUserId: string,
): Promise<void> {
  const owned = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.clerkUserId, clerkUserId), isNull(companies.archivedAt)));
  for (const company of owned) {
    await resolveCompanyServiceBindings(db, clerkUserId, company.id);
  }
}
