'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { handleIdForLink, splitCompactModuleName } from '@hftr/contracts';

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
 * Compact deterministic tool lane.
 * - Data to/from owner modules: top handles
 * - Funds: left in → right out (never into LLM nodes)
 */
export const MathToolNode = memo(function MathToolNode({
  data,
  selected,
}: NodeProps<MathToolFlowNode>) {
  const { primary } = splitCompactModuleName(data.name);
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
        position={Position.Top}
        id={handleIdForLink('data_feed', 'in')}
        aria-label="Data feed input"
        style={{ background: DATA_COLOR, left: '32%', width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id={handleIdForLink('data_feed', 'out')}
        aria-label="Data feed output"
        style={{ background: DATA_COLOR, left: '68%', width: 8, height: 8 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id={handleIdForLink('fund_route', 'in')}
        aria-label="Fund route input"
        style={{ background: FUND_COLOR, top: '50%', width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id={handleIdForLink('fund_route', 'out')}
        aria-label="Fund route output"
        style={{ background: FUND_COLOR, top: '50%', width: 8, height: 8 }}
      />
      <span className="h-2 w-2 shrink-0 rounded-full bg-[#bb9af7]" />
      <div className="min-w-0">
        <div className="text-[8px] uppercase tracking-[0.16em] text-[#bb9af7]">Dedicated Math</div>
        <div className="truncate text-[10px] text-[var(--color-ink-dim)]" title={data.name}>
          {primary}
        </div>
      </div>
    </div>
  );
});
