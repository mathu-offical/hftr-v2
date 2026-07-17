import type { Db } from '@hftr/db';
import { requiredModuleSetupFields, type ModuleSetupInput, type ModuleType } from '@hftr/contracts';
import { calcStore, type Clock } from '@hftr/engine';

const CONFIG_TTL_MS = Number.MAX_SAFE_INTEGER;
const PERCENT_SCALE = 4;

export interface ModuleSetupPatch {
  topicSectors?: string[];
  capitalAllocationRef?: string;
  targetExitRef?: string;
  config?: Record<string, unknown>;
}

function decimalToScaledInt(value: string, scale: number): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  const normalizedFraction = fraction.padEnd(scale, '0').slice(0, scale);
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(normalizedFraction || '0');
}

function setupConfig(
  type: ModuleType,
  config: Record<string, unknown>,
  topicSectors: readonly string[],
): Record<string, unknown> {
  if (topicSectors.length === 0) return config;
  const scope = topicSectors.join(', ');
  switch (type) {
    case 'research':
    case 'library':
      return { ...config, topicScope: scope };
    case 'trend':
      return { ...config, focus: scope };
    case 'live_api':
    case 'trading':
    case 'policy':
    case 'generator':
    case 'simulator':
    case 'analyzer':
    case 'holding_fund':
    case 'fund_router':
    case 'math':
    case 'display':
      return config;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Converts raw operator setup into append-only numeric/temporal references.
 * Missing fields are intentionally omitted so skipped nodes remain draft and
 * expose their missing-field chips on the canvas.
 */
export async function recordModuleSetup(
  db: Db,
  clock: Clock,
  companyId: string,
  moduleId: string,
  type: ModuleType,
  config: Record<string, unknown>,
  setup: ModuleSetupInput | undefined,
): Promise<ModuleSetupPatch> {
  if (!setup) return {};

  const patch: ModuleSetupPatch = {};
  const required = new Set(requiredModuleSetupFields(type));
  if (required.has('topic_sector') && setup.topicSectors !== undefined) {
    patch.topicSectors = setup.topicSectors;
    patch.config = setupConfig(type, config, setup.topicSectors);
  }

  if (required.has('capital_allocation') && setup.capitalAllocation) {
    const amount = setup.capitalAllocation;
    const isFixedAmount = amount.mode === 'amount';
    patch.capitalAllocationRef = await calcStore.record(db, clock, {
      kind: isFixedAmount ? 'usd_cents' : 'pct',
      unit: isFixedAmount ? 'USD_cents' : 'pct',
      scale: isFixedAmount ? 0 : PERCENT_SCALE,
      valueInt: decimalToScaledInt(amount.value, isFixedAmount ? 2 : PERCENT_SCALE),
      sourceClass: 'operator_input',
      sourceId: `module_setup:${moduleId}:capital_allocation`,
      ttlMs: CONFIG_TTL_MS,
      companyId,
      moduleId,
      sanity: {
        minInt: '0',
        maxInt: isFixedAmount ? null : (100n * 10n ** BigInt(PERCENT_SCALE)).toString(),
        maxAgeMs: null,
        mustBePositive: false,
      },
    });
  }

  if (required.has('target_exit') && setup.targetExitAt) {
    const targetMs = Date.parse(setup.targetExitAt);
    if (!Number.isFinite(targetMs) || targetMs <= clock.nowMs()) {
      throw new Error('target_exit_must_be_future');
    }
    patch.targetExitRef = await calcStore.record(db, clock, {
      kind: 'timestamp_ms',
      unit: 'epoch_ms',
      scale: 0,
      valueInt: BigInt(targetMs),
      timezone: setup.timezone ?? 'UTC',
      sourceClass: 'operator_input',
      sourceId: `module_setup:${moduleId}:target_exit`,
      ttlMs: CONFIG_TTL_MS,
      companyId,
      moduleId,
      sanity: {
        minInt: clock.nowMs().toString(),
        maxInt: null,
        maxAgeMs: null,
        mustBePositive: true,
      },
    });
  }

  return patch;
}
