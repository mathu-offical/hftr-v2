import { z } from 'zod';
import { CanvasPosition, ModuleSetupInput, ModuleType } from './modules';

/**
 * Persisted ENGINE instance contracts (D-028).
 * An engine is an insertable template graph with a master topic/sector that
 * cascades to member modules unless overridden.
 */

export const DeleteEngineMode = z.enum(['cascade', 'ungroup']);
export type DeleteEngineMode = z.infer<typeof DeleteEngineMode>;

export const EngineCanvasBounds = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type EngineCanvasBounds = z.infer<typeof EngineCanvasBounds>;

export const EngineInstance = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  templateId: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  masterTopicSectors: z.array(z.string().trim().min(1).max(80)).max(20),
  canvasBounds: EngineCanvasBounds.nullable(),
  memberModuleIds: z.array(z.string().uuid()).optional(),
});
export type EngineInstance = z.infer<typeof EngineInstance>;

export const InsertEngineInput = z.object({
  templateId: z.string().min(1).max(80),
  /** Engine-specific template inputs (philosophy, etc.) keyed by EngineTemplateInput.key. */
  inputs: z.record(z.string(), z.string()).default({}),
  /** Master topic/sector + shared capital/exit applied per required module type. */
  setup: ModuleSetupInput.optional(),
  /** Absolute canvas offset applied to template module positions. */
  canvasOffset: CanvasPosition.optional(),
});
export type InsertEngineInput = z.infer<typeof InsertEngineInput>;

export const UpdateEngineInstanceInput = z.object({
  label: z.string().min(1).max(120).optional(),
  masterTopicSectors: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  canvasBounds: EngineCanvasBounds.nullable().optional(),
});
export type UpdateEngineInstanceInput = z.infer<typeof UpdateEngineInstanceInput>;

export const DeleteEngineInstanceInput = z.object({
  mode: DeleteEngineMode,
});
export type DeleteEngineInstanceInput = z.infer<typeof DeleteEngineInstanceInput>;

/** Module types that may receive a Math tool attachment (n8n-style multi-attach). */
export const MATH_TOOL_CONSUMER_TYPES: ReadonlySet<ModuleType> = new Set([
  'research',
  'library',
  'live_api',
  'trend',
  'trading',
  'simulator',
  'analyzer',
  'policy',
  'generator',
  'display',
]);

export function mathCanAttachTo(consumer: ModuleType): boolean {
  return MATH_TOOL_CONSUMER_TYPES.has(consumer);
}

/** True when a link represents a Math TOOL docked under a consumer. */
export function isMathToolAttachment(
  fromType: ModuleType,
  toType: ModuleType,
  linkKind: 'data_feed' | 'directive' | 'verification' | 'fund_route',
): boolean {
  return fromType === 'math' && mathCanAttachTo(toType) && linkKind === 'data_feed';
}

/** Default group padding around member module cards (port labels + chrome). */
export const ENGINE_GROUP_PADDING = {
  left: 80,
  right: 80,
  top: 72,
  bottom: 96,
} as const;

export function computeEngineBoundsFromPositions(
  positions: readonly { x: number; y: number }[],
  nodeWidth = 280,
  nodeHeight = 220,
): EngineCanvasBounds {
  if (positions.length === 0) {
    return { x: 0, y: 0, width: 400, height: 300 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pos of positions) {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + nodeWidth);
    maxY = Math.max(maxY, pos.y + nodeHeight);
  }
  return {
    x: minX - ENGINE_GROUP_PADDING.left,
    y: minY - ENGINE_GROUP_PADDING.top,
    width: maxX - minX + ENGINE_GROUP_PADDING.left + ENGINE_GROUP_PADDING.right,
    height: maxY - minY + ENGINE_GROUP_PADDING.top + ENGINE_GROUP_PADDING.bottom,
  };
}
