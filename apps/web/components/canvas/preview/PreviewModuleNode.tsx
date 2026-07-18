'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { handleIdForLink, moduleLinkPorts, type ModuleType } from '@hftr/contracts';
import { LINK_PORT_VISUALS, MODULE_VISUALS } from '@/components/canvas/types';
import type { PreviewModuleNodeData } from '@/lib/build-template-preview-graph';

type PreviewModuleFlowNode = Node<PreviewModuleNodeData, 'previewModule'>;

function portTopPercent(index: number, total: number): string {
  if (total <= 1) return '50%';
  return `${((index + 1) / (total + 1)) * 100}%`;
}

export const PreviewModuleNode = memo(function PreviewModuleNode({
  data,
}: NodeProps<PreviewModuleFlowNode>) {
  const moduleType = data.moduleType as ModuleType;
  const visual = MODULE_VISUALS[moduleType] ?? {
    label: data.moduleType,
    hue: '#a9b1d6',
    family: 'agent' as const,
    radiusClass: 'rounded',
    borderStyle: 'solid' as const,
    accent: 'bar' as const,
    wash: 'transparent',
  };
  const ports = moduleLinkPorts(moduleType);

  return (
    <div
      className={`relative h-full w-full overflow-hidden border bg-[var(--color-surface-1)] ${visual.radiusClass ?? 'rounded'}`}
      style={{
        borderStyle: visual.borderStyle ?? 'solid',
        borderColor: 'var(--color-line)',
        borderLeftWidth: 3,
        borderLeftColor: visual.hue,
        backgroundImage: visual.wash
          ? `linear-gradient(${visual.wash}, ${visual.wash}), linear-gradient(var(--color-surface-1), var(--color-surface-1))`
          : undefined,
      }}
      title={data.name}
    >
      <div className="px-1.5 py-1">
        <p className="truncate text-[9px] font-medium leading-tight text-[var(--color-ink)]">
          {data.name}
        </p>
        <p className="truncate text-[8px] uppercase tracking-wide text-[var(--color-ink-faint)]">
          {visual.family === 'data_source' ? 'Data · ' : visual.family === 'fund' ? 'Fund · ' : ''}
          {visual.label}
        </p>
      </div>

      {ports.inbound.map((kind, index) => (
        <Handle
          key={`in-${kind}`}
          id={handleIdForLink(kind, 'in')}
          type="target"
          position={Position.Left}
          style={{
            top: portTopPercent(index, ports.inbound.length),
            background: LINK_PORT_VISUALS[kind].color,
            width: 6,
            height: 6,
            border: 'none',
          }}
        />
      ))}
      {ports.outbound.map((kind, index) => (
        <Handle
          key={`out-${kind}`}
          id={handleIdForLink(kind, 'out')}
          type="source"
          position={Position.Right}
          style={{
            top: portTopPercent(index, ports.outbound.length),
            background: LINK_PORT_VISUALS[kind].color,
            width: 6,
            height: 6,
            border: 'none',
          }}
        />
      ))}
    </div>
  );
});
