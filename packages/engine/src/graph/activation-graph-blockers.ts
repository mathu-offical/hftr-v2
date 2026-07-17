import type { LinkKind, ModuleType } from '@hftr/contracts';

export interface ActivationGraphModule {
  id: string;
  type: ModuleType;
}

export interface ActivationGraphLink {
  fromModuleId: string;
  toModuleId: string;
  linkKind: LinkKind;
}

function inboundLinksOfKind(
  moduleId: string,
  links: readonly ActivationGraphLink[],
  kind: LinkKind,
): readonly ActivationGraphLink[] {
  return links.filter((link) => link.toModuleId === moduleId && link.linkKind === kind);
}

/**
 * Human-readable activation blockers from canvas link topology.
 * Used when promoting or keeping a module in `active` status (ARCH-005).
 */
export function activationGraphBlockers(
  module: ActivationGraphModule,
  links: readonly ActivationGraphLink[],
): readonly string[] {
  switch (module.type) {
    case 'trading': {
      if (inboundLinksOfKind(module.id, links, 'data_feed').length === 0) {
        return [
          'Trading module requires at least one inbound data feed link (for example from live API or math) before it can run.',
        ];
      }
      return [];
    }
    case 'research':
    case 'librarian':
    case 'library':
    case 'live_api':
    case 'trend':
    case 'policy':
    case 'generator':
    case 'simulator':
    case 'analyzer':
    case 'holding_fund':
    case 'fund_router':
    case 'math':
    case 'display':
      return [];
    default: {
      const _exhaustive: never = module.type;
      return _exhaustive;
    }
  }
}
