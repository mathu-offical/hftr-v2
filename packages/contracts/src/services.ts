import { z } from 'zod';
import type { AdapterCapabilities } from './broker';
import { ModuleType, type ModuleType as ModuleTypeValue } from './modules';
import type { EngineTemplate } from './templates';

/**
 * User-owned service capabilities consumed by modules and engines
 * (company-equity-and-service-sources design).
 */

export const ServiceCapability = z.enum([
  'market_quotes',
  'historical_bars',
  'trade_execution',
  'account_balances',
  'open_positions',
  'event_contract_quotes',
  'crypto_quotes',
  'research_provider',
]);
export type ServiceCapability = z.infer<typeof ServiceCapability>;

export const ServiceRequirement = z.object({
  required: z.array(ServiceCapability),
  optional: z.array(ServiceCapability),
});
export type ServiceRequirement = z.infer<typeof ServiceRequirement>;

export const EquityStatus = z.enum(['fresh', 'stale', 'unavailable']);
export type EquityStatus = z.infer<typeof EquityStatus>;

const EquityCentsString = z.string().regex(/^\d+$/);
const EquityAsOfIso = z.string().datetime();

/**
 * Public company equity read projection.
 * fresh/stale always retain the last successful cents + asOf; unavailable may be
 * null/null when never successfully computed (or after a failed first calc).
 */
export const CompanyEquityProjection = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('fresh'),
    equityCents: EquityCentsString,
    asOfIso: EquityAsOfIso,
    version: z.number().int().nonnegative(),
  }),
  z.object({
    status: z.literal('stale'),
    equityCents: EquityCentsString,
    asOfIso: EquityAsOfIso,
    version: z.number().int().nonnegative(),
  }),
  z.object({
    status: z.literal('unavailable'),
    equityCents: EquityCentsString.nullable(),
    asOfIso: EquityAsOfIso.nullable(),
    version: z.number().int().nonnegative(),
  }),
]);
export type CompanyEquityProjection = z.infer<typeof CompanyEquityProjection>;

/** Resolved module coverage against verified user-owned service sources. */
export const ModuleServiceCoverage = z.object({
  moduleType: ModuleType,
  moduleId: z.string().uuid().optional(),
  required: z.array(ServiceCapability),
  optional: z.array(ServiceCapability),
  boundCapabilities: z.array(ServiceCapability),
  missingRequired: z.array(ServiceCapability),
  missingOptional: z.array(ServiceCapability),
});
export type ModuleServiceCoverage = z.infer<typeof ModuleServiceCoverage>;

function requirement(
  required: readonly ServiceCapability[] = [],
  optional: readonly ServiceCapability[] = [],
): ServiceRequirement {
  return { required: [...required], optional: [...optional] };
}

export const MODULE_SERVICE_REQUIREMENTS: Record<ModuleTypeValue, ServiceRequirement> = {
  research: requirement(['research_provider'], ['historical_bars']),
  library: requirement([], ['research_provider']),
  live_api: requirement(
    ['market_quotes'],
    ['historical_bars', 'crypto_quotes', 'event_contract_quotes'],
  ),
  trend: requirement(['market_quotes'], ['historical_bars', 'research_provider']),
  trading: requirement(
    ['market_quotes', 'trade_execution'],
    ['account_balances', 'open_positions'],
  ),
  policy: requirement([], []),
  generator: requirement([], ['research_provider', 'historical_bars']),
  simulator: requirement(['historical_bars'], ['market_quotes']),
  analyzer: requirement([], ['open_positions', 'account_balances']),
  holding_fund: requirement([], ['account_balances']),
  fund_router: requirement([], ['account_balances']),
  math: requirement([], []),
  display: requirement([], []),
};

function dedupeSorted(caps: Iterable<ServiceCapability>): ServiceCapability[] {
  return [...new Set(caps)].sort();
}

/** Union member module requirements for an insertable engine template. */
export function requirementsForEngine(template: EngineTemplate): ServiceRequirement {
  const required = new Set<ServiceCapability>();
  const optional = new Set<ServiceCapability>();

  for (const mod of template.modules) {
    const moduleReqs = MODULE_SERVICE_REQUIREMENTS[mod.type];
    for (const cap of moduleReqs.required) {
      required.add(cap);
      optional.delete(cap);
    }
    for (const cap of moduleReqs.optional) {
      if (!required.has(cap)) optional.add(cap);
    }
  }

  return {
    required: dedupeSorted(required),
    optional: dedupeSorted(optional),
  };
}

/**
 * Normalize legacy adapter capabilities into service capability strings.
 * Only capabilities truthfully implied by AdapterCapabilities / BrokerAdapter:
 * market_quotes + account_balances are always present on BrokerAdapter;
 * trade_execution only when orderTypes is non-empty; asset-specific quote
 * capabilities are asset-gated. historical_bars and open_positions are never
 * inferred (optional on BrokerAdapter / not declared on AdapterCapabilities).
 */
export function normalizeAdapterServiceCapabilities(
  adapter: AdapterCapabilities | null | undefined,
): ServiceCapability[] {
  if (!adapter) return [];

  const caps = new Set<ServiceCapability>(['market_quotes', 'account_balances']);

  if (adapter.orderTypes.length > 0) caps.add('trade_execution');
  if (adapter.assets.includes('crypto')) caps.add('crypto_quotes');
  if (adapter.assets.includes('event_contract')) caps.add('event_contract_quotes');

  return dedupeSorted(caps);
}
