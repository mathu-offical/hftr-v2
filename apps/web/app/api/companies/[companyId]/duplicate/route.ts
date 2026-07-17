import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  DisplayModuleConfig,
  FundRouterModuleConfig,
  ResearchModuleConfig,
  type ModuleType,
} from '@hftr/contracts';
import { companies, engineInstances, moduleLinks, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { ApiError, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const MAX_COMPANIES_PER_USER = 20;

/**
 * Duplicate a company canvas topology (engines, modules, links).
 * Always creates a paper company — never copies live arming or broker bind.
 * Runtime artifacts (traces, jobs, libraries) stay on the source.
 */
export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const source = await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const existing = await scoping.listCompanies(db, clerkUserId);
    if (existing.length >= MAX_COMPANIES_PER_USER) {
      throw new ApiError(422, 'company_limit_reached');
    }

    const sourceEngines = await scoping.listEngineInstances(db, clerkUserId, companyId);
    const sourceModules = await scoping.listModules(db, clerkUserId, companyId);
    const sourceLinks = await scoping.listLinks(db, clerkUserId, companyId);

    // Preallocate ids so Neon HTTP can commit the complete dependent graph in
    // one atomic batch (interactive transactions are unsupported by this driver).
    const createdCompanyId = randomUUID();
    const engineIdMap = new Map(sourceEngines.map((engine) => [engine.id, randomUUID()]));
    const moduleIdMap = new Map(sourceModules.map((module) => [module.id, randomUUID()]));

    const companyInsert = db.insert(companies).values({
      id: createdCompanyId,
      clerkUserId,
      name: truncateName(`${source.name} (copy)`),
      philosophyPrompt: source.philosophyPrompt,
      philosophyProfile: source.philosophyProfile,
      llmPolicy: source.llmPolicy,
      goals: source.goals,
      reinvestmentPolicy: source.reinvestmentPolicy,
      scopingPolicies: source.scopingPolicies,
      mode: 'paper',
      // Fail-closed: a topology copy never mints capital or inherits automation,
      // broker binding, live arming, or live-gate evidence.
      seedCreditsCents: 0n,
      autoFundPolicy: {},
      brokerConnectionId: null,
      liveArmedAt: null,
      liveGateEvidenceId: null,
    });

    const engineInserts = sourceEngines.map((engine) =>
      db.insert(engineInstances).values({
        id: requireMappedId(engineIdMap, engine.id, 'engine_duplicate_unresolved'),
        companyId: createdCompanyId,
        templateId: engine.templateId,
        label: engine.label,
        masterTopicSectors: engine.masterTopicSectors,
        canvasBounds: engine.canvasBounds,
      }),
    );

    const moduleInserts = sourceModules.map((module) =>
      db.insert(modules).values({
        id: requireMappedId(moduleIdMap, module.id, 'module_duplicate_unresolved'),
        companyId: createdCompanyId,
        type: module.type,
        subtype: module.subtype,
        name: module.name,
        generatedNameBase: module.generatedNameBase,
        nameCustomized: module.nameCustomized,
        config: copyModuleConfig(module.type, module.config, moduleIdMap),
        configSchemaVersion: module.configSchemaVersion,
        // Copied companies require an explicit operator review before running.
        status: module.type === 'math' ? 'active' : 'draft',
        allocationCents: 0n,
        topicSectors: module.topicSectors,
        topicSectorsOverridden: module.topicSectorsOverridden,
        // ValueRefs are company-scoped runtime artifacts and cannot cross the copy boundary.
        capitalAllocationRef: null,
        targetExitRef: null,
        canvasPosition: module.canvasPosition,
        philosophyOverride: module.philosophyOverride,
        engineInstanceId: module.engineInstanceId
          ? requireMappedId(engineIdMap, module.engineInstanceId, 'engine_duplicate_unresolved')
          : null,
        toolOwnerModuleId: module.toolOwnerModuleId
          ? requireMappedId(
              moduleIdMap,
              module.toolOwnerModuleId,
              'math_owner_duplicate_unresolved',
            )
          : null,
      }),
    );

    const linkInserts =
      sourceLinks.length === 0
        ? []
        : [
            db.insert(moduleLinks).values(
              sourceLinks.map((link) => ({
                companyId: createdCompanyId,
                fromModuleId: requireMappedId(
                  moduleIdMap,
                  link.fromModuleId,
                  'link_duplicate_unresolved',
                ),
                toModuleId: requireMappedId(
                  moduleIdMap,
                  link.toModuleId,
                  'link_duplicate_unresolved',
                ),
                linkKind: link.linkKind,
              })),
            ),
          ];

    await db.batch([companyInsert, ...engineInserts, ...moduleInserts, ...linkInserts]);
    const created = await scoping.getOwnedCompany(db, clerkUserId, createdCompanyId);
    return { company: created };
  });
}

function truncateName(name: string): string {
  if (name.length <= 80) return name;
  return name.slice(0, 80);
}

function requireMappedId(
  ids: ReadonlyMap<string, string>,
  sourceId: string,
  errorCode: string,
): string {
  const id = ids.get(sourceId);
  if (!id) throw new ApiError(500, errorCode);
  return id;
}

/**
 * Remove company-bound ids and remap topology-local ids. Unknown/generic
 * configs are preserved, while every declared relational field is handled
 * explicitly so a copy cannot reach back into the source company.
 */
function copyModuleConfig(
  type: ModuleType,
  config: unknown,
  moduleIdMap: ReadonlyMap<string, string>,
): unknown {
  switch (type) {
    case 'research': {
      const parsed = ResearchModuleConfig.parse(config);
      return { ...parsed, targetLibraryIds: [] };
    }
    case 'display': {
      const parsed = DisplayModuleConfig.parse(config);
      return {
        ...parsed,
        sourceModuleIds: parsed.sourceModuleIds.flatMap((id) => {
          const mapped = moduleIdMap.get(id);
          return mapped ? [mapped] : [];
        }),
      };
    }
    case 'fund_router': {
      const parsed = FundRouterModuleConfig.parse(config);
      return {
        ...parsed,
        targetModuleIds: parsed.targetModuleIds.flatMap((id) => {
          const mapped = moduleIdMap.get(id);
          return mapped ? [mapped] : [];
        }),
      };
    }
    case 'library':
    case 'live_api':
    case 'trend':
    case 'trading':
    case 'policy':
    case 'generator':
    case 'simulator':
    case 'analyzer':
    case 'holding_fund':
    case 'math':
      return config;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}
