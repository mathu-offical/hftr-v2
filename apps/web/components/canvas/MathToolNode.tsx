'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { handleIdForLink } from '@hftr/contracts';

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

const DATA_COLOR = '#7aa2f7';
const FUND_COLOR = '#73daca';

/**
 * Compact deterministic tool lane. This is a real graph node (not a duplicate
 * owner badge), so data/fund topology remains visible and inspectable.
 */
export const MathToolNode = memo(function MathToolNode({
  data,
  selected,
}: NodeProps<MathToolFlowNode>) {
  return (
    <div
      role="group"
      aria-label={`Dedicated Math tool for ${data.ownerName}`}
      className="relative flex h-12 w-[220px] items-center gap-2 rounded-md border bg-[var(--color-surface-1)] px-3 shadow-lg"
      style={{ borderColor: selected ? '#bb9af7' : 'rgba(187,154,247,0.55)' }}
      title={`Dedicated deterministic Math tool for ${data.ownerName}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id={handleIdForLink('data_feed', 'in')}
        style={{ background: DATA_COLOR, top: '34%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id={handleIdForLink('data_feed', 'out')}
        style={{ background: DATA_COLOR, top: '34%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id={handleIdForLink('fund_route', 'in')}
        style={{ background: FUND_COLOR, top: '72%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id={handleIdForLink('fund_route', 'out')}
        style={{ background: FUND_COLOR, top: '72%' }}
      />
      <span className="h-2 w-2 shrink-0 rounded-full bg-[#bb9af7]" />
      <div className="min-w-0">
        <div className="text-[8px] uppercase tracking-[0.16em] text-[#bb9af7]">Dedicated Math</div>
        <div className="truncate text-[10px] text-[var(--color-ink-dim)]">{data.ownerName}</div>
      </div>
    </div>
  );
});
