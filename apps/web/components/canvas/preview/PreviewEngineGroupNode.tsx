'use client';

import { memo } from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import type { PreviewEngineGroupNodeData } from '@/lib/build-template-preview-graph';

type PreviewEngineFlowNode = Node<PreviewEngineGroupNodeData, 'previewEngine'>;

export const PreviewEngineGroupNode = memo(function PreviewEngineGroupNode({
  data,
}: NodeProps<PreviewEngineFlowNode>) {
  const ring = data.selected
    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
    : data.familyActive
      ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent)]/5'
      : 'border-[var(--color-line)] bg-[var(--color-surface-0)]/80';
  return (
    <div
      className={`h-full w-full rounded-md border border-dashed ${ring}`}
      data-testid="engine-preview-group"
      data-engine-key={data.engineKey}
      data-template-id={data.templateId}
      data-engine-section={data.section}
      data-family-active={data.familyActive ? 'true' : 'false'}
    >
      <div className="flex items-center gap-1 px-2 py-1">
        <span className="truncate text-[10px] font-medium text-[var(--color-ink)]">
          {data.label}
        </span>
        <span className="shrink-0 text-[8px] uppercase tracking-wide text-[var(--color-ink-faint)]">
          {data.section}
        </span>
        {data.autoDependency && (
          <span
            className="shrink-0 rounded border border-[var(--color-line)] px-1 text-[8px] text-[var(--color-ink-faint)]"
            title="research dependency"
            data-testid="engine-auto-dep"
          >
            dep
          </span>
        )}
      </div>
    </div>
  );
});
