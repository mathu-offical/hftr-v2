/**
 * Map seal / feed provenance kinds to lightweight Market Posture source chips (D-155).
 * Labels must say api | library | system | setting. Never invent sources.
 */

import {
  RESEARCH_SOURCE_REGISTRY,
  ResearchSourceKind,
  type MarketHubSourceChip,
  type MarketHubSourceChipClass,
} from '@hftr/contracts';

const INTERNAL_LIBRARY = new Set(['library']);
const INTERNAL_SYSTEM = new Set(['catalog']);
const SETTING_KINDS = new Set(['operator', 'sector_focus', 'universe', 'company_setting']);

function chipClassForKind(kind: string): MarketHubSourceChipClass {
  if (SETTING_KINDS.has(kind)) return 'setting';
  if (INTERNAL_LIBRARY.has(kind)) return 'library';
  if (INTERNAL_SYSTEM.has(kind)) return 'system';
  if (kind === 'synthetic' || kind === 'synthetic_sim' || kind === 'ledger') return 'system';
  if (kind === 'movers_rank') return 'system';
  if (kind === 'broker_paper' || kind === 'broker_live') return 'api';
  if (kind.startsWith('system:')) return 'system';
  if (kind.startsWith('lib:')) return 'library';
  const parsed = ResearchSourceKind.safeParse(kind);
  if (parsed.success) {
    const desc = RESEARCH_SOURCE_REGISTRY[parsed.data];
    if (desc.authMode === 'none') return 'api';
    return 'api';
  }
  return 'api';
}

function chipLabelForKind(kind: string): string {
  switch (kind) {
    case 'catalog':
      return 'catalog seed';
    case 'library':
      return 'library';
    case 'operator':
      return 'operator';
    case 'synthetic':
    case 'synthetic_sim':
      return 'synthetic mark';
    case 'broker_paper':
      return 'broker paper';
    case 'ledger':
      return 'ledger';
    case 'movers_rank':
      return 'movers rank';
    case 'sector_focus':
      return 'sector setting';
    default: {
      const parsed = ResearchSourceKind.safeParse(kind);
      if (parsed.success) {
        return kind.replace(/_/g, ' ');
      }
      return kind.replace(/_/g, ' ').slice(0, 40);
    }
  }
}

/**
 * Build chips from confirmed source kind ids (seal contributingSourceKinds, mark feed, …).
 * Dedupes; empty when no kinds.
 */
export function buildMarketHubSourceChips(kinds: Iterable<string>): MarketHubSourceChip[] {
  const seen = new Set<string>();
  const out: MarketHubSourceChip[] = [];
  for (const raw of kinds) {
    const kind = raw.trim();
    if (!kind || seen.has(kind)) continue;
    seen.add(kind);
    const chipClass = chipClassForKind(kind);
    out.push({
      id: kind.slice(0, 40),
      label: chipLabelForKind(kind).slice(0, 40),
      class: chipClass,
    });
    if (out.length >= 12) break;
  }
  return out;
}

/** Class short word shown on the chip — must say provenance family. */
export function sourceChipClassWord(chipClass: MarketHubSourceChipClass): string {
  switch (chipClass) {
    case 'api':
      return 'api';
    case 'library':
      return 'library';
    case 'system':
      return 'system';
    case 'setting':
      return 'setting';
    default: {
      const _exhaustive: never = chipClass;
      return _exhaustive;
    }
  }
}
