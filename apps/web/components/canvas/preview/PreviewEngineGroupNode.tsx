'use client';

import { memo } from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import { engineVisualForTemplate } from '@/components/canvas/canvas-visuals';
import type { PreviewEngineGroupNodeData } from '@/lib/build-template-preview-graph';

type PreviewEngineFlowNode = Node<PreviewEngineGroupNodeData, 'previewEngine'>;

export const PreviewEngineGroupNode = memo(function PreviewEngineGroupNode({
  data,
}: NodeProps<PreviewEngineFlowNode>) {
  const engineVisual = engineVisualForTemplate(data.templateId);
  const ring = data.selected
    ? 'border-[var(--color-accent)]'
    : data.familyActive
      ? 'border-[var(--color-accent)]/50'
      : 'border-[var(--color-line)]';
  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-md border border-dashed ${ring}`}
      style={{
        backgroundImage: `
          linear-gradient(${engineVisual.wash}, ${engineVisual.wash}),
          repeating-linear-gradient(
            90deg,
            ${engineVisual.stripe} 0 1px,
            transparent 1px 14px
          ),
          linear-gradient(var(--color-surface-0), var(--color-surface-0))
        `,
      }}
      data-testid="engine-preview-group"
      data-engine-key={data.engineKey}
      data-template-id={data.templateId}
      data-engine-section={data.section}
      data-family-active={data.familyActive ? 'true' : 'false'}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ background: engineVisual.hue, opacity: 0.75 }}
        aria-hidden
      />
      <div className="flex items-center gap-1 px-2 py-1 pl-3">
        <span
          className="shrink-0 rounded px-1 py-0.5 text-[7px] uppercase tracking-wider"
          style={{
            color: engineVisual.hue,
            border: `1px solid ${engineVisual.hue}66`,
            background: `${engineVisual.hue}14`,
          }}
        >
          {engineVisual.label}
        </span>
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
