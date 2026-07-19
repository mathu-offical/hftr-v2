/**
 * Operator-facing honesty labels for paper simulatorGapTags (D-187 / D-194).
 * Text-first chips — color only reinforces.
 */

export type SimHonestyKind =
  | 'live_mark'
  | 'prior_session'
  | 'synthetic'
  | 'impact_proxy'
  | 'child_drain'
  | 'funds_only'
  | 'execute_on_service'
  | 'no_queue'
  | 'inline_fill'
  | 'no_venue_latency'
  | 'both_verify'
  | 'pre_block'
  | 'other';

export interface SimHonestyChip {
  kind: SimHonestyKind;
  label: string;
}

const CHIP_ORDER: SimHonestyKind[] = [
  'live_mark',
  'prior_session',
  'synthetic',
  'impact_proxy',
  'child_drain',
  'funds_only',
  'execute_on_service',
  'no_queue',
  'inline_fill',
  'no_venue_latency',
  'both_verify',
  'pre_block',
];

/**
 * Map simulatorGapTags to a short ordered chip set for ticker / executions UI.
 */
export function simHonestyChips(tags: readonly string[] | null | undefined): SimHonestyChip[] {
  if (!tags || tags.length === 0) return [];
  const set = new Set(tags);
  const out: SimHonestyChip[] = [];

  if (set.has('live_market_quote')) {
    out.push({ kind: 'live_mark', label: 'Live mark' });
  } else if (set.has('synthetic_quote')) {
    out.push({ kind: 'synthetic', label: 'Synthetic' });
  }

  if (set.has('prior_session_mark')) {
    out.push({ kind: 'prior_session', label: 'Prior session' });
  }

  if (set.has('square_root_impact_proxy')) {
    out.push({ kind: 'impact_proxy', label: 'Impact proxy' });
  }

  if (set.has('child_slice_drain') || set.has('time_spaced_child_drain')) {
    out.push({ kind: 'child_drain', label: 'Child drain' });
  }

  if (set.has('funds_only_routing')) {
    out.push({ kind: 'funds_only', label: 'Funds-only' });
  } else if (set.has('execute_on_service_routing')) {
    out.push({ kind: 'execute_on_service', label: 'On service' });
  }

  if (set.has('no_queue_position')) {
    out.push({ kind: 'no_queue', label: 'No queue' });
  }

  if (set.has('inline_fill_model')) {
    out.push({ kind: 'inline_fill', label: 'Inline fill' });
  }

  if (set.has('no_venue_latency')) {
    out.push({ kind: 'no_venue_latency', label: 'No venue latency' });
  }

  if (set.has('both_verify_linked') || set.has('both_verify_no_provider')) {
    out.push({
      kind: 'both_verify',
      label: set.has('both_verify_linked') ? 'Both-verify' : 'Both-verify (no provider)',
    });
  }

  if (set.has('pre_dispatch_block')) {
    out.push({ kind: 'pre_block', label: 'Pre-block' });
  }

  return out.sort(
    (a, b) => CHIP_ORDER.indexOf(a.kind) - CHIP_ORDER.indexOf(b.kind),
  );
}

/** Compact ticker suffix, e.g. "Live mark · Prior session". */
export function simHonestyTickerLabel(
  tags: readonly string[] | null | undefined,
): string | null {
  const chips = simHonestyChips(tags);
  if (chips.length === 0) return null;
  return chips
    .slice(0, 3)
    .map((c) => c.label)
    .join(' · ');
}
