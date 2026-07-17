'use client';

import { Handle, type NodeProps, type Node } from '@xyflow/react';
import type { ModuleStatus, ModuleType } from '@hftr/contracts';
import { HANDLE_SPEC, MODULE_VISUALS, type HandleGroup } from './types';

export type ModuleNodeData = {
  name: string;
  moduleType: ModuleType;
  status: ModuleStatus;
  /** Server-composed text-first status projection line (T1.4). */
  statusText?: string;
  activeJobs?: number;
};

export type ModuleFlowNode = Node<ModuleNodeData, 'module'>;

const HANDLE_GROUPS: HandleGroup[] = ['dataIn', 'dataOut', 'controlIn', 'toolsOut'];

/** Math is tool-access oriented; its data-plane handles read as secondary. */
const MATH_DEEMPHASIZED: ReadonlySet<HandleGroup> = new Set(['dataIn', 'dataOut']);

/**
 * Canvas node: type-tinted card with text-first status (never color alone).
 * Handles follow the ui-spec node model — left data in, right data out,
 * top control in, bottom tools out — colored by the type they accept.
 */
export function ModuleNode({ data, selected }: NodeProps<ModuleFlowNode>) {
  const visual = MODULE_VISUALS[data.moduleType];
  return (
    <div
      className="min-w-40 rounded-lg border bg-[var(--color-surface-1)] px-3.5 py-2.5 shadow-lg transition-colors"
      style={{
        borderColor: selected ? visual.hue : 'var(--color-line)',
        boxShadow: selected ? `0 0 0 1px ${visual.hue}` : undefined,
      }}
    >
      {HANDLE_GROUPS.map((group) => {
        const spec = HANDLE_SPEC[group];
        const deemphasized = data.moduleType === 'math' && MATH_DEEMPHASIZED.has(group);
        return (
          <Handle
            key={spec.id}
            id={spec.id}
            type={spec.type}
            position={spec.position}
            className="hftr-handle"
            style={{
              width: 8,
              height: 8,
              background: spec.color,
              border: '1px solid var(--color-surface-0)',
              opacity: deemphasized ? 0.35 : 1,
            }}
          />
        );
      })}
      <div className="mb-1 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: visual.hue }} />
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
          {visual.label}
        </span>
      </div>
      <div className="text-sm font-medium text-[var(--color-ink)]">{data.name}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--color-ink-dim)]">
        {(data.activeJobs ?? 0) > 0 && (
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full"
            style={{ background: visual.hue }}
          />
        )}
        <span>{data.statusText ?? data.status}</span>
      </div>
    </div>
  );
}
