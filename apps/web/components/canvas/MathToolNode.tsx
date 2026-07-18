'use client';

import { memo } from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import { splitCompactModuleName } from '@hftr/contracts';
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
 * Compact deterministic tool lane.
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
  return (
    <div
      role="group"
      aria-label={`Dedicated Math tool for ${data.ownerName}`}
      className="relative flex h-10 w-[180px] items-center gap-2 rounded-md border px-2 shadow-lg"
      style={{
        borderColor: selected ? '#bb9af7' : 'rgba(187,154,247,0.55)',
        backgroundImage:
          'linear-gradient(rgba(187, 154, 247, 0.10), rgba(187, 154, 247, 0.10)), linear-gradient(var(--color-surface-1), var(--color-surface-1))',
      }}
      title={`Dedicated deterministic Math tool for ${data.ownerName}`}
    >
      <MathPortBuses inbound={streamPorts.inbound} outbound={streamPorts.outbound} />
      <span
        className="shrink-0 rounded px-1 py-0.5 text-[8px] uppercase tracking-wider text-[#bb9af7]"
        style={{ border: '1px solid rgba(187,154,247,0.45)', background: 'rgba(187,154,247,0.12)' }}
      >
        Tool
      </span>
      <div className="min-w-0">
        <div className="text-[8px] uppercase tracking-[0.16em] text-[#bb9af7]">Dedicated Math</div>
        <div className="truncate text-[10px] text-[var(--color-ink-dim)]" title={data.name}>
          {primary}
        </div>
      </div>
    </div>
  );
});
