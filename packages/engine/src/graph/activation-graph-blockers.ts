import type { LinkKind, ModuleType } from '@hftr/contracts';
import { TIME_BEARING_MODULE_TYPES } from '@hftr/contracts';

export interface ActivationGraphModule {
  id: string;
  type: ModuleType;
}

export interface ActivationGraphLink {
  fromModuleId: string;
  toModuleId: string;
  linkKind: LinkKind;
}

/** Research outbound data_feed targets when no library module exists on the canvas (D-041). */
const RESEARCH_OUTBOUND_CONSUMER_TYPES: readonly ModuleType[] = ['library', 'librarian', 'math'];

function inboundLinksOfKind(
  moduleId: string,
  links: readonly ActivationGraphLink[],
  kind: LinkKind,
): readonly ActivationGraphLink[] {
  return links.filter((link) => link.toModuleId === moduleId && link.linkKind === kind);
}

function outboundLinksOfKind(
  moduleId: string,
  links: readonly ActivationGraphLink[],
  kind: LinkKind,
): readonly ActivationGraphLink[] {
  return links.filter((link) => link.fromModuleId === moduleId && link.linkKind === kind);
}

function peersById(peers: readonly ActivationGraphModule[]): Map<string, ModuleType> {
  return new Map(peers.map((peer) => [peer.id, peer.type]));
}

function inboundDataFeedFromTypes(
  moduleId: string,
  links: readonly ActivationGraphLink[],
  peerTypes: Map<string, ModuleType>,
  allowedSourceTypes: readonly ModuleType[],
): boolean {
  return inboundLinksOfKind(moduleId, links, 'data_feed').some((link) => {
    const sourceType = peerTypes.get(link.fromModuleId);
    return sourceType !== undefined && allowedSourceTypes.includes(sourceType);
  });
}

function outboundDataFeedToTypes(
  moduleId: string,
  links: readonly ActivationGraphLink[],
  peerTypes: Map<string, ModuleType>,
  allowedTargetTypes: readonly ModuleType[],
): boolean {
  return outboundLinksOfKind(moduleId, links, 'data_feed').some((link) => {
    const targetType = peerTypes.get(link.toModuleId);
    return targetType !== undefined && allowedTargetTypes.includes(targetType);
  });
}

function timeBearingBlocker(
  module: ActivationGraphModule,
  links: readonly ActivationGraphLink[],
  peerTypes: Map<string, ModuleType>,
): string | null {
  if (!TIME_BEARING_MODULE_TYPES.has(module.type)) return null;
  const hasTime = inboundDataFeedFromTypes(module.id, links, peerTypes, ['time']);
  if (hasTime) return null;
  return `${module.type} module requires an inbound Time data feed (engine Time hub or Time tool) before it can run.`;
}

/**
 * Human-readable activation blockers from canvas link topology.
 * Used when promoting or keeping a module in `active` status (ARCH-005).
 *
 * `peers` must list every module on the company canvas (id + type) so edge
 * endpoints can be resolved. `links` should include all edges incident on
 * the module under test.
 */
export function activationGraphBlockers(
  module: ActivationGraphModule,
  links: readonly ActivationGraphLink[],
  peers: readonly ActivationGraphModule[] = [],
): readonly string[] {
  const peerTypes = peersById(peers);
  const timeBlocker = timeBearingBlocker(module, links, peerTypes);

  switch (module.type) {
    case 'trading': {
      const blockers: string[] = [];
      const hasOperationalFeed = inboundLinksOfKind(module.id, links, 'data_feed').some((link) => {
        const sourceType = peerTypes.get(link.fromModuleId);
        return sourceType !== undefined && sourceType !== 'time' && sourceType !== 'clock';
      });
      if (!hasOperationalFeed) {
        blockers.push(
          'Trading module requires at least one inbound data feed link (for example from live API or math) before it can run.',
        );
      }
      if (timeBlocker) blockers.push(timeBlocker);
      return blockers;
    }
    case 'research': {
      const blockers: string[] = [];
      // D-041: research admits into libraries; when a library peer exists on the
      // canvas, activation requires an outbound data_feed to at least one of them.
      // With no library peer, fall back to any legal outbound data_feed consumer.
      const hasLibraryPeer = peers.some((peer) => peer.type === 'library');
      const requiredTargets: readonly ModuleType[] = hasLibraryPeer
        ? ['library']
        : RESEARCH_OUTBOUND_CONSUMER_TYPES;

      if (!outboundDataFeedToTypes(module.id, links, peerTypes, requiredTargets)) {
        if (hasLibraryPeer) {
          blockers.push(
            'Research module requires at least one outbound data feed link to a library module before it can run.',
          );
        } else {
          blockers.push(
            'Research module requires at least one outbound data feed link to a library, librarian, or math module before it can run.',
          );
        }
      }
      if (timeBlocker) blockers.push(timeBlocker);
      return blockers;
    }
    case 'trend': {
      const blockers: string[] = [];
      if (!inboundDataFeedFromTypes(module.id, links, peerTypes, ['library', 'live_api'])) {
        blockers.push(
          'Trend module requires at least one inbound data feed link from a library or live API module before it can run.',
        );
      }
      if (timeBlocker) blockers.push(timeBlocker);
      return blockers;
    }
    case 'library': {
      if (!inboundDataFeedFromTypes(module.id, links, peerTypes, ['research', 'librarian'])) {
        return [
          'Library module requires at least one inbound data feed link from a research or librarian module before it can run.',
        ];
      }
      return [];
    }
    case 'librarian': {
      const blockers: string[] = [];
      if (!inboundDataFeedFromTypes(module.id, links, peerTypes, ['library', 'research'])) {
        blockers.push(
          'Librarian module requires at least one inbound data feed link from a library or research module before it can run.',
        );
      }
      if (timeBlocker) blockers.push(timeBlocker);
      return blockers;
    }
    case 'policy':
    case 'analyzer': {
      return timeBlocker ? [timeBlocker] : [];
    }
    case 'live_api':
    case 'generator':
    case 'simulator':
    case 'holding_fund':
    case 'fund_router':
    case 'math':
    case 'display':
    case 'clock':
    case 'time':
      return [];
    default: {
      const _exhaustive: never = module.type;
      return _exhaustive;
    }
  }
}
