import { z } from 'zod';
import { TradingMode } from './foundation';
import { CompanySectorFocuses, CompanyUniverseExcludes } from './sector-focus';
import {
  CLOCK_IN_MODULE_TYPES,
  MODULE_PORT_CHANNELS,
  natureForLinkKind,
  parsePortSlotPeer,
  resolveExposedChannels,
  slotPeerId,
  type PortEdge,
  type PortNature,
  type PortSlot,
} from './port-channels';

/**
 * Company + module domain contracts (agent-docs/product/product-spec.md,
 * agent-docs/architecture/data-model.md §Companies & modules).
 */

export const ModuleType = z.enum([
  'research',
  'librarian',
  'library',
  'live_api',
  'trend',
  'trading',
  'policy',
  'generator',
  'simulator',
  'analyzer',
  'holding_fund',
  'fund_router',
  'math',
  'display',
  /** D-088: company singleton temporal authority (injectable clock + session). */
  'clock',
  /** D-088: repeatable temporal processors (delta / TZ / schedule / session). */
  'time',
]);
export type ModuleType = z.infer<typeof ModuleType>;

/** D-033: module types that receive one dedicated deterministic Math tool. */
export const MATH_REQUIRED_MODULE_TYPES: ReadonlySet<ModuleType> = new Set([
  'research',
  'librarian',
  'trend',
  'trading',
  'simulator',
  'analyzer',
  'generator',
]);

export function moduleRequiresMath(type: ModuleType): boolean {
  return MATH_REQUIRED_MODULE_TYPES.has(type);
}

/**
 * Hard cap on modules per company (hub + engine members + dedicated Math tools).
 * Sized for flexible multi-engine canvases (D-052); engines share one company queue.
 */
export const MAX_MODULES_PER_COMPANY = 200;

/** Create-form / canvas soft cap on ENGINE groups (see CreateCompanyForm). */
export const MAX_ENGINES_PER_COMPANY = 16;

/**
 * Projected module rows for company create: Math hub + Master Clock + each
 * engine member + one dedicated Math per math-required member + extras.
 */
export function projectedModuleSlotsForCreate(input: {
  engineModuleTypes: ReadonlyArray<ReadonlyArray<ModuleType>>;
  extraModuleTypes?: ReadonlyArray<ModuleType>;
}): number {
  let count = 2; // company Math hub + Master Clock (D-008 / D-088)
  for (const types of input.engineModuleTypes) {
    count += types.length;
    for (const type of types) {
      if (moduleRequiresMath(type)) count += 1;
    }
  }
  for (const type of input.extraModuleTypes ?? []) {
    count += 1;
    if (moduleRequiresMath(type)) count += 1;
  }
  return count;
}

export const TradingSubtype = z.enum(['crypto', 'prediction', 'hft', 'day', 'long_term', 'custom']);
export type TradingSubtype = z.infer<typeof TradingSubtype>;

/** D-042: external / specialty research curator kinds (`config.researchSubtype`). */
export const ResearchSubtype = z.enum([
  'external_web',
  'external_filings',
  'external_market_news',
  'specialty_desk',
  'event_catalyst',
  'crypto_onchain_context',
  'prediction_niche',
]);
export type ResearchSubtype = z.infer<typeof ResearchSubtype>;

/** D-042: librarian agent kinds (`config.librarianSubtype`). */
export const LibrarianSubtype = z.enum(['librarian_relevance', 'librarian_seed_keeper']);
export type LibrarianSubtype = z.infer<typeof LibrarianSubtype>;

/** D-042: library content class (`config.libraryClass`). */
export const LibraryClass = z.enum([
  'seeded_mechanisms',
  'topic_runtime',
  'market_history',
  'runtime_market_cache',
  'runtime_app_logs',
  'specialty_evidence',
  'master_graph',
]);
export type LibraryClass = z.infer<typeof LibraryClass>;

/** D-042: typed Math tools (`config.mathType`). */
export const MathType = z.enum([
  'company_hub',
  'fund_path',
  'desk_execution',
  'trend_signal',
  'research_metric',
  'analyzer_reconcile',
  'simulator_sandbox',
  'session_calendar',
]);
export type MathType = z.infer<typeof MathType>;

/** Preferred dedicated Math type when auto-provisioning for an owner module. */
export function preferredMathTypeForOwner(owner: ModuleType): MathType {
  switch (owner) {
    case 'research':
    case 'librarian':
      return 'research_metric';
    case 'trend':
      return 'trend_signal';
    case 'trading':
      return 'desk_execution';
    case 'analyzer':
      return 'analyzer_reconcile';
    case 'simulator':
      return 'simulator_sandbox';
    case 'generator':
      return 'research_metric';
    case 'library':
    case 'live_api':
    case 'policy':
    case 'holding_fund':
    case 'fund_router':
    case 'math':
    case 'display':
    case 'clock':
    case 'time':
      return 'company_hub';
    default: {
      const _exhaustive: never = owner;
      return _exhaustive;
    }
  }
}

export const ModuleStatus = z.enum(['active', 'paused', 'error', 'draft']);
export type ModuleStatus = z.infer<typeof ModuleStatus>;

export const LinkKind = z.enum(['data_feed', 'directive', 'verification', 'fund_route']);
export type LinkKind = z.infer<typeof LinkKind>;

/**
 * Which link kinds are allowed between module types (canvas edge validation).
 * Key: `${fromType}->${toType}`. Absent key = link rejected.
 */
export const LINK_RULES: Readonly<Record<string, readonly LinkKind[]>> = {
  'research->library': ['data_feed'],
  'librarian->library': ['data_feed'],
  'library->librarian': ['data_feed'],
  'library->trend': ['data_feed'],
  'library->research': ['data_feed'],
  'research->librarian': ['data_feed'],
  'librarian->research': ['data_feed'],
  'live_api->trend': ['data_feed'],
  'live_api->trading': ['data_feed'],
  'trend->trading': ['directive'],
  'trend->simulator': ['directive'],
  'trading->policy': ['directive'],
  // Funds only flow through Math (never into LLM / model-bearing nodes).
  'holding_fund->math': ['fund_route'],
  'math->fund_router': ['fund_route'],
  'fund_router->math': ['fund_route'],
  'math->holding_fund': ['fund_route'],
  'simulator->trend': ['verification'],
  'simulator->research': ['verification'],
  'analyzer->trend': ['verification', 'data_feed'],
  'analyzer->research': ['verification', 'data_feed'],
  'analyzer->librarian': ['verification', 'data_feed'],
  'analyzer->library': ['data_feed'],
  'library->analyzer': ['data_feed'],
  'research->analyzer': ['data_feed'],
  'librarian->analyzer': ['data_feed'],
  'live_api->analyzer': ['data_feed'],
  'trend->analyzer': ['data_feed', 'verification'],
  'trading->analyzer': ['verification'],
  'analyzer->policy': ['verification'],
  'analyzer->trading': ['data_feed'],
  // Dedicated Math ownership (D-033): owner input/context ↔ Math (data only).
  'research->math': ['data_feed'],
  'librarian->math': ['data_feed'],
  'trend->math': ['data_feed'],
  'trading->math': ['data_feed'],
  'simulator->math': ['data_feed'],
  'analyzer->math': ['data_feed'],
  'generator->math': ['data_feed'],
  // Math TOOL attachments (D-028): calculated ValueRefs return as data_feed.
  'math->research': ['data_feed'],
  'math->librarian': ['data_feed'],
  'math->library': ['data_feed'],
  'math->live_api': ['data_feed'],
  'math->trend': ['data_feed'],
  'math->trading': ['data_feed'],
  'math->simulator': ['data_feed'],
  'math->analyzer': ['data_feed'],
  'math->policy': ['data_feed'],
  'math->generator': ['data_feed'],
  'math->display': ['data_feed'],
  'trading->display': ['data_feed'],
  'analyzer->display': ['data_feed'],
  'trend->display': ['data_feed'],
  'live_api->display': ['data_feed'],
  'library->display': ['data_feed'],
  'librarian->display': ['data_feed'],
  // D-088 / D-091: Master Clock → Time hub only (direct clock→consumer deprecated).
  'clock->time': ['data_feed'],
  'clock->math': ['data_feed'],
  // D-088 / D-091: Time processors emit processed temporal refs to consumers.
  'time->trading': ['data_feed'],
  'time->trend': ['data_feed'],
  'time->policy': ['data_feed'],
  'time->analyzer': ['data_feed'],
  'time->display': ['data_feed'],
  'time->math': ['data_feed'],
  'time->research': ['data_feed'],
  'time->librarian': ['data_feed'],
  'time->library': ['data_feed'],
  'math->time': ['data_feed'],
  'math->clock': ['data_feed'],
};

/** Module types that require a Time (or engine-hydrated Time) connection when active (D-091). */
export const TIME_BEARING_MODULE_TYPES: ReadonlySet<ModuleType> = new Set([
  'trading',
  'trend',
  'policy',
  'analyzer',
  'research',
  'librarian',
]);

/** Module types allowed on either end of a fund_route edge. */
export const FUND_ROUTE_MODULE_TYPES: ReadonlySet<ModuleType> = new Set([
  'math',
  'holding_fund',
  'fund_router',
]);

/**
 * Fund routes must traverse Math: both ends are fund participants and at
 * least one end is Math. LLM / model-bearing nodes never carry fund_route.
 */
export function isLegalFundRoute(from: ModuleType, to: ModuleType): boolean {
  if (!FUND_ROUTE_MODULE_TYPES.has(from) || !FUND_ROUTE_MODULE_TYPES.has(to)) {
    return false;
  }
  return from === 'math' || to === 'math';
}

export function allowedLinkKinds(from: ModuleType, to: ModuleType): readonly LinkKind[] {
  return LINK_RULES[`${from}->${to}`] ?? [];
}

/** Canonical port ordering for canvas handle stacks (top → bottom). */
export const LINK_KIND_ORDER: readonly LinkKind[] = [
  'data_feed',
  'directive',
  'verification',
  'fund_route',
];

const GENERATED_MODULE_NAME_MAX_LENGTH = 80;
const FOCUS_TOKEN_MAX_LENGTH = 18;
const CONNECTION_REF_CAP = 2;

/** Unset focus placeholder in compact primary labels (`Fn · —`). */
export const MODULE_FOCUS_UNSET = '—';

function orderLinkKinds(kinds: Iterable<LinkKind>): readonly LinkKind[] {
  const allowed = new Set(kinds);
  return LINK_KIND_ORDER.filter((kind) => allowed.has(kind));
}

/** Inbound/outbound link-kind ports a module type may expose on the canvas. */
export function moduleLinkPorts(type: ModuleType): {
  inbound: readonly LinkKind[];
  outbound: readonly LinkKind[];
} {
  const inbound = new Set<LinkKind>();
  const outbound = new Set<LinkKind>();

  for (const [key, kinds] of Object.entries(LINK_RULES)) {
    const [from, to] = key.split('->') as [ModuleType, ModuleType];
    if (to === type) {
      for (const kind of kinds) inbound.add(kind);
    }
    if (from === type) {
      for (const kind of kinds) outbound.add(kind);
    }
  }

  return {
    inbound: orderLinkKinds(inbound),
    outbound: orderLinkKinds(outbound),
  };
}

export function handleIdForLink(kind: LinkKind, direction: 'in' | 'out'): string {
  return `${kind}-${direction}`;
}

function parseKindHandle(handle: string): { kind: LinkKind; direction: 'in' | 'out' } | null {
  const suffix = handle.endsWith('-in') ? 'in' : handle.endsWith('-out') ? 'out' : null;
  if (!suffix) return null;
  const kindPart = handle.slice(0, -(suffix.length + 1));
  const parsed = LinkKind.safeParse(kindPart);
  if (!parsed.success) return null;
  return { kind: parsed.data, direction: suffix };
}

/** Per-stream dependency port on the canvas (D-057 / D-105). */
export type StreamPortSpec = {
  handleId: string;
  kind: LinkKind;
  direction: 'in' | 'out';
  /** null = free bus for new links */
  peerModuleId: string | null;
  peerLabel: string | null;
  /** Peer module type when known (drives Math dock edge placement — D-075). */
  peerType?: ModuleType | null;
  role: 'bus' | 'stream';
  /** Canvas edge placement (D-105). */
  edge?: 'left' | 'right' | 'top' | 'bottom';
  /** Semantic slot (clock_in, schedule_out, …). */
  slot?:
    | 'default'
    | 'clock_in'
    | 'math_dock'
    | 'schedule_out'
    | 'time_bus_out'
    | 'master_out'
    | 'delivery'
    | 'system';
  /** Visual/legal nature family. */
  nature?: 'data' | 'system' | 'fund' | 'time';
  /** Catalog channel id when known. */
  channelId?: string | null;
  /** Operator-facing label override. */
  label?: string | null;
};

/** True when this stream should sit on the parent card bottom (Math Calc-ref dock). */
export function isMathDockStreamPort(port: StreamPortSpec): boolean {
  if (port.slot === 'math_dock') return true;
  return port.role === 'stream' && port.kind === 'data_feed' && port.peerType === 'math';
}

export function isClockInPort(port: StreamPortSpec): boolean {
  return (
    port.slot === 'clock_in' ||
    (port.nature === 'time' && port.direction === 'in' && port.edge === 'bottom')
  );
}

export function isScheduleOutPort(port: StreamPortSpec): boolean {
  return port.slot === 'schedule_out';
}

export function isTimeBusOutPort(port: StreamPortSpec): boolean {
  return port.slot === 'time_bus_out';
}

/**
 * D-088: collapse reciprocal owner↔Math data_feed streams to one Calc-ref pin
 * per Math peer. Keeps the Math→owner direction (canonical tool attachment);
 * drops the owner→Math twin when both exist. Call with inbound+outbound merged.
 */
export function collapseMathCalcRefStreams(
  ports: readonly StreamPortSpec[],
  selfType: ModuleType,
): StreamPortSpec[] {
  if (selfType === 'math') {
    const outPeers = new Set(
      ports
        .filter((p) => p.kind === 'data_feed' && p.role === 'stream' && p.direction === 'out')
        .map((p) => p.peerModuleId),
    );
    return ports.filter((p) => {
      if (p.kind !== 'data_feed' || p.role !== 'stream') return true;
      if (p.direction === 'in' && p.peerModuleId && outPeers.has(p.peerModuleId)) return false;
      return true;
    });
  }

  const mathInPeers = new Set(
    ports
      .filter(
        (p) =>
          p.kind === 'data_feed' &&
          p.role === 'stream' &&
          p.direction === 'in' &&
          p.peerType === 'math',
      )
      .map((p) => p.peerModuleId),
  );
  return ports.filter((p) => {
    if (p.kind !== 'data_feed' || p.role !== 'stream') return true;
    if (
      p.direction === 'out' &&
      p.peerType === 'math' &&
      p.peerModuleId &&
      mathInPeers.has(p.peerModuleId)
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Stable handle id for a bus or per-peer stream port.
 * Bus: `{kind}-{in|out}`; stream: `{kind}-{in|out}__{peerUuid}`.
 */
export function handleIdForStream(
  kind: LinkKind,
  direction: 'in' | 'out',
  peerModuleId?: string | null,
): string {
  const base = handleIdForLink(kind, direction);
  if (peerModuleId == null) return base;
  return `${base}__${peerModuleId}`;
}

/** Parse bus or stream handle ids produced by {@link handleIdForStream}. */
export function parseStreamHandle(
  handle: string,
): { kind: LinkKind; direction: 'in' | 'out'; peerModuleId: string | null } | null {
  const sepIndex = handle.indexOf('__');
  const base = sepIndex >= 0 ? handle.slice(0, sepIndex) : handle;
  const peerModuleId = sepIndex >= 0 ? handle.slice(sepIndex + 2) || null : null;
  const parsed = parseKindHandle(base);
  if (!parsed) return null;
  return { ...parsed, peerModuleId };
}

/**
 * D-077: synthetic stream peer for per-trend directive-out handles.
 * Encoded as `trend:{candidateUuid}` so {@link parseStreamHandle} still works.
 */
export const TREND_CANDIDATE_PEER_PREFIX = 'trend:' as const;

/** Stable handle id for a trend-list row connection output. */
export function handleIdForTrendCandidate(candidateId: string): string {
  return handleIdForStream('directive', 'out', `${TREND_CANDIDATE_PEER_PREFIX}${candidateId}`);
}

/**
 * Extract trend candidate id from a source handle, or null if not a trend-item port.
 */
export function parseTrendCandidateHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const parsed = parseStreamHandle(handle);
  if (!parsed || parsed.kind !== 'directive' || parsed.direction !== 'out') return null;
  const peer = parsed.peerModuleId;
  if (!peer?.startsWith(TREND_CANDIDATE_PEER_PREFIX)) return null;
  const id = peer.slice(TREND_CANDIDATE_PEER_PREFIX.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

/**
 * Inbound/outbound stream ports for a module: one bus per kind, then one stream
 * per existing link peer. Peers sort in pipeline / capital-flow order (D-073),
 * not raw UUID order, so Math and multi-attach stacks stay logical.
 */
export function moduleStreamPorts(input: {
  type: ModuleType;
  moduleId: string;
  links: Array<{
    fromModuleId: string;
    toModuleId: string;
    linkKind: LinkKind;
    fromLabel: string;
    toLabel: string;
    fromType?: ModuleType | undefined;
    toType?: ModuleType | undefined;
  }>;
  /** Optional inspector delivery visibility (D-108). */
  exposedOutputChannels?: readonly string[] | null;
}): { inbound: StreamPortSpec[]; outbound: StreamPortSpec[] } {
  const ports = moduleLinkPorts(input.type);

  const peerSortKey = (
    peerType: ModuleType | undefined,
    peerLabel: string,
    peerId: string,
    kind: LinkKind,
  ): string => {
    if (kind === 'fund_route') {
      const fundBias =
        peerType === 'holding_fund'
          ? 0
          : peerType === 'fund_router'
            ? 1
            : peerType === 'math'
              ? 2
              : 3;
      return `${fundBias}:${peerLabel}:${peerId}`;
    }
    const col = peerType != null ? MODULE_COLUMN[peerType] : 99;
    const row = peerType != null ? MODULE_LANE_ROW[peerType] : 99;
    return `${String(col).padStart(2, '0')}:${String(row).padStart(2, '0')}:${peerLabel}:${peerId}`;
  };

  const buildPorts = (kinds: readonly LinkKind[], direction: 'in' | 'out'): StreamPortSpec[] => {
    const result: StreamPortSpec[] = [];
    for (const kind of kinds) {
      result.push({
        handleId: handleIdForStream(kind, direction),
        kind,
        direction,
        peerModuleId: null,
        peerLabel: null,
        peerType: null,
        role: 'bus',
      });

      type RankedStream = {
        port: StreamPortSpec;
        sortKey: string;
      };
      const streams: RankedStream[] = [];
      for (const link of input.links) {
        if (link.linkKind !== kind) continue;
        if (direction === 'in' && link.toModuleId === input.moduleId) {
          streams.push({
            sortKey: peerSortKey(link.fromType, link.fromLabel, link.fromModuleId, kind),
            port: {
              handleId: handleIdForStream(kind, direction, link.fromModuleId),
              kind,
              direction,
              peerModuleId: link.fromModuleId,
              peerLabel: link.fromLabel,
              peerType: link.fromType ?? null,
              role: 'stream',
            },
          });
        } else if (direction === 'out' && link.fromModuleId === input.moduleId) {
          streams.push({
            sortKey: peerSortKey(link.toType, link.toLabel, link.toModuleId, kind),
            port: {
              handleId: handleIdForStream(kind, direction, link.toModuleId),
              kind,
              direction,
              peerModuleId: link.toModuleId,
              peerLabel: link.toLabel,
              peerType: link.toType ?? null,
              role: 'stream',
            },
          });
        }
      }
      streams.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      result.push(...streams.map((entry) => entry.port));
    }
    return result;
  };

  const inboundRaw = buildPorts(ports.inbound, 'in');
  const outboundRaw = buildPorts(ports.outbound, 'out');
  const collapsed = collapseMathCalcRefStreams([...inboundRaw, ...outboundRaw], input.type);
  const enriched = enrichPortsWithPlacement(
    collapsed,
    input.type,
    input.links,
    input.exposedOutputChannels,
  );
  return {
    inbound: enriched.filter((port) => port.direction === 'in'),
    outbound: enriched.filter((port) => port.direction === 'out'),
  };
}

function defaultEdgeForPort(
  type: ModuleType,
  kind: LinkKind,
  direction: 'in' | 'out',
  slot: PortSlot,
): PortEdge {
  if (slot === 'clock_in' || slot === 'math_dock') return 'bottom';
  if (slot === 'schedule_out') return 'top';
  if (slot === 'time_bus_out') return 'right';
  if (type === 'math') {
    if (kind === 'fund_route') return direction === 'in' ? 'left' : 'right';
    return 'top';
  }
  return direction === 'in' ? 'left' : 'right';
}

function enrichPortsWithPlacement(
  ports: readonly StreamPortSpec[],
  type: ModuleType,
  links: Array<{
    fromModuleId: string;
    toModuleId: string;
    linkKind: LinkKind;
    fromType?: ModuleType | undefined;
    toType?: ModuleType | undefined;
  }>,
  exposedOutputChannels?: readonly string[] | null,
): StreamPortSpec[] {
  const result: StreamPortSpec[] = [];
  const exposed = resolveExposedChannels(type, exposedOutputChannels);

  for (const port of ports) {
    let slot: PortSlot = parsePortSlotPeer(port.peerModuleId) ?? 'default';
    let edge = defaultEdgeForPort(type, port.kind, port.direction, slot);
    let nature: PortNature = natureForLinkKind(port.kind, slot === 'default' ? null : slot);
    let label: string | null = null;

    // Time hub: split generic data_feed-out bus into schedule (top) + time bus (right).
    if (type === 'time' && port.kind === 'data_feed' && port.direction === 'out' && port.role === 'bus') {
      result.push({
        ...port,
        handleId: handleIdForStream('data_feed', 'out', slotPeerId('schedule_out')),
        peerModuleId: slotPeerId('schedule_out'),
        edge: 'top',
        slot: 'schedule_out',
        nature: 'time',
        label: 'Schedule',
        channelId: 'time_schedule',
      });
      result.push({
        ...port,
        handleId: handleIdForStream('data_feed', 'out', slotPeerId('time_bus_out')),
        peerModuleId: slotPeerId('time_bus_out'),
        edge: 'right',
        slot: 'time_bus_out',
        nature: 'time',
        label: 'Time bus',
        channelId: 'time_bus',
      });
      continue;
    }

    // Time → consumer streams: right time bus (not left/right generic).
    if (
      type === 'time' &&
      port.kind === 'data_feed' &&
      port.direction === 'out' &&
      port.role === 'stream'
    ) {
      slot = 'time_bus_out';
      edge = 'right';
      nature = 'time';
      label = 'Time bus';
    }

    // Consumer ← Time streams land on bottom clock_in.
    if (
      CLOCK_IN_MODULE_TYPES.has(type) &&
      port.kind === 'data_feed' &&
      port.direction === 'in' &&
      port.role === 'stream' &&
      port.peerType === 'time'
    ) {
      slot = 'clock_in';
      edge = 'bottom';
      nature = 'time';
      label = 'Clock in';
    }

    if (isMathDockStreamPort({ ...port, slot })) {
      slot = 'math_dock';
      edge = 'bottom';
      nature = 'data';
    }

    // Librarian → library framed as system curation when peer is library.
    if (
      type === 'librarian' &&
      port.kind === 'data_feed' &&
      port.direction === 'out' &&
      port.peerType === 'library'
    ) {
      nature = 'system';
      slot = 'system';
      label = 'Curation';
    }

    result.push({
      ...port,
      edge,
      slot,
      nature,
      label,
    });
  }

  // Additive clock_in bus (never replaces data/system rails).
  if (CLOCK_IN_MODULE_TYPES.has(type) && type !== 'math') {
    const hasClockBus = result.some(
      (p) => p.slot === 'clock_in' && p.role === 'bus' && p.direction === 'in',
    );
    if (!hasClockBus) {
      result.push({
        handleId: handleIdForStream('data_feed', 'in', slotPeerId('clock_in')),
        kind: 'data_feed',
        direction: 'in',
        peerModuleId: slotPeerId('clock_in'),
        peerLabel: null,
        peerType: null,
        role: 'bus',
        edge: 'bottom',
        slot: 'clock_in',
        nature: 'time',
        label: 'Clock in',
        channelId: `${type}_clock`,
      });
    }
  }

  // Time inbound authority stays left.
  if (type === 'time') {
    for (const p of result) {
      if (p.kind === 'data_feed' && p.direction === 'in') {
        p.edge = 'left';
        p.nature = 'time';
        p.label = p.label ?? 'Authority in';
      }
    }
  }

  // Additive typed delivery outs (inspector may hide; never replaces master).
  for (const ch of MODULE_PORT_CHANNELS[type]) {
    if (ch.slot !== 'delivery' || ch.direction !== 'out') continue;
    if (!exposed.has(ch.id)) continue;
    const already = result.some((p) => p.channelId === ch.id);
    if (already) continue;
    result.push({
      handleId: handleIdForStream(ch.linkKind, 'out', slotPeerId('delivery')),
      kind: ch.linkKind,
      direction: 'out',
      peerModuleId: slotPeerId('delivery'),
      peerLabel: null,
      peerType: null,
      role: 'bus',
      edge: ch.edge,
      slot: 'delivery',
      nature: ch.nature,
      label: ch.label,
      channelId: ch.id,
    });
  }

  void links;
  return result;
}

/**
 * Decode a source/target handle pair into a link kind.
 * Accepts bus and per-stream handles (`parseStreamHandle`).
 * Legacy migration pairs map to their canonical kinds; fund-route ambiguity on
 * `data-out` → `data-in` stays `data_feed` here (endpoint-aware UI resolves fund).
 */
export function linkKindForHandlePair(
  sourceHandle?: string | null,
  targetHandle?: string | null,
): LinkKind | null {
  if (!sourceHandle || !targetHandle) return null;

  const source = parseStreamHandle(sourceHandle);
  const target = parseStreamHandle(targetHandle);
  if (source && target) {
    if (source.direction !== 'out' || target.direction !== 'in') return null;
    if (source.kind !== target.kind) return null;
    return source.kind;
  }

  if (sourceHandle === 'data-out' && targetHandle === 'data-in') return 'data_feed';
  if (sourceHandle === 'data-out' && targetHandle === 'control-in') return 'directive';
  if (sourceHandle === 'tools-out' && targetHandle === 'data-in') return 'verification';

  return null;
}

/**
 * Preferred canvas lane per module type (left → right, D-064 / ui-spec §3).
 * Engine chip process stages (2026-07-18): research → data → trend → execution → verification.
 * Funds / clock are vertical bands (see ENGINE_CHIP_ZONE); their MODULE_COLUMN values are for
 * peer-stream ordering only and are excluded from process ranking.
 * Reflow compresses unused process lanes so sparse engines stay compact.
 */
export const MODULE_COLUMN: Record<ModuleType, number> = {
  research: 0,
  librarian: 0,
  library: 1,
  live_api: 1,
  math: 1,
  clock: 1,
  time: 1,
  trend: 2,
  trading: 3,
  simulator: 3,
  generator: 3,
  /** Peer-order only; funds shelf is a vertical band under process. */
  holding_fund: 5,
  fund_router: 6,
  analyzer: 4,
  policy: 4,
  display: 4,
};

/**
 * Engine chip snap zone (layout). Process zones map to compressed columns;
 * funds + clock are placed as vertical bands under the process envelope.
 */
export const EngineChipZone = z.enum([
  'research',
  'data',
  'trend',
  'execution',
  'verification',
  'funds',
  'clock',
]);
export type EngineChipZone = z.infer<typeof EngineChipZone>;

/** Stable process column index before unused-lane compression (research=0 … verification=4). */
export const ENGINE_PROCESS_ZONE_COLUMN: Record<
  Exclude<EngineChipZone, 'funds' | 'clock'>,
  number
> = {
  research: 0,
  data: 1,
  trend: 2,
  execution: 3,
  verification: 4,
};

export const ENGINE_CHIP_ZONE: Record<ModuleType, EngineChipZone> = {
  research: 'research',
  librarian: 'research',
  library: 'data',
  live_api: 'data',
  math: 'data',
  clock: 'clock',
  time: 'clock',
  trend: 'trend',
  trading: 'execution',
  simulator: 'execution',
  generator: 'execution',
  holding_fund: 'funds',
  fund_router: 'funds',
  analyzer: 'verification',
  policy: 'verification',
  display: 'verification',
};

export function isEngineProcessZoneMember(type: ModuleType): boolean {
  const zone = ENGINE_CHIP_ZONE[type];
  return zone !== 'funds' && zone !== 'clock' && type !== 'math';
}

/**
 * Preferred vertical order within a lane (top → bottom) when multiple types share a column.
 * Connection-aware barycenter may still refine row placement.
 * Data zone: libraries on the process line; live_api stacked under as feed rail.
 */
export const MODULE_LANE_ROW: Record<ModuleType, number> = {
  research: 0,
  librarian: 1,
  library: 0,
  live_api: 1,
  math: 0,
  clock: 2,
  time: 3,
  trend: 0,
  holding_fund: 0,
  trading: 0,
  simulator: 1,
  generator: 2,
  fund_router: 1,
  analyzer: 0,
  policy: 1,
  display: 2,
};

export const CanvasPosition = z.object({ x: z.number(), y: z.number() });
export type CanvasPosition = z.infer<typeof CanvasPosition>;

// ── Common inline setup + validation ────────────────────────────────────────

export const ModuleSetupField = z.enum(['capital_allocation', 'topic_sector', 'target_exit']);
export type ModuleSetupField = z.infer<typeof ModuleSetupField>;

export const CAPITAL_BEARING_MODULE_TYPES: ReadonlySet<ModuleType> = new Set([
  'trading',
  'holding_fund',
  'fund_router',
]);

const TOPIC_SCOPED_MODULE_TYPES: ReadonlySet<ModuleType> = new Set([
  'research',
  'librarian',
  'library',
  'live_api',
  'trend',
  'trading',
  'simulator',
  'analyzer',
]);

export function requiredModuleSetupFields(type: ModuleType): readonly ModuleSetupField[] {
  const fields: ModuleSetupField[] = [];
  if (CAPITAL_BEARING_MODULE_TYPES.has(type)) fields.push('capital_allocation', 'target_exit');
  if (TOPIC_SCOPED_MODULE_TYPES.has(type)) fields.push('topic_sector');
  return fields;
}

const AmountDecimalInput = z
  .string()
  .trim()
  .regex(/^\d{1,12}(?:\.\d{1,2})?$/);
const PercentageDecimalInput = z
  .string()
  .trim()
  .regex(/^\d{1,3}(?:\.\d{1,4})?$/)
  .refine((value) => {
    const [whole = '0', fraction = ''] = value.split('.');
    const wholeInt = BigInt(whole);
    return wholeInt < 100n || (wholeInt === 100n && /^0*$/.test(fraction));
  }, 'Percentage must be between 0 and 100');

export const CapitalAllocationInput = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('amount'), value: AmountDecimalInput }),
  z.object({ mode: z.literal('percentage'), value: PercentageDecimalInput }),
]);
export type CapitalAllocationInput = z.infer<typeof CapitalAllocationInput>;

/** Raw operator input; API converts financial/time fields to append-only ValueRefs. */
export const ModuleSetupInput = z.object({
  topicSectors: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  capitalAllocation: CapitalAllocationInput.optional(),
  targetExitAt: z.string().datetime({ offset: true }).optional(),
  timezone: z.string().min(1).max(100).optional(),
});
export type ModuleSetupInput = z.infer<typeof ModuleSetupInput>;

export interface ModuleSetupState {
  topicSectors: readonly string[];
  capitalAllocationRef: string | null;
  targetExitRef: string | null;
}

export function missingModuleSetupFields(
  type: ModuleType,
  state: ModuleSetupState,
): ModuleSetupField[] {
  return requiredModuleSetupFields(type).filter((field) => {
    switch (field) {
      case 'capital_allocation':
        return !state.capitalAllocationRef;
      case 'topic_sector':
        return state.topicSectors.length === 0;
      case 'target_exit':
        return !state.targetExitRef;
      default: {
        const _exhaustive: never = field;
        return _exhaustive;
      }
    }
  });
}

// ── Per-type config schemas (jsonb `modules.config`) ────────────────────────

export const ResearchModuleConfig = z.object({
  topicScope: z.string().min(1),
  /** D-042: curator specialization. */
  researchSubtype: ResearchSubtype.default('external_web'),
  curiosity: z.enum(['conservative', 'balanced', 'exploratory']).default('balanced'),
  cadenceMinutes: z.number().int().min(30).max(1440).default(180),
  targetLibraryIds: z.array(z.string().uuid()).default([]),
  sourceAllowlist: z.array(z.string()).default([]),
  sourceBlocklist: z.array(z.string()).default([]),
  /** D-039: default auto-admit after model-free validation; operator may require approval. */
  admissionMode: z
    .enum(['auto_admit_validated', 'require_operator_approval'])
    .default('auto_admit_validated'),
  /** When true, operator owns deeper lever picks; LLM still constrained to envelopes. */
  manualControl: z.boolean().default(false),
});

export const LibrarianModuleConfig = z.object({
  topicScope: z.string().min(1),
  librarianSubtype: LibrarianSubtype.default('librarian_relevance'),
  cadenceMinutes: z.number().int().min(30).max(1440).default(360),
  targetLibraryIds: z.array(z.string().uuid()).default([]),
  /** Relative weights inside envelope — LLM/user picks; never raw scores as authority. */
  relevanceWeights: z
    .object({
      topical: z.number().min(0).max(1).default(0.4),
      freshness: z.number().min(0).max(1).default(0.3),
      evidenceFit: z.number().min(0).max(1).default(0.3),
    })
    .default({ topical: 0.4, freshness: 0.3, evidenceFit: 0.3 }),
  seedProtect: z.boolean().default(false),
  manualControl: z.boolean().default(false),
});

export const LibraryModuleConfig = z.object({
  topicScope: z.string().min(1),
  masterLibrary: z.boolean().default(false),
  /** D-042: library content class. */
  libraryClass: LibraryClass.default('topic_runtime'),
});

export const LiveApiModuleConfig = z.object({
  venue: z.enum(['alpaca', 'kalshi', 'polymarket', 'coinbase', 'paper_sim']),
  instruments: z.array(z.string().min(1)).max(50),
  feedClass: z.string().default('iex_free'),
  pollSeconds: z.number().int().min(5).max(3600).default(60),
});

export const TrendPosture = z.enum([
  'session_intraday',
  'crypto_cross_cap',
  'event_probability',
  'position_horizon',
  'microstructure_swarm',
  'research_only',
]);
export type TrendPosture = z.infer<typeof TrendPosture>;

export const TrendModuleConfig = z.object({
  focus: z.string().min(1),
  trendPosture: TrendPosture.default('session_intraday'),
  maxActiveTrends: z.number().int().min(1).max(50).default(10),
  cadenceMinutes: z.number().int().min(5).max(1440).default(30),
  manualControl: z.boolean().default(false),
});

export const TradingModuleConfig = z.object({
  subtype: TradingSubtype,
  strategyFamilies: z.array(z.string()).default([]),
  exitTimelineDays: z.number().int().min(0).max(3650).default(1),
  cadenceMinutes: z.number().int().min(1).max(60).default(5),
  manualControl: z.boolean().default(false),
});

export const PolicyModuleConfig = z.object({
  policyEnvelopeRef: z.string().default('paper_balanced_general_v1'),
  notes: z.string().default(''),
});

export const DisplayKind = z.enum(['table', 'list', 'ledger', 'chart', 'graph']);
export type DisplayKind = z.infer<typeof DisplayKind>;

export const DisplayModuleConfig = z.object({
  displayKind: DisplayKind.default('table'),
  title: z.string().min(1).max(80).default('Display'),
  sourceModuleIds: z.array(z.string().uuid()).default([]),
});
export type DisplayModuleConfig = z.infer<typeof DisplayModuleConfig>;

function normalizeNeighborLabels(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const label of labels) {
    const trimmed = label.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized.sort((a, b) => a.localeCompare(b));
}

function capNeighborLabels(labels: readonly string[], cap: number): string[] {
  if (labels.length <= cap) return [...labels];
  const kept = labels.slice(0, cap);
  const overflow = labels.length - cap;
  return [...kept, `+${overflow}`];
}

/**
 * Short function lexicon for canvas identity (compact labels).
 * Prefer type + subtype/kind over long prose bases so duplicate ModuleTypes
 * in one ENGINE remain visually and semantically distinct (dev-notebook).
 */
export function moduleFunctionLabel(type: ModuleType, config?: unknown): string {
  const cfg =
    config && typeof config === 'object' && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};

  switch (type) {
    case 'research': {
      const subtype = ResearchSubtype.safeParse(cfg.researchSubtype);
      if (!subtype.success) return 'WebResearch';
      switch (subtype.data) {
        case 'external_web':
          return 'WebResearch';
        case 'external_filings':
          return 'Filings';
        case 'external_market_news':
          return 'MktNews';
        case 'specialty_desk':
          return 'DeskResearch';
        case 'event_catalyst':
          return 'Catalyst';
        case 'crypto_onchain_context':
          return 'CryptoCtx';
        case 'prediction_niche':
          return 'PredNiche';
      }
    }
    case 'librarian': {
      const subtype = LibrarianSubtype.safeParse(cfg.librarianSubtype);
      if (!subtype.success) return 'Librarian';
      switch (subtype.data) {
        case 'librarian_relevance':
          return 'Librarian';
        case 'librarian_seed_keeper':
          return 'SeedKeeper';
      }
    }
    case 'library': {
      const klass = LibraryClass.safeParse(cfg.libraryClass);
      if (!klass.success) return 'TopicLib';
      switch (klass.data) {
        case 'seeded_mechanisms':
          return 'SeedLib';
        case 'topic_runtime':
          return 'TopicLib';
        case 'market_history':
          return 'MktHist';
        case 'runtime_market_cache':
          return 'MktCache';
        case 'runtime_app_logs':
          return 'AppLogs';
        case 'specialty_evidence':
          return 'SpecLib';
        case 'master_graph':
          return 'MasterLib';
      }
    }
    case 'live_api': {
      const venue = LiveApiModuleConfig.shape.venue.safeParse(cfg.venue);
      if (!venue.success) return 'LiveAPI';
      switch (venue.data) {
        case 'paper_sim':
          return 'PaperFeed';
        case 'alpaca':
          return 'AlpacaFeed';
        case 'kalshi':
          return 'KalshiFeed';
        case 'polymarket':
          return 'PolyFeed';
        case 'coinbase':
          return 'CoinbaseFeed';
      }
    }
    case 'trend': {
      const posture = TrendPosture.safeParse(cfg.trendPosture);
      if (!posture.success) return 'Trend';
      switch (posture.data) {
        case 'session_intraday':
          return 'IntradayTrend';
        case 'crypto_cross_cap':
          return 'CryptoTrend';
        case 'event_probability':
          return 'EventTrend';
        case 'position_horizon':
          return 'HorizonTrend';
        case 'microstructure_swarm':
          return 'MicroTrend';
        case 'research_only':
          return 'ResearchTrend';
      }
    }
    case 'trading': {
      const subtype = TradingSubtype.safeParse(cfg.subtype);
      if (!subtype.success) return 'Trade';
      switch (subtype.data) {
        case 'day':
          return 'DayTrade';
        case 'long_term':
          return 'Swing';
        case 'crypto':
          return 'Crypto';
        case 'prediction':
          return 'Pred';
        case 'hft':
          return 'HFT';
        case 'custom':
          return 'Trade';
      }
    }
    case 'policy':
      return 'Policy';
    case 'generator':
      return 'Gen';
    case 'simulator':
      return 'Sim';
    case 'analyzer': {
      const mode = AnalyzerEmitMode.safeParse(cfg.emitMode);
      if (!mode.success) return 'ExecMon';
      switch (mode.data) {
        case 'verify_loopback':
          return 'ExecMon';
        case 'to_desk_stream':
          return 'Concat';
        case 'to_library':
          return 'LibEmit';
      }
    }
    case 'holding_fund':
      return 'Fund';
    case 'fund_router':
      return 'Router';
    case 'math': {
      const mathType = MathType.safeParse(cfg.mathType);
      if (!mathType.success) return 'Math';
      switch (mathType.data) {
        case 'company_hub':
          return 'Math';
        case 'fund_path':
          return 'FundMath';
        case 'desk_execution':
          return 'DeskMath';
        case 'trend_signal':
          return 'TrendMath';
        case 'research_metric':
          return 'ResearchMath';
        case 'analyzer_reconcile':
          return 'ReconcileMath';
        case 'simulator_sandbox':
          return 'SimMath';
        case 'session_calendar':
          return 'SessionMath';
      }
    }
    case 'clock':
      return 'Clock';
    case 'time': {
      const transform = TimeTransform.safeParse(cfg.transform);
      if (!transform.success) return 'Time';
      switch (transform.data) {
        case 'elapsed':
          return 'Elapsed';
        case 'add_duration':
          return 'AddDuration';
        case 'timezone_convert':
          return 'TzConvert';
        case 'session_window':
          return 'Session';
        case 'schedule_ref':
          return 'Schedule';
      }
    }
    case 'display': {
      const kind = DisplayKind.safeParse(cfg.displayKind);
      if (!kind.success) return 'Display';
      switch (kind.data) {
        case 'table':
          return 'Table';
        case 'list':
          return 'List';
        case 'ledger':
          return 'Ledger';
        case 'chart':
          return 'Chart';
        case 'graph':
          return 'Graph';
      }
    }
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Compact focus token from topic/sector (preferred) or optional capital display.
 * Long topics collapse to the first word / slug within FOCUS_TOKEN_MAX_LENGTH.
 */
export function moduleFocusToken(input: {
  topicSectors?: readonly string[] | null | undefined;
  capitalAllocationDisplay?: string | null | undefined;
}): string {
  const topics = (input.topicSectors ?? []).map((t) => t.trim()).filter((t) => t.length > 0);
  if (topics.length > 0) {
    const first = topics[0]!;
    if (first.length <= FOCUS_TOKEN_MAX_LENGTH) return first;
    const word = first.split(/[\s,/|]+/).find((part) => part.length > 0) ?? first;
    if (word.length <= FOCUS_TOKEN_MAX_LENGTH) return word;
    return `${word.slice(0, FOCUS_TOKEN_MAX_LENGTH - 1)}…`;
  }

  const capital = input.capitalAllocationDisplay?.trim();
  if (capital) {
    return capital.length <= FOCUS_TOKEN_MAX_LENGTH
      ? capital
      : `${capital.slice(0, FOCUS_TOKEN_MAX_LENGTH - 1)}…`;
  }

  return MODULE_FOCUS_UNSET;
}

/** Primary identity line: `{Fn} · {Focus}`. */
export function composeModulePrimaryLabel(fn: string, focus: string): string {
  const safeFn = fn.trim() || 'Node';
  const safeFocus = focus.trim() || MODULE_FOCUS_UNSET;
  return `${safeFn} · ${safeFocus}`;
}

/**
 * Compact connection refs from neighbor function labels (never full display names).
 * Caps at 2 inbound + 2 outbound with `+N` overflow.
 */
export function composeConnectionRefs(
  inboundLabels: readonly string[],
  outboundLabels: readonly string[],
): string | null {
  const inbound = capNeighborLabels(normalizeNeighborLabels(inboundLabels), CONNECTION_REF_CAP);
  const outbound = capNeighborLabels(normalizeNeighborLabels(outboundLabels), CONNECTION_REF_CAP);
  if (inbound.length === 0 && outbound.length === 0) return null;

  let refs = '';
  if (inbound.length > 0) refs += `← ${inbound.join(' · ')}`;
  if (outbound.length > 0) {
    if (refs) refs += ' ';
    refs += `→ ${outbound.join(' · ')}`;
  }
  return refs;
}

/**
 * Split a persisted compact name into primary identity and optional connection refs.
 * Secondary starts at the first ` ← ` or ` → ` marker.
 */
export function splitCompactModuleName(name: string): {
  primary: string;
  connectionRefs: string | null;
} {
  const trimmed = name.trim();
  const arrowIn = trimmed.indexOf(' ← ');
  const arrowOut = trimmed.indexOf(' → ');
  let splitAt = -1;
  if (arrowIn >= 0 && arrowOut >= 0) splitAt = Math.min(arrowIn, arrowOut);
  else if (arrowIn >= 0) splitAt = arrowIn;
  else if (arrowOut >= 0) splitAt = arrowOut;

  if (splitAt < 0) {
    return { primary: trimmed, connectionRefs: null };
  }

  const primary = trimmed.slice(0, splitAt).trimEnd();
  const connectionRefs = trimmed.slice(splitAt + 1).trim();
  return {
    primary: primary || trimmed,
    connectionRefs: connectionRefs || null,
  };
}

function truncatePreferringRefs(primary: string, refs: string | null): string {
  if (!refs) {
    if (primary.length <= GENERATED_MODULE_NAME_MAX_LENGTH) return primary;
    return `${primary.slice(0, GENERATED_MODULE_NAME_MAX_LENGTH - 1).trimEnd()}…`;
  }

  const full = `${primary} ${refs}`;
  if (full.length <= GENERATED_MODULE_NAME_MAX_LENGTH) return full;

  // Drop refs before slicing the primary identity.
  if (primary.length <= GENERATED_MODULE_NAME_MAX_LENGTH) return primary;
  return `${primary.slice(0, GENERATED_MODULE_NAME_MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * D-091: human shelf name for module-owned libraries from topic + inbound sources.
 * Example: `Semiconductors · Research + Alpaca`
 */
export function deriveLibraryDisplayName(input: {
  topicScope?: string | null;
  topicSectors?: readonly string[] | null;
  /** Sorted unique human labels for upstream sources (Research, Alpaca, …). */
  sourceLabels?: readonly string[] | null;
}): string {
  const topic =
    input.topicSectors?.find((t) => t.trim() && t !== 'pending_operator_scope')?.trim() ||
    (input.topicScope && input.topicScope !== 'pending_operator_scope'
      ? input.topicScope.trim()
      : '') ||
    'Runtime library';
  const sources = [...new Set((input.sourceLabels ?? []).map((s) => s.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
  if (sources.length === 0) return topic.slice(0, 120);
  const combined = `${topic} · ${sources.join(' + ')}`;
  return combined.slice(0, 120);
}

/**
 * Derive a compact display name: `{Fn} · {Focus}` plus optional `←`/`→` neighbor Fn refs.
 * Math stays primary-only (no connection suffix).
 */
export function deriveGeneratedModuleName(input: {
  type: ModuleType;
  /** Preferred short Fn; falls back to `moduleFunctionLabel(type, config)`. */
  baseName?: string;
  config?: unknown;
  topicSectors?: readonly string[] | null;
  capitalAllocationDisplay?: string | null;
  /** Neighbor short function labels (not full generated names). */
  inboundLabels?: readonly string[];
  outboundLabels?: readonly string[];
  /** @deprecated Prefer inboundLabels — treated as labels when inboundLabels omitted. */
  inboundNames?: readonly string[];
  /** @deprecated Prefer outboundLabels — treated as labels when outboundLabels omitted. */
  outboundNames?: readonly string[];
}): string {
  const fn = input.baseName?.trim() || moduleFunctionLabel(input.type, input.config);
  const focus = moduleFocusToken({
    topicSectors: input.topicSectors,
    capitalAllocationDisplay: input.capitalAllocationDisplay,
  });
  const primary = composeModulePrimaryLabel(fn, focus);

  if (input.type === 'math') return primary;

  const inbound = input.inboundLabels ?? input.inboundNames ?? [];
  const outbound = input.outboundLabels ?? input.outboundNames ?? [];
  const refs = composeConnectionRefs(inbound, outbound);
  return truncatePreferringRefs(primary, refs);
}

export const HoldingFundModuleConfig = z.object({
  source: z.enum(['company_seed', 'company_pool', 'reserve', 'broker_balance']),
  allocationPolicyRef: z.string().default('paper_balanced_general_v1'),
});

export const FundRouterModuleConfig = z.object({
  policyEnvelopeRef: z.string().default('paper_balanced_general_v1'),
  approvalMode: z.enum(['manual', 'policy']).default('manual'),
  targetModuleIds: z.array(z.string().uuid()).default([]),
});

export const GenericModuleConfig = z.object({}).passthrough();

export const MathModuleConfig = z.object({
  mathType: MathType.default('company_hub'),
});
export type MathModuleConfig = z.infer<typeof MathModuleConfig>;

/** D-088: Master Clock display/orientation (now still from injectable engine clock). */
export const ClockModuleConfig = z.object({
  timezone: z.string().min(1).max(64).default('America/New_York'),
  displayMode: z.enum(['wall', 'session']).default('session'),
});
export type ClockModuleConfig = z.infer<typeof ClockModuleConfig>;

/** D-088: Time processor transform (operator-editable; models nominate op/bands only). */
export const TimeTransform = z.enum([
  'elapsed',
  'add_duration',
  'timezone_convert',
  'session_window',
  'schedule_ref',
]);
export type TimeTransform = z.infer<typeof TimeTransform>;

export const TimeModuleConfig = z.object({
  transform: TimeTransform.default('session_window'),
  /** IANA zone for timezone_convert / display; not an authoritative LLM datetime. */
  timezone: z.string().min(1).max(64).optional(),
  /** Bounded descriptor for operator preview (no raw LLM datetimes). */
  descriptor: z.string().max(120).optional(),
});
export type TimeModuleConfig = z.infer<typeof TimeModuleConfig>;

/** D-091: flexible analyzer emit modes (research terminal + verify). */
export const AnalyzerEmitMode = z.enum([
  'to_library',
  'to_desk_stream',
  'verify_loopback',
]);
export type AnalyzerEmitMode = z.infer<typeof AnalyzerEmitMode>;

export const AnalyzerModuleConfig = z.object({
  /** Where concatenated inbound packages go (model-free merge). */
  emitMode: AnalyzerEmitMode.default('verify_loopback'),
  /** Optional human descriptor for engine data_out stream (no raw numbers). */
  streamDescriptor: z.string().max(200).optional(),
  /** When to_library: prefer this library module id if set. */
  targetLibraryModuleId: z.string().uuid().optional(),
  /** Unlocked delivery channel ids visible on the canvas (D-108). */
  exposedOutputChannels: z.array(z.string().min(1).max(64)).max(32).optional(),
});
export type AnalyzerModuleConfig = z.infer<typeof AnalyzerModuleConfig>;

export const MODULE_CONFIG_SCHEMAS: Record<ModuleType, z.ZodTypeAny> = {
  research: ResearchModuleConfig,
  librarian: LibrarianModuleConfig,
  library: LibraryModuleConfig,
  live_api: LiveApiModuleConfig,
  trend: TrendModuleConfig,
  trading: TradingModuleConfig,
  policy: PolicyModuleConfig,
  generator: GenericModuleConfig,
  simulator: GenericModuleConfig,
  analyzer: AnalyzerModuleConfig,
  holding_fund: HoldingFundModuleConfig,
  fund_router: FundRouterModuleConfig,
  math: MathModuleConfig,
  display: DisplayModuleConfig,
  clock: ClockModuleConfig,
  time: TimeModuleConfig,
};

// ── API payloads ─────────────────────────────────────────────────────────────

/** Extra standalone modules added during company creation. */
export const CreateCompanyExtraModule = z.object({
  type: ModuleType,
  name: z.string().min(1).max(80),
  config: z.unknown().optional(),
  setup: ModuleSetupInput.optional(),
  canvasPosition: CanvasPosition.optional(),
});
export type CreateCompanyExtraModule = z.infer<typeof CreateCompanyExtraModule>;

/**
 * ENGINE seed at company creation (D-043): at least one required.
 * Same shape as module-store insert (template inputs + shared setup).
 */
export const CreateCompanyEngine = z.object({
  templateId: z.string().min(1).max(80),
  inputs: z.record(z.string(), z.string()).default({}),
  setup: ModuleSetupInput.optional(),
  canvasOffset: CanvasPosition.optional(),
});
export type CreateCompanyEngine = z.infer<typeof CreateCompanyEngine>;

/** @deprecated Use CreateCompanyEngine — kept as alias for transitional imports. */
export const CreateCompanyExtraEngine = CreateCompanyEngine;
export type CreateCompanyExtraEngine = CreateCompanyEngine;

export const CreateCompanyInput = z.object({
  name: z.string().min(1).max(80),
  philosophyPrompt: z.string().min(1).max(4000),
  mode: TradingMode.default('paper'),
  seedCreditsCents: z.number().int().min(0).max(100_000_000_00).default(0),
  /**
   * Active refined specifics (D-106). Create UI selects broad groups and expands
   * to all presets in those groups by default; drawer may narrow later.
   */
  sectorFocuses: CompanySectorFocuses,
  /**
   * Optional symbol carve-outs (D-106). Separate from sector focuses — further
   * shapes the company universe after group/specific selection.
   */
  universeExcludes: CompanyUniverseExcludes.optional(),
  /**
   * Required ENGINE seeds (min 1). Sole graph seed path — company Math hub
   * is always auto-provisioned; standalone extras are optional.
   */
  engines: z.array(CreateCompanyEngine).min(1, 'at least one engine required').max(10),
  /** Optional standalone modules outside engines. */
  extraModules: z.array(CreateCompanyExtraModule).max(40).optional(),
});
export type CreateCompanyInput = z.infer<typeof CreateCompanyInput>;

// PhilosophyProfile imported lazily via index re-export consumers; keep shape
// inline here to avoid circular imports with philosophy.ts → pipeline.
export const UpdateCompanyInput = z.object({
  name: z.string().min(1).max(80).optional(),
  philosophyPrompt: z.string().min(1).max(4000).optional(),
  /** Company-wide sector focuses — re-seeds Baseline → Sector knowledge on change. */
  sectorFocuses: CompanySectorFocuses.optional(),
  /** Operator-curated symbol excludes (D-106); does not re-seed sector knowledge. */
  universeExcludes: CompanyUniverseExcludes.optional(),
  /** Structured slideable philosophy axes (see philosophy.ts). */
  philosophyProfile: z
    .object({
      version: z.literal(1),
      axes: z.record(z.string(), z.enum(['min', 'typical', 'max'])),
    })
    .optional(),
});
export type UpdateCompanyInput = z.infer<typeof UpdateCompanyInput>;

export const CreateModuleInput = z.object({
  type: ModuleType,
  name: z.string().min(1).max(80),
  generatedNameBase: z.string().min(1).max(80).optional(),
  config: z.unknown(),
  canvasPosition: CanvasPosition.optional(),
  setup: ModuleSetupInput.optional(),
  /** Optional ENGINE membership at create (batch engine insert sets this). */
  engineInstanceId: z.string().uuid().nullable().optional(),
});
export type CreateModuleInput = z.infer<typeof CreateModuleInput>;

export const UpdateModuleInput = z.object({
  name: z.string().min(1).max(80).optional(),
  restoreGeneratedName: z.boolean().optional(),
  /** Restore this module's topic/sector from its ENGINE master (clears override). */
  restoreEngineTopic: z.boolean().optional(),
  config: z.unknown().optional(),
  status: ModuleStatus.optional(),
  canvasPosition: CanvasPosition.optional(),
  setup: ModuleSetupInput.optional(),
  engineInstanceId: z.string().uuid().nullable().optional(),
});
export type UpdateModuleInput = z.infer<typeof UpdateModuleInput>;

export const CreateLinkInput = z.object({
  fromModuleId: z.string().uuid(),
  toModuleId: z.string().uuid(),
  linkKind: LinkKind,
  /** Optional canvas handles for D-108 slot validation (schedule/time_bus → clock_in). */
  sourceHandle: z.string().min(1).max(200).optional(),
  targetHandle: z.string().min(1).max(200).optional(),
});
export type CreateLinkInput = z.infer<typeof CreateLinkInput>;
