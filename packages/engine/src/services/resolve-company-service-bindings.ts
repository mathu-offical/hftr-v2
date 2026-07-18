import { and, eq, inArray } from 'drizzle-orm';
import {
  AdapterCapabilities as AdapterCapabilitiesSchema,
  type ModuleType,
  type ServiceCapability,
  normalizeAdapterServiceCapabilities,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import {
  brokerConnections,
  moduleServiceBindings,
  modules,
  userApiKeys,
} from '@hftr/db/schema';
import {
  resolveModuleServiceCoverage,
  type ModuleServiceSource,
  type ResolvedModuleServiceCoverage,
} from './resolve-module-services';

/**
 * Load verified user sources, resolve coverage per company module, and replace
 * persisted `module_service_bindings` rows (D-090).
 *
 * Uses stored broker `capabilities` JSON (written on verify) — no live adapter
 * instantiation required for coverage resolution.
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

  const keys = await db
    .select({ id: userApiKeys.id })
    .from(userApiKeys)
    .where(eq(userApiKeys.clerkUserId, clerkUserId));

  const sources: ModuleServiceSource[] = [
    ...brokers.map((b) => {
      const caps = b.capabilities
        ? AdapterCapabilitiesSchema.safeParse(b.capabilities)
        : null;
      return {
        id: b.id,
        kind: 'broker_connection' as const,
        available: true,
        capabilities: normalizeAdapterServiceCapabilities(
          caps?.success ? caps.data : null,
        ),
      };
    }),
    ...keys.map((k) => ({
      id: k.id,
      kind: 'user_api_key' as const,
      available: true,
      // LLM BYOK keys are not market service sources; research-keys land later.
      capabilities: [] as ServiceCapability[],
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
      capability: b.capability,
      brokerConnectionId: b.sourceKind === 'broker_connection' ? b.sourceId : null,
      userApiKeyId: b.sourceKind === 'user_api_key' ? b.sourceId : null,
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
