'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { OptionAnchorKind, OptionAnchorPosition, OptionAnchorSpec } from '@hftr/contracts';

/** Handle ids for option_bind decorative edges. */
export const OPTION_ANCHOR_HANDLE_IN = 'option-in';
export const OPTION_ANCHOR_HANDLE_OUT = 'option-out';

export type OptionAnchorNodeData = Pick<
  OptionAnchorSpec,
  'id' | 'kind' | 'catalogRef' | 'label' | 'layer' | 'parentAnchorId' | 'ownerModuleId' | 'ownerEngineId'
> & {
  position?: OptionAnchorPosition;
  /** React Flow parent relationship — positioning handled by parent group. */
  parentId?: string | null;
};

export type OptionAnchorFlowNode = Node<OptionAnchorNodeData, 'optionAnchor'>;

function kindChipLabel(kind: OptionAnchorKind): string {
  return kind.replace(/_/g, ' ');
}

export const OptionAnchorNode = memo(function OptionAnchorNode({
  data,
  selected,
}: NodeProps<OptionAnchorFlowNode>) {
  const position = data.position ?? 'typical';
  const borderColor = selected
    ? 'var(--color-accent)'
    : 'color-mix(in srgb, var(--color-line) 85%, transparent)';

  return (
    <div
      role="group"
      aria-label={`${data.label} anchor`}
      className="relative flex h-12 w-[140px] flex-col justify-center gap-0.5 rounded-md border px-2 shadow-md"
      style={{
        borderColor,
        background: 'var(--color-surface-1)',
      }}
      title={data.label}
    >
      <Handle
        id={OPTION_ANCHOR_HANDLE_IN}
        type="target"
        position={Position.Left}
        className="hftr-handle"
        aria-label="Option bind in"
        style={{
          width: 6,
          height: 6,
          background: 'var(--color-ink-faint)',
          border: '1px solid var(--color-surface-0)',
        }}
      />
      <Handle
        id={OPTION_ANCHOR_HANDLE_OUT}
        type="source"
        position={Position.Right}
        className="hftr-handle"
        aria-label="Option bind out"
        style={{
          width: 6,
          height: 6,
          background: 'var(--color-ink-faint)',
          border: '1px solid var(--color-surface-0)',
        }}
      />
      <div className="flex items-center justify-between gap-1">
        <span className="max-w-[72px] truncate rounded border border-[var(--color-line)] px-1 py-0.5 text-[7px] uppercase tracking-wide text-[var(--color-ink-faint)]">
          {kindChipLabel(data.kind)}
        </span>
        <span className="shrink-0 rounded border border-[var(--color-line)] px-1 py-0.5 text-[7px] uppercase tracking-wide text-[var(--color-ink-dim)]">
          {position}
        </span>
      </div>
      <p className="truncate text-[10px] text-[var(--color-ink)]">{data.label}</p>
    </div>
  );
});
