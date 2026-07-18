import { z } from 'zod';
import type { LinkKind, ModuleType } from './modules';

/**
 * Canvas port channel catalog + placement slots (D-105).
 * Clock / schedule / time-bus ports are additive — they never replace data/system rails.
 */

export const PortNature = z.enum(['data', 'system', 'fund', 'time']);
export type PortNature = z.infer<typeof PortNature>;

export const PortEdge = z.enum(['left', 'right', 'top', 'bottom']);
export type PortEdge = z.infer<typeof PortEdge>;

export const PortSlot = z.enum([
  'default',
  'clock_in',
  'math_dock',
  'schedule_out',
  'time_bus_out',
  'master_out',
  'delivery',
  'system',
]);
export type PortSlot = z.infer<typeof PortSlot>;

/** Peer-id encoding for slot-specific bus handles (parseStreamHandle-compatible). */
export const PORT_SLOT_PEER_PREFIX = 'slot:' as const;

export function slotPeerId(slot: PortSlot): string {
  return `${PORT_SLOT_PEER_PREFIX}${slot}`;
}

export function parsePortSlotPeer(peerModuleId: string | null | undefined): PortSlot | null {
  if (!peerModuleId?.startsWith(PORT_SLOT_PEER_PREFIX)) return null;
  const raw = peerModuleId.slice(PORT_SLOT_PEER_PREFIX.length);
  const parsed = PortSlot.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Modules that expose bottom-left clock_in (time-bearing + curated/trigger targets). */
export const CLOCK_IN_MODULE_TYPES: ReadonlySet<ModuleType> = new Set([
  'trading',
  'trend',
  'policy',
  'analyzer',
  'research',
  'librarian',
  'library',
  'display',
]);

export function moduleHasClockIn(type: ModuleType): boolean {
  return CLOCK_IN_MODULE_TYPES.has(type);
}

export type PortChannelDef = {
  id: string;
  nature: PortNature;
  linkKind: LinkKind;
  direction: 'in' | 'out';
  edge: PortEdge;
  slot: PortSlot;
  label: string;
  /** When false, inspector may hide (delivery only). */
  defaultExposed: boolean;
  /** Locked — inspector cannot hide. */
  locked: boolean;
};

/**
 * Canonical channels per module type. Clock channels are extra rows, not substitutes.
 * Delivery channels may be toggled via modules.config.exposedOutputChannels.
 */
export const MODULE_PORT_CHANNELS: Record<ModuleType, readonly PortChannelDef[]> = {
  research: [
    { id: 'research_sources', nature: 'data', linkKind: 'data_feed', direction: 'in', edge: 'left', slot: 'default', label: 'Sources', defaultExposed: true, locked: true },
    { id: 'research_findings', nature: 'data', linkKind: 'data_feed', direction: 'out', edge: 'right', slot: 'master_out', label: 'Findings', defaultExposed: true, locked: true },
    { id: 'research_clock', nature: 'time', linkKind: 'data_feed', direction: 'in', edge: 'bottom', slot: 'clock_in', label: 'Clock in', defaultExposed: true, locked: true },
  ],
  librarian: [
    { id: 'librarian_ingest', nature: 'data', linkKind: 'data_feed', direction: 'in', edge: 'left', slot: 'default', label: 'Ingest', defaultExposed: true, locked: true },
    { id: 'librarian_evidence', nature: 'data', linkKind: 'data_feed', direction: 'out', edge: 'right', slot: 'master_out', label: 'Evidence', defaultExposed: true, locked: true },
    { id: 'librarian_curation', nature: 'system', linkKind: 'data_feed', direction: 'out', edge: 'right', slot: 'system', label: 'Curation', defaultExposed: true, locked: true },
    { id: 'librarian_clock', nature: 'time', linkKind: 'data_feed', direction: 'in', edge: 'bottom', slot: 'clock_in', label: 'Clock in', defaultExposed: true, locked: true },
  ],
  library: [
    { id: 'library_corpus_in', nature: 'data', linkKind: 'data_feed', direction: 'in', edge: 'left', slot: 'default', label: 'Corpus in', defaultExposed: true, locked: true },
    { id: 'library_corpus_out', nature: 'data', linkKind: 'data_feed', direction: 'out', edge: 'right', slot: 'master_out', label: 'Corpus out', defaultExposed: true, locked: true },
    { id: 'library_clock', nature: 'time', linkKind: 'data_feed', direction: 'in', edge: 'bottom', slot: 'clock_in', label: 'Clock in', defaultExposed: true, locked: true },
  ],
  live_api: [
    { id: 'live_market', nature: 'data', linkKind: 'data_feed', direction: 'out', edge: 'right', slot: 'master_out', label: 'Market feed', defaultExposed: true, locked: true },
  ],
  trend: [
    { id: 'trend_inputs', nature: 'data', linkKind: 'data_feed', direction: 'in', edge: 'left', slot: 'default', label: 'Inputs', defaultExposed: true, locked: true },
    { id: 'trend_signals', nature: 'data', linkKind: 'data_feed', direction: 'out', edge: 'right', slot: 'master_out', label: 'Signals', defaultExposed: true, locked: true },
    { id: 'trend_directive_in', nature: 'system', linkKind: 'directive', direction: 'in', edge: 'left', slot: 'system', label: 'Directive in', defaultExposed: true, locked: true },
    { id: 'trend_directive_out', nature: 'system', linkKind: 'directive', direction: 'out', edge: 'right', slot: 'system', label: 'Trade directive', defaultExposed: true, locked: true },
    { id: 'trend_clock', nature: 'time', linkKind: 'data_feed', direction: 'in', edge: 'bottom', slot: 'clock_in', label: 'Clock in', defaultExposed: true, locked: true },
  ],
  trading: [
    { id: 'trading_desk_data', nature: 'data', linkKind: 'data_feed', direction: 'in', edge: 'left', slot: 'default', label: 'Desk data', defaultExposed: true, locked: true },
    { id: 'trading_trade_data', nature: 'data', linkKind: 'data_feed', direction: 'out', edge: 'right', slot: 'master_out', label: 'Trade data', defaultExposed: true, locked: true },
    { id: 'trading_order', nature: 'system', linkKind: 'directive', direction: 'in', edge: 'left', slot: 'system', label: 'Execution order', defaultExposed: true, locked: true },
    { id: 'trading_directive_out', nature: 'system', linkKind: 'directive', direction: 'out', edge: 'right', slot: 'system', label: 'Directive out', defaultExposed: true, locked: true },
    { id: 'trading_verify', nature: 'system', linkKind: 'verification', direction: 'out', edge: 'right', slot: 'system', label: 'Verify', defaultExposed: true, locked: true },
    { id: 'trading_clock', nature: 'time', linkKind: 'data_feed', direction: 'in', edge: 'bottom', slot: 'clock_in', label: 'Clock in', defaultExposed: true, locked: true },
  ],
  analyzer: [
    { id: 'analyzer_observe', nature: 'data', linkKind: 'data_feed', direction: 'in', edge: 'left', slot: 'default', label: 'Observe', defaultExposed: true, locked: true },
    { id: 'analyzer_analysis', nature: 'data', linkKind: 'data_feed', direction: 'out', edge: 'right', slot: 'master_out', label: 'Analysis', defaultExposed: true, locked: true },
    { id: 'analyzer_concat', nature: 'data', linkKind: 'data_feed', direction: 'out', edge: 'right', slot: 'delivery', label: 'Concat', defaultExposed: true, locked: false },
    { id: 'analyzer_verify_in', nature: 'system', linkKind: 'verification', direction: 'in', edge: 'left', slot: 'system', label: 'Verify in', defaultExposed: true, locked: true },
    { id: 'analyzer_verify_out', nature: 'system', linkKind: 'verification', direction: 'out', edge: 'right', slot: 'system', label: 'Verify out', defaultExposed: true, locked: true },
    { id: 'analyzer_clock', nature: 'time', linkKind: 'data_feed', direction: 'in', edge: 'bottom', slot: 'clock_in', label: 'Clock in', defaultExposed: true, locked: true },
  ],
  policy: [
    { id: 'policy_check', nature: 'system', linkKind: 'verification', direction: 'in', edge: 'left', slot: 'system', label: 'Policy check', defaultExposed: true, locked: true },
    { id: 'policy_directive', nature: 'system', linkKind: 'directive', direction: 'out', edge: 'right', slot: 'system', label: 'Policy directive', defaultExposed: true, locked: true },
    { id: 'policy_clock', nature: 'time', linkKind: 'data_feed', direction: 'in', edge: 'bottom', slot: 'clock_in', label: 'Clock in', defaultExposed: true, locked: true },
  ],
  holding_fund: [
    { id: 'fund_capital_in', nature: 'fund', linkKind: 'fund_route', direction: 'in', edge: 'left', slot: 'default', label: 'Capital in', defaultExposed: true, locked: true },
    { id: 'fund_capital_out', nature: 'fund', linkKind: 'fund_route', direction: 'out', edge: 'right', slot: 'default', label: 'Capital out', defaultExposed: true, locked: true },
  ],
  fund_router: [
    { id: 'router_in', nature: 'fund', linkKind: 'fund_route', direction: 'in', edge: 'left', slot: 'default', label: 'Route in', defaultExposed: true, locked: true },
    { id: 'router_out', nature: 'fund', linkKind: 'fund_route', direction: 'out', edge: 'right', slot: 'default', label: 'Route out', defaultExposed: true, locked: true },
  ],
  math: [
    { id: 'math_calc', nature: 'data', linkKind: 'data_feed', direction: 'in', edge: 'top', slot: 'default', label: 'Calc ref', defaultExposed: true, locked: true },
    { id: 'math_calc_out', nature: 'data', linkKind: 'data_feed', direction: 'out', edge: 'top', slot: 'default', label: 'Calc ref', defaultExposed: true, locked: true },
    { id: 'math_fund_in', nature: 'fund', linkKind: 'fund_route', direction: 'in', edge: 'left', slot: 'default', label: 'Fund in', defaultExposed: true, locked: true },
    { id: 'math_fund_out', nature: 'fund', linkKind: 'fund_route', direction: 'out', edge: 'right', slot: 'default', label: 'Fund out', defaultExposed: true, locked: true },
  ],
  clock: [
    { id: 'clock_in', nature: 'time', linkKind: 'data_feed', direction: 'in', edge: 'left', slot: 'default', label: 'Clock in', defaultExposed: true, locked: true },
    { id: 'clock_now', nature: 'time', linkKind: 'data_feed', direction: 'out', edge: 'right', slot: 'default', label: 'Now', defaultExposed: true, locked: true },
  ],
  time: [
    { id: 'time_authority', nature: 'time', linkKind: 'data_feed', direction: 'in', edge: 'left', slot: 'default', label: 'Authority in', defaultExposed: true, locked: true },
    { id: 'time_schedule', nature: 'time', linkKind: 'data_feed', direction: 'out', edge: 'top', slot: 'schedule_out', label: 'Schedule', defaultExposed: true, locked: true },
    { id: 'time_bus', nature: 'time', linkKind: 'data_feed', direction: 'out', edge: 'right', slot: 'time_bus_out', label: 'Time bus', defaultExposed: true, locked: true },
  ],
  display: [
    { id: 'display_in', nature: 'data', linkKind: 'data_feed', direction: 'in', edge: 'left', slot: 'default', label: 'Display in', defaultExposed: true, locked: true },
    { id: 'display_clock', nature: 'time', linkKind: 'data_feed', direction: 'in', edge: 'bottom', slot: 'clock_in', label: 'Clock in', defaultExposed: true, locked: true },
  ],
  simulator: [
    { id: 'sim_in', nature: 'data', linkKind: 'data_feed', direction: 'in', edge: 'left', slot: 'default', label: 'Sim in', defaultExposed: true, locked: true },
    { id: 'sim_out', nature: 'data', linkKind: 'data_feed', direction: 'out', edge: 'right', slot: 'master_out', label: 'Sim data', defaultExposed: true, locked: true },
    { id: 'sim_verify', nature: 'system', linkKind: 'verification', direction: 'out', edge: 'right', slot: 'system', label: 'Verify', defaultExposed: true, locked: true },
  ],
  generator: [
    { id: 'gen_out', nature: 'data', linkKind: 'data_feed', direction: 'out', edge: 'right', slot: 'master_out', label: 'Generated', defaultExposed: true, locked: true },
  ],
};

export function channelsForModule(type: ModuleType): readonly PortChannelDef[] {
  return MODULE_PORT_CHANNELS[type];
}

export function natureForLinkKind(
  kind: LinkKind,
  slot: PortSlot | null = null,
): PortNature {
  if (slot === 'clock_in' || slot === 'schedule_out' || slot === 'time_bus_out') return 'time';
  switch (kind) {
    case 'data_feed':
      return slot === 'system' ? 'system' : 'data';
    case 'directive':
    case 'verification':
      return 'system';
    case 'fund_route':
      return 'fund';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Optional inspector field — only unlocked delivery channel ids. */
export const ExposedOutputChannels = z.array(z.string().min(1).max(64)).max(32).optional();
export type ExposedOutputChannels = z.infer<typeof ExposedOutputChannels>;

export function resolveExposedChannels(
  type: ModuleType,
  exposedOutputChannels: readonly string[] | null | undefined,
): ReadonlySet<string> {
  const channels = MODULE_PORT_CHANNELS[type];
  // undefined/null → catalog defaults. Explicit [] hides unlockable delivery outs.
  if (exposedOutputChannels == null) {
    return new Set(channels.filter((c) => c.defaultExposed).map((c) => c.id));
  }
  const allowed = new Set(channels.map((c) => c.id));
  const next = new Set<string>();
  for (const ch of channels) {
    if (ch.locked) next.add(ch.id);
    else if (ch.slot !== 'delivery' && ch.defaultExposed) next.add(ch.id);
  }
  for (const id of exposedOutputChannels) {
    if (allowed.has(id)) next.add(id);
  }
  for (const ch of channels) {
    if (ch.locked) next.add(ch.id);
    if (!ch.locked && ch.slot === 'delivery' && !exposedOutputChannels.includes(ch.id)) {
      next.delete(ch.id);
    }
  }
  return next;
}

function peerFromHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const sep = handle.indexOf('__');
  return sep >= 0 ? handle.slice(sep + 2) || null : null;
}

/**
 * Resolve canvas handle → PortSlot for connect validation (D-108).
 * Explicit `slot:*` peers win; Time data_feed outs default to time_bus_out;
 * Time→consumer peer streams resolve as clock_in on the target.
 */
export function resolveHandleSlot(
  moduleType: ModuleType,
  handle: string | null | undefined,
  direction: 'in' | 'out',
  peerType?: ModuleType | null,
): PortSlot {
  if (!handle) return 'default';
  const slotted = parsePortSlotPeer(peerFromHandle(handle));
  if (slotted) return slotted;
  if (moduleType === 'time' && direction === 'out' && handle.startsWith('data_feed-out')) {
    return 'time_bus_out';
  }
  const peer = peerFromHandle(handle);
  // Existing Time→consumer peer streams (UUID peer, not slot bus) land on clock_in.
  if (
    CLOCK_IN_MODULE_TYPES.has(moduleType) &&
    direction === 'in' &&
    handle.startsWith('data_feed-in') &&
    peerType === 'time' &&
    peer &&
    !parsePortSlotPeer(peer)
  ) {
    return 'clock_in';
  }
  return 'default';
}

/**
 * Fail-closed: schedule / time_bus outs only onto clock_in consumers;
 * clock_in targets only accept Time (or explicit schedule/time_bus) sources.
 */
export function isLegalStreamPortPair(input: {
  fromType: ModuleType;
  toType: ModuleType;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  linkKind: LinkKind;
}): boolean {
  const sourceSlot = resolveHandleSlot(input.fromType, input.sourceHandle, 'out');
  const targetSlot = resolveHandleSlot(
    input.toType,
    input.targetHandle,
    'in',
    input.fromType === 'time' ? 'time' : null,
  );

  const sourceIsTimeOut =
    sourceSlot === 'schedule_out' ||
    sourceSlot === 'time_bus_out' ||
    (input.fromType === 'time' && input.linkKind === 'data_feed');

  if (sourceIsTimeOut) {
    if (!moduleHasClockIn(input.toType)) return false;
    // Hydration / API without handles: peer placement assigns clock_in after insert.
    if (!input.sourceHandle && !input.targetHandle) return true;
    // New connects must land on the clock_in bus; existing peer UUID streams OK.
    const tgtPeer = peerFromHandle(input.targetHandle);
    if (targetSlot === 'clock_in') return true;
    if (tgtPeer && !parsePortSlotPeer(tgtPeer)) return true;
    return false;
  }

  if (targetSlot === 'clock_in') {
    return input.fromType === 'time';
  }

  return true;
}
