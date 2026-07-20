/**
 * D-240: Strict module I/O artifact kinds — flexible adds, stable wires.
 * Complements MODULE_PORT_CHANNELS (placement) with artifact allowlist for
 * handler admission and link validation.
 */

import { z } from 'zod';
import { ModuleType, type LinkKind } from './modules';

export const ArtifactKind = z.enum([
  'live_quote_stream',
  'library_corpus',
  'seal_ref',
  'posture_orientation_ref',
  'research_article',
  'trend_candidate',
  'lead_package',
  'decision_tree',
  'executable_state',
  'order_composition_plan',
  'action_instruction',
  'verification_record',
  'fund_route_intent',
  'policy_envelope_ref',
  'hub_topic_candidate',
]);
export type ArtifactKind = z.infer<typeof ArtifactKind>;

export const ModulePortDirection = z.enum(['in', 'out']);
export type ModulePortDirection = z.infer<typeof ModulePortDirection>;

export const ModulePortDef = z.object({
  id: z.string().min(1).max(80),
  direction: ModulePortDirection,
  artifactKind: ArtifactKind,
  required: z.boolean().default(false),
  label: z.string().max(80).optional(),
});
export type ModulePortDef = z.infer<typeof ModulePortDef>;

export const ModulePortSchema = z.object({
  moduleType: ModuleType,
  ports: z.array(ModulePortDef).max(32),
});
export type ModulePortSchema = z.infer<typeof ModulePortSchema>;

/** Declared ports per ModuleType (subset used by trading spine + hub). */
export const MODULE_ARTIFACT_PORTS: Record<ModuleType, readonly ModulePortDef[]> = {
  live_api: [
    { id: 'quotes_out', direction: 'out', artifactKind: 'live_quote_stream', required: true },
  ],
  library: [
    { id: 'corpus_in', direction: 'in', artifactKind: 'research_article', required: false },
    { id: 'corpus_out', direction: 'out', artifactKind: 'library_corpus', required: true },
    { id: 'seal_in', direction: 'in', artifactKind: 'seal_ref', required: false },
  ],
  research: [
    { id: 'corpus_in', direction: 'in', artifactKind: 'library_corpus', required: false },
    { id: 'live_in', direction: 'in', artifactKind: 'live_quote_stream', required: false },
    { id: 'article_out', direction: 'out', artifactKind: 'research_article', required: true },
  ],
  librarian: [
    { id: 'article_in', direction: 'in', artifactKind: 'research_article', required: true },
    { id: 'corpus_out', direction: 'out', artifactKind: 'library_corpus', required: true },
  ],
  trend: [
    { id: 'corpus_in', direction: 'in', artifactKind: 'library_corpus', required: false },
    { id: 'live_in', direction: 'in', artifactKind: 'live_quote_stream', required: false },
    { id: 'orientation_in', direction: 'in', artifactKind: 'posture_orientation_ref', required: false },
    { id: 'candidate_out', direction: 'out', artifactKind: 'trend_candidate', required: true },
    { id: 'lead_out', direction: 'out', artifactKind: 'lead_package', required: false },
  ],
  trading: [
    { id: 'lead_in', direction: 'in', artifactKind: 'lead_package', required: true },
    { id: 'fund_in', direction: 'in', artifactKind: 'fund_route_intent', required: false },
    { id: 'policy_in', direction: 'in', artifactKind: 'policy_envelope_ref', required: false },
    { id: 'corpus_in', direction: 'in', artifactKind: 'library_corpus', required: false },
    { id: 'orientation_in', direction: 'in', artifactKind: 'posture_orientation_ref', required: false },
    { id: 'tree_out', direction: 'out', artifactKind: 'decision_tree', required: false },
    { id: 'exec_state_out', direction: 'out', artifactKind: 'executable_state', required: false },
    { id: 'plan_out', direction: 'out', artifactKind: 'order_composition_plan', required: false },
    { id: 'instruction_out', direction: 'out', artifactKind: 'action_instruction', required: false },
  ],
  analyzer: [
    { id: 'instruction_in', direction: 'in', artifactKind: 'action_instruction', required: false },
    { id: 'verify_out', direction: 'out', artifactKind: 'verification_record', required: true },
    { id: 'hub_topic_out', direction: 'out', artifactKind: 'hub_topic_candidate', required: false },
  ],
  policy: [
    { id: 'envelope_out', direction: 'out', artifactKind: 'policy_envelope_ref', required: true },
  ],
  holding_fund: [
    { id: 'fund_out', direction: 'out', artifactKind: 'fund_route_intent', required: true },
  ],
  fund_router: [
    { id: 'fund_in', direction: 'in', artifactKind: 'fund_route_intent', required: true },
    { id: 'fund_out', direction: 'out', artifactKind: 'fund_route_intent', required: true },
  ],
  math: [
    { id: 'fund_in', direction: 'in', artifactKind: 'fund_route_intent', required: false },
    { id: 'fund_out', direction: 'out', artifactKind: 'fund_route_intent', required: false },
  ],
  simulator: [
    { id: 'verify_in', direction: 'in', artifactKind: 'verification_record', required: false },
    { id: 'verify_out', direction: 'out', artifactKind: 'verification_record', required: false },
  ],
  clock: [],
  time: [],
  display: [
    { id: 'corpus_in', direction: 'in', artifactKind: 'library_corpus', required: false },
  ],
  generator: [
    { id: 'article_out', direction: 'out', artifactKind: 'research_article', required: false },
  ],
};

/** Producer→consumer artifact edges that are legal on the canvas / job path. */
const LEGAL_ARTIFACT_FLOWS: ReadonlyArray<readonly [ArtifactKind, ArtifactKind]> = [
  ['live_quote_stream', 'trend_candidate'],
  ['library_corpus', 'trend_candidate'],
  ['library_corpus', 'research_article'],
  ['research_article', 'library_corpus'],
  ['seal_ref', 'library_corpus'],
  ['posture_orientation_ref', 'lead_package'],
  ['trend_candidate', 'lead_package'],
  ['lead_package', 'decision_tree'],
  ['decision_tree', 'executable_state'],
  ['executable_state', 'order_composition_plan'],
  ['order_composition_plan', 'action_instruction'],
  ['action_instruction', 'verification_record'],
  ['verification_record', 'decision_tree'], // loop_refine re-entry
  ['fund_route_intent', 'fund_route_intent'],
  ['fund_route_intent', 'action_instruction'],
  ['policy_envelope_ref', 'order_composition_plan'],
  ['policy_envelope_ref', 'lead_package'],
  ['hub_topic_candidate', 'library_corpus'],
  ['verification_record', 'hub_topic_candidate'],
];

export function isLegalArtifactFlow(from: ArtifactKind, to: ArtifactKind): boolean {
  return LEGAL_ARTIFACT_FLOWS.some(([a, b]) => a === from && b === to);
}

export function portsForModuleType(type: ModuleType): readonly ModulePortDef[] {
  return MODULE_ARTIFACT_PORTS[type] ?? [];
}

export function moduleProducesArtifact(type: ModuleType, kind: ArtifactKind): boolean {
  return portsForModuleType(type).some((p) => p.direction === 'out' && p.artifactKind === kind);
}

export function moduleConsumesArtifact(type: ModuleType, kind: ArtifactKind): boolean {
  return portsForModuleType(type).some((p) => p.direction === 'in' && p.artifactKind === kind);
}

/**
 * Fail-closed: producer must declare out-port of `fromKind`, consumer in-port of `toKind`,
 * and the pair must be in LEGAL_ARTIFACT_FLOWS.
 */
export function assertLegalArtifactWire(opts: {
  fromType: ModuleType;
  toType: ModuleType;
  fromKind: ArtifactKind;
  toKind: ArtifactKind;
}): { ok: true } | { ok: false; reason: string } {
  if (!moduleProducesArtifact(opts.fromType, opts.fromKind)) {
    return { ok: false, reason: `producer_${opts.fromType}_missing_out_${opts.fromKind}` };
  }
  if (!moduleConsumesArtifact(opts.toType, opts.toKind)) {
    return { ok: false, reason: `consumer_${opts.toType}_missing_in_${opts.toKind}` };
  }
  // Same-kind handoff (e.g. lead_package trend→trading) is always legal when ports match.
  if (opts.fromKind === opts.toKind) {
    return { ok: true };
  }
  if (!isLegalArtifactFlow(opts.fromKind, opts.toKind)) {
    return { ok: false, reason: `illegal_artifact_flow_${opts.fromKind}_to_${opts.toKind}` };
  }
  return { ok: true };
}

/**
 * Canonical artifact kinds for a canvas link (D-240).
 * When ambiguous (generic data_feed), prefer first matching producer→consumer pair.
 */
export function resolveArtifactKindsForLink(opts: {
  fromType: ModuleType;
  toType: ModuleType;
  linkKind: LinkKind;
}): { fromKind: ArtifactKind; toKind: ArtifactKind } | null {
  const { fromType, toType, linkKind } = opts;

  if (linkKind === 'directive' && fromType === 'trend' && toType === 'trading') {
    return { fromKind: 'lead_package', toKind: 'lead_package' };
  }
  if (linkKind === 'verification' && fromType === 'trading' && toType === 'analyzer') {
    // Analyzer consumes action_instruction (same-kind handoff); verify_out is separate.
    return { fromKind: 'action_instruction', toKind: 'action_instruction' };
  }
  if (linkKind === 'fund_route') {
    return { fromKind: 'fund_route_intent', toKind: 'fund_route_intent' };
  }

  // data_feed / default: pick first legal same-kind or flow between declared ports.
  const outs = portsForModuleType(fromType).filter((p) => p.direction === 'out');
  const ins = portsForModuleType(toType).filter((p) => p.direction === 'in');
  for (const out of outs) {
    for (const inn of ins) {
      if (out.artifactKind === inn.artifactKind) {
        return { fromKind: out.artifactKind, toKind: inn.artifactKind };
      }
      if (isLegalArtifactFlow(out.artifactKind, inn.artifactKind)) {
        return { fromKind: out.artifactKind, toKind: inn.artifactKind };
      }
    }
  }

  // Types with empty port tables (clock/time) — no artifact gate.
  if (outs.length === 0 || ins.length === 0) return null;
  return null;
}

/** Validate topology link against artifact ports when a pairing can be resolved. */
export function assertLinkArtifactKinds(opts: {
  fromType: ModuleType;
  toType: ModuleType;
  linkKind: LinkKind;
}): { ok: true } | { ok: false; reason: string } {
  const resolved = resolveArtifactKindsForLink(opts);
  if (!resolved) return { ok: true }; // no semantic gate when unresolved
  return assertLegalArtifactWire({
    fromType: opts.fromType,
    toType: opts.toType,
    fromKind: resolved.fromKind,
    toKind: resolved.toKind,
  });
}
