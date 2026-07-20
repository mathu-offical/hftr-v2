'use client';

import { memo } from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import type { ProcessStageKind, ProcessStageSpec, ProcessStageStatus } from '@hftr/contracts';
import { PROCESS_STAGE_NODE_HEIGHT, PROCESS_STAGE_NODE_WIDTH } from '@hftr/contracts';

export type ProcessStageNodeData = Pick<
  ProcessStageSpec,
  'id' | 'kind' | 'label' | 'status' | 'ownerModuleId'
>;

export type ProcessStageFlowNode = Node<ProcessStageNodeData, 'processStageNode'>;

const STATUS_LABEL: Record<ProcessStageStatus, string> = {
  idle: 'Idle',
  active: 'Active',
  blocked: 'Blocked',
  ready: 'Ready',
  done: 'Done',
  skipped: 'Skipped',
};

function statusColor(status: ProcessStageStatus): string {
  switch (status) {
    case 'active':
    case 'ready':
      return 'var(--color-accent)';
    case 'blocked':
      return 'var(--color-block)';
    case 'done':
      return 'var(--color-ok)';
    case 'skipped':
      return 'var(--color-ink-faint)';
    case 'idle':
    default:
      return 'var(--color-ink-dim)';
  }
}

function kindChipLabel(kind: ProcessStageKind): string {
  return kind.replace(/_/g, ' ');
}

/**
 * D-232 / D-237: compact view-only process spine card on execution/sim ENGINE canvases.
 */
export const ProcessStageNode = memo(function ProcessStageNode({
  data,
  selected,
}: NodeProps<ProcessStageFlowNode>) {
  const borderColor = selected
    ? 'var(--color-accent)'
    : 'color-mix(in srgb, var(--color-line) 85%, transparent)';

  return (
    <div
      role="group"
      aria-label={`${data.label} process stage`}
      className="relative flex flex-col rounded-md border shadow-sm"
      style={{
        width: PROCESS_STAGE_NODE_WIDTH,
        minHeight: PROCESS_STAGE_NODE_HEIGHT,
        borderColor,
        background: 'var(--color-surface-1)',
      }}
      title={data.label}
    >
      <div
        className="border-b px-2 py-1"
        style={{ borderColor: 'var(--color-line)' }}
      >
        <p className="truncate text-[7px] uppercase tracking-wide text-[var(--color-ink-faint)]">
          {kindChipLabel(data.kind)}
        </p>
        <p className="truncate text-[10px] font-medium text-[var(--color-ink)]">{data.label}</p>
      </div>
      <p
        className="px-2 py-1 text-[9px] font-medium"
        style={{ color: statusColor(data.status) }}
        aria-label={`Status ${STATUS_LABEL[data.status]}`}
      >
        {STATUS_LABEL[data.status]}
      </p>
    </div>
  );
});
