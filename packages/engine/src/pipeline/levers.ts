import type { LeverLayer, LeverSetting, LeverState } from '@hftr/contracts';
import { PHILOSOPHY_AXIS_CATALOG } from '@hftr/contracts';

/**
 * Deterministic lever-scope enforcement for v2 LeverSetting shapes
 * ({ mode: 'band' | 'calc', bandId, position|calcOp }).
 * Fail-closed: unknown band, out-of-scope layer, or invalid position → reject.
 */

export interface ScopeEnforcementRejected {
  bandId: string;
  reason: 'unknown_lever' | 'out_of_scope' | 'out_of_range' | 'invalid_value';
}

export interface ScopeEnforcementResult {
  ok: boolean;
  accepted: LeverState;
  rejected: ScopeEnforcementRejected[];
}

/** bandId → owning layer(s) from philosophy axis catalog (+ execution fill timeout). */
const BAND_LAYER = new Map<string, LeverLayer>();

for (const meta of PHILOSOPHY_AXIS_CATALOG) {
  if (meta.layer === 'policy') {
    // Policy axes constrain strategic/execution envelopes; treat as strategic for scope.
    for (const bandId of meta.bandIds) {
      if (!BAND_LAYER.has(bandId)) BAND_LAYER.set(bandId, 'strategic');
    }
    continue;
  }
  for (const bandId of meta.bandIds) {
    BAND_LAYER.set(bandId, meta.layer);
  }
}

const KNOWN_BANDS = new Set(BAND_LAYER.keys());

export function knownBandIds(): readonly string[] {
  return [...KNOWN_BANDS];
}

export function enforceScope(layer: LeverLayer, requested: LeverState): ScopeEnforcementResult {
  const accepted: LeverState = {};
  const rejected: ScopeEnforcementRejected[] = [];

  for (const [bandId, setting] of Object.entries(requested)) {
    if (!KNOWN_BANDS.has(bandId)) {
      rejected.push({ bandId, reason: 'unknown_lever' });
      continue;
    }
    const owner = BAND_LAYER.get(bandId);
    if (owner !== layer) {
      rejected.push({ bandId, reason: 'out_of_scope' });
      continue;
    }
    if (!isValidSetting(setting)) {
      rejected.push({ bandId, reason: 'invalid_value' });
      continue;
    }
    if (setting.bandId !== bandId) {
      rejected.push({ bandId, reason: 'invalid_value' });
      continue;
    }
    accepted[bandId] = setting;
  }

  return { ok: rejected.length === 0, accepted, rejected };
}

/** Fail-closed: throws when any setting is rejected. */
export function enforceScopeStrict(layer: LeverLayer, requested: LeverState): LeverState {
  const result = enforceScope(layer, requested);
  if (!result.ok) {
    const detail = result.rejected.map((r) => `${r.bandId}:${r.reason}`).join(',');
    throw new Error(`lever scope violation (${layer}): ${detail}`);
  }
  return result.accepted;
}

/** Split a full LeverState into per-layer slices and enforce each. */
export function enforceAllLayers(state: LeverState): LeverState {
  const byLayer: Record<LeverLayer, LeverState> = {
    strategic: {},
    tactical: {},
    execution: {},
  };
  for (const [bandId, setting] of Object.entries(state)) {
    const layer = BAND_LAYER.get(bandId);
    if (!layer) {
      throw new Error(`lever scope violation: ${bandId}:unknown_lever`);
    }
    byLayer[layer][bandId] = setting;
  }
  return {
    ...enforceScopeStrict('strategic', byLayer.strategic),
    ...enforceScopeStrict('tactical', byLayer.tactical),
    ...enforceScopeStrict('execution', byLayer.execution),
  };
}

function isValidSetting(setting: LeverSetting): boolean {
  if (setting.mode === 'band') {
    return (
      setting.position === 'min' || setting.position === 'typical' || setting.position === 'max'
    );
  }
  if (setting.mode === 'calc') {
    return typeof setting.calcOpName === 'string' && setting.calcOpName.length > 0;
  }
  return false;
}
