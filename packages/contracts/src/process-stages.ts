import { z } from 'zod';
import { CANVAS_LAYOUT, layoutOwnerEnvelopeHeight } from './canvas-layout';
import { engineCreateSection, getEngineTemplateById, type EngineCreateSection } from './templates';

/** Mirrors ENGINE_GROUP_PADDING — kept local to avoid engines ↔ process-stages cycle. */
const ENGINE_PAD = { left: 96, right: 240, top: 96, bottom: 144 } as const;

/**
 * D-232 / D-237: Viewable process-stage nodes on execution/sim ENGINE canvases.
 * Not free palette ModuleTypes — fail-closed spine order.
 */

export const ProcessStageKind = z.enum([
  'lead',
  'admission',
  'decision_tree',
  'executable_state',
  'instruction_compose',
  'instruction_compile',
  'broker_dispatch',
  'loop_refine',
]);
export type ProcessStageKind = z.infer<typeof ProcessStageKind>;

/** Canonical fail-closed order for execution Trading desk spine. */
export const PROCESS_STAGE_SPINE: readonly ProcessStageKind[] = [
  'lead',
  'admission',
  'decision_tree',
  'executable_state',
  'instruction_compose',
  'instruction_compile',
  'broker_dispatch',
  'loop_refine',
] as const;

export const ProcessStageStatus = z.enum([
  'idle',
  'active',
  'blocked',
  'ready',
  'done',
  'skipped',
]);
export type ProcessStageStatus = z.infer<typeof ProcessStageStatus>;

export const ProcessStageSpec = z.object({
  id: z.string().min(1).max(80),
  kind: ProcessStageKind,
  label: z.string().min(1).max(80),
  status: ProcessStageStatus.default('idle'),
  ownerModuleId: z.string().uuid().nullable().optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});
export type ProcessStageSpec = z.infer<typeof ProcessStageSpec>;

export const PROCESS_STAGE_LABELS: Record<ProcessStageKind, string> = {
  lead: 'Lead',
  admission: 'Admission',
  decision_tree: 'Decision tree',
  executable_state: 'Executable state',
  instruction_compose: 'Compose',
  instruction_compile: 'Instruction compile',
  broker_dispatch: 'Broker dispatch',
  loop_refine: 'Loop refine',
};

/** Compact process-stage card (React Flow processStageNode). */
export const PROCESS_STAGE_NODE_WIDTH = 112;
export const PROCESS_STAGE_NODE_HEIGHT = 52;
export const PROCESS_STAGE_GAP = 12;
/** Clearance below trend→trading owner envelopes before the process rail. */
export const PROCESS_STAGE_RAIL_GAP = 40;

export function defaultExecutionProcessStages(
  tradingModuleId: string | null,
  trendModuleId: string | null,
): ProcessStageSpec[] {
  return PROCESS_STAGE_SPINE.map((kind, i) => ({
    id: `stage:${kind}`,
    kind,
    label: PROCESS_STAGE_LABELS[kind],
    status: 'idle' as const,
    ownerModuleId:
      kind === 'lead' || kind === 'admission' ? trendModuleId : tradingModuleId,
    position: {
      x: i * (PROCESS_STAGE_NODE_WIDTH + PROCESS_STAGE_GAP),
      y: 0,
    },
  }));
}

export type ProcessStageMember = {
  id: string;
  type: string;
  position?: { x: number; y: number };
};

export function shouldSeedProcessStages(
  section: EngineCreateSection,
  members: ReadonlyArray<Pick<ProcessStageMember, 'type'>>,
): boolean {
  if (section !== 'execution' && section !== 'simulation') return false;
  return members.some((member) => member.type === 'trading');
}

/**
 * Place the fail-closed spine rail under trend→trading columns (parent-relative).
 * Falls back to left padding when desk modules are absent.
 */
export function placeProcessStageRail(
  stages: readonly ProcessStageSpec[],
  members: readonly ProcessStageMember[],
): ProcessStageSpec[] {
  const trend = members.find((member) => member.type === 'trend');
  const trading = members.find((member) => member.type === 'trading');
  const envelopeHeight = layoutOwnerEnvelopeHeight(CANVAS_LAYOUT.moduleHeight);
  const step = PROCESS_STAGE_NODE_WIDTH + PROCESS_STAGE_GAP;

  let railX: number = ENGINE_PAD.left;
  let railY: number = ENGINE_PAD.top + envelopeHeight + PROCESS_STAGE_RAIL_GAP;

  const anchors = [trend, trading].filter(
    (member): member is ProcessStageMember & { position: { x: number; y: number } } =>
      Boolean(member?.position),
  );
  if (anchors.length > 0) {
    railX = Math.min(...anchors.map((member) => member.position.x));
    railY =
      Math.max(...anchors.map((member) => member.position.y)) +
      envelopeHeight +
      PROCESS_STAGE_RAIL_GAP;
  }

  return stages.map((stage, index) => ({
    ...stage,
    position: { x: railX + index * step, y: railY },
  }));
}

export function seedEngineProcessStageSnapshot(input: {
  templateId: string;
  members: readonly ProcessStageMember[];
}): ProcessStageSpec[] | null {
  const template = getEngineTemplateById(input.templateId);
  if (!template) return null;
  const section = engineCreateSection(template);
  if (!shouldSeedProcessStages(section, input.members)) return null;
  const tradingId = input.members.find((member) => member.type === 'trading')?.id ?? null;
  const trendId = input.members.find((member) => member.type === 'trend')?.id ?? null;
  const stages = defaultExecutionProcessStages(tradingId, trendId);
  return placeProcessStageRail(stages, input.members);
}

/** Grow engine chrome height so the process rail fits below desk modules. */
export function inflateEngineBoundsForProcessRail(
  bounds: { x: number; y: number; width: number; height: number },
  processBottom: number,
  bottomPad: number = ENGINE_PAD.bottom,
): { x: number; y: number; width: number; height: number } {
  if (processBottom <= 0) return bounds;
  const railHeight = processBottom + bottomPad;
  const rightExtent = bounds.x + bounds.width;
  return {
    ...bounds,
    height: Math.max(bounds.height, railHeight),
    width: Math.max(
      bounds.width,
      rightExtent - bounds.x,
      ENGINE_PAD.left +
        ENGINE_PAD.right +
        PROCESS_STAGE_SPINE.length * (PROCESS_STAGE_NODE_WIDTH + PROCESS_STAGE_GAP),
    ),
  };
}

export function measureProcessRailBottom(
  stages: readonly Pick<ProcessStageSpec, 'position'>[],
): number {
  let bottom = 0;
  for (const stage of stages) {
    if (!stage.position) continue;
    bottom = Math.max(bottom, stage.position.y + PROCESS_STAGE_NODE_HEIGHT);
  }
  return bottom;
}
