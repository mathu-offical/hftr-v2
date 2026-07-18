'use client';

import { memo } from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import { splitCompactModuleName } from '@hftr/contracts';
import { MODULE_VISUALS } from './canvas-visuals';
import { MathPortBuses } from './NodePortBuses';
import { useModuleStreamPorts } from './use-module-stream-ports';

export type MathToolNodeData = {
  name: string;
  companyId: string;
  moduleType: 'math';
  engineInstanceId: null;
  toolOwnerModuleId: string;
  ownerEngineInstanceId: string | null;
  ownerModuleId: string;
  ownerName: string;
};

export type MathToolFlowNode = Node<MathToolNodeData, 'mathTool'>;

/**
 * Compact deterministic tool lane — tokens from MODULE_VISUALS.math (hub Math parity).
 * - Data streams on top (bus + per-peer)
 * - Fund streams left → right
 */
export const MathToolNode = memo(function MathToolNode({
  id,
  data,
  selected,
}: NodeProps<MathToolFlowNode>) {
  const { primary } = splitCompactModuleName(data.name);
  const streamPorts = useModuleStreamPorts(id, 'math');
  const visual = MODULE_VISUALS.math;
  const borderColor = selected ? visual.hue : `${visual.hue}8c`;
  return (
    <div
      role="group"
      aria-label={`Dedicated Math tool for ${data.ownerName}`}
      className="relative flex h-10 w-[180px] items-center gap-2 rounded-md border px-2 shadow-lg"
      style={{
        borderColor,
        backgroundImage: `linear-gradient(${visual.wash}, ${visual.wash}), linear-gradient(var(--color-surface-1), var(--color-surface-1))`,
      }}
      title={`Dedicated deterministic Math tool for ${data.ownerName}`}
    >
      <MathPortBuses inbound={streamPorts.inbound} outbound={streamPorts.outbound} />
      <span
        className="shrink-0 rounded px-1 py-0.5 text-[8px] uppercase tracking-wider"
        style={{
          color: visual.hue,
          border: `1px solid ${visual.hue}73`,
          background: visual.wash,
        }}
      >
        Tool
      </span>
      <div className="min-w-0">
        <div
          className="text-[8px] uppercase tracking-[0.16em]"
          style={{ color: visual.hue }}
        >
          Dedicated Math
        </div>
        <div className="truncate text-[10px] text-[var(--color-ink-dim)]" title={data.name}>
          {primary}
        </div>
      </div>
    </div>
  );
});
