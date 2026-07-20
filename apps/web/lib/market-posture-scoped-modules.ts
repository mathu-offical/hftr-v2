/**
 * Map canvas modules onto Market Posture Model sections (D-223).
 * Same module chrome; config subtype chips distinguish desk research vs peers.
 */

import type { MarketPostureStageScreenId } from './market-posture-stage-screens';

export function humanizePostureToken(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Stage screen for a non-research canvas module type. */
export function stageScreenForScopedModuleType(
  moduleType: string,
): MarketPostureStageScreenId | null {
  switch (moduleType) {
    case 'holding_fund':
    case 'fund_router':
      return 'capital';
    case 'live_api':
      return 'live';
    case 'librarian':
    case 'library':
      return 'library';
    case 'analyzer':
    case 'simulator':
    case 'generator':
    case 'math':
    case 'clock':
    case 'time':
      return 'process';
    case 'trend':
    case 'trading':
    case 'policy':
    case 'display':
      return 'outlook';
    case 'research':
      return 'library';
    default:
      return null;
  }
}

/** Config field → subtype chip for Model strip (mirrors canvas moduleSubtypeChip). */
export function subtypeChipForModuleConfig(
  moduleType: string,
  config: Record<string, unknown> | null | undefined,
): string | null {
  const cfg = config ?? {};
  switch (moduleType) {
    case 'research': {
      const subtype = cfg.researchSubtype;
      return typeof subtype === 'string' && subtype.trim()
        ? humanizePostureToken(subtype)
        : null;
    }
    case 'librarian': {
      const subtype = cfg.librarianSubtype;
      return typeof subtype === 'string' && subtype.trim()
        ? humanizePostureToken(subtype)
        : null;
    }
    case 'library': {
      const libraryClass = cfg.libraryClass;
      return typeof libraryClass === 'string' && libraryClass.trim()
        ? humanizePostureToken(libraryClass)
        : null;
    }
    case 'live_api': {
      const sourceKind = cfg.sourceKind;
      if (typeof sourceKind === 'string' && sourceKind.trim()) {
        return humanizePostureToken(sourceKind);
      }
      const venue = cfg.venue;
      if (typeof venue === 'string' && venue.trim()) {
        return humanizePostureToken(venue);
      }
      const feedClass = cfg.feedClass;
      return typeof feedClass === 'string' && feedClass.trim()
        ? humanizePostureToken(feedClass)
        : null;
    }
    case 'trading': {
      const subtype = cfg.subtype;
      return typeof subtype === 'string' && subtype.trim()
        ? humanizePostureToken(subtype)
        : null;
    }
    case 'trend': {
      const posture = cfg.trendPosture;
      return typeof posture === 'string' && posture.trim()
        ? humanizePostureToken(posture)
        : null;
    }
    case 'analyzer': {
      const hubFeed = cfg.hubFeedClass;
      if (hubFeed === 'direct') return 'Hub direct';
      if (hubFeed === 'analyzed') return 'Hub analyzed';
      const emitMode = cfg.emitMode;
      if (emitMode === 'verify_loopback') return 'Exec monitor';
      if (emitMode === 'to_desk_stream') return 'Desk stream';
      if (emitMode === 'to_library') return 'To library';
      return typeof emitMode === 'string' && emitMode.trim()
        ? humanizePostureToken(emitMode)
        : null;
    }
    case 'policy': {
      const envelope = cfg.policyEnvelopeRef;
      return typeof envelope === 'string' && envelope.trim()
        ? humanizePostureToken(envelope.replace(/_v\d+$/i, '').slice(0, 28))
        : null;
    }
    case 'holding_fund': {
      const source = cfg.source;
      return typeof source === 'string' && source.trim()
        ? humanizePostureToken(source)
        : null;
    }
    case 'fund_router': {
      const mode = cfg.approvalMode;
      return typeof mode === 'string' && mode.trim()
        ? humanizePostureToken(mode)
        : 'Fund router';
    }
    case 'math': {
      const mathType = cfg.mathType;
      return typeof mathType === 'string' && mathType.trim()
        ? humanizePostureToken(mathType)
        : null;
    }
    case 'simulator': {
      const role = cfg.simulationRole;
      return typeof role === 'string' && role.trim()
        ? humanizePostureToken(role)
        : 'Simulator';
    }
    default:
      return null;
  }
}

export function scopedModuleOperation(moduleType: string): string {
  switch (moduleType) {
    case 'librarian':
      return 'curate evidence';
    case 'trend':
      return 'scan trends';
    case 'trading':
      return 'desk execution';
    case 'analyzer':
      return 'emit / monitor';
    case 'policy':
      return 'verify policy';
    case 'fund_router':
      return 'route funds';
    case 'holding_fund':
      return 'hold capital';
    case 'simulator':
      return 'paper sim';
    case 'generator':
      return 'generate';
    case 'math':
      return 'calc ValueRefs';
    case 'clock':
      return 'session clock';
    case 'time':
      return 'time transform';
    case 'display':
      return 'display board';
    case 'live_api':
      return 'live feed';
    case 'library':
      return 'library shelf';
    default:
      return 'module';
  }
}
