'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import {
  DECISION_HANDLE_DATA_IN,
  DECISION_HANDLE_SYSTEM_IN,
  decisionOptionOutHandle,
  type DecisionIntakes,
  type DecisionOption,
  type OptionAnchorKind,
  type OptionAnchorPosition,
  type OptionAnchorSpec,
} from '@hftr/contracts';

/** @deprecated Use DECISION_HANDLE_DATA_IN — kept for transitional edge reads. */
export const OPTION_ANCHOR_HANDLE_IN = DECISION_HANDLE_DATA_IN;
/** @deprecated Per-option outs replace the single option-out. */
export const OPTION_ANCHOR_HANDLE_OUT = 'option-out';

export type DecisionNodeData = Pick<
  OptionAnchorSpec,
  | 'id'
  | 'kind'
  | 'catalogRef'
  | 'label'
  | 'layer'
  | 'parentAnchorId'
  | 'ownerModuleId'
  | 'ownerEngineId'
  | 'options'
  | 'selectedOptionId'
> & {
  position?: OptionAnchorPosition;
  intakes?: DecisionIntakes;
  parentId?: string | null;
  /** Dock was clamped into free column — skip owner→decision intake binds. */
  suppressOwnerBind?: boolean;
};

export type DecisionFlowNode = Node<DecisionNodeData, 'decisionNode'>;
/** @deprecated Prefer DecisionFlowNode / type decisionNode. */
export type OptionAnchorFlowNode = Node<DecisionNodeData, 'optionAnchor' | 'decisionNode'>;
export type OptionAnchorNodeData = DecisionNodeData;

function kindChipLabel(kind: OptionAnchorKind): string {
  return kind.replace(/_/g, ' ');
}

/**
 * Single decision unit (D-208): one React Flow node with multiple intake ports
 * and one source port per option. Options are config/ports — never child nodes.
 */
export const DecisionNode = memo(function DecisionNode({
  data,
  selected,
}: NodeProps<DecisionFlowNode>) {
  const intakes = data.intakes ?? { data: true, systemControl: false, clock: false };
  const options: DecisionOption[] = data.options ?? [];
  const borderColor = selected
    ? 'var(--color-accent)'
    : 'color-mix(in srgb, var(--color-line) 85%, transparent)';

  const intakeRows: Array<{ id: string; label: string; show: boolean }> = [
    { id: DECISION_HANDLE_DATA_IN, label: 'data', show: intakes.data },
    { id: DECISION_HANDLE_SYSTEM_IN, label: 'system', show: intakes.systemControl },
    { id: 'decision-clock-in', label: 'clock', show: intakes.clock },
  ].filter((row) => row.show);

  const outRows =
    options.length > 0
      ? options.map((opt) => ({
          id: decisionOptionOutHandle(opt.id),
          label: opt.label,
          selected: opt.id === data.selectedOptionId,
        }))
      : [{ id: OPTION_ANCHOR_HANDLE_OUT, label: 'out', selected: false }];

  const rowCount = Math.max(intakeRows.length, outRows.length, 1);
  const cardMinHeight = Math.max(56, 28 + rowCount * 18);

  return (
    <div
      role="group"
      aria-label={`${data.label} decision`}
      className="relative flex w-[200px] flex-col rounded-md border shadow-md"
      style={{
        minHeight: cardMinHeight,
        borderColor,
        background: 'var(--color-surface-1)',
      }}
      title={data.label}
    >
      {/* Handles must be direct children of the node root for React Flow. */}
      {intakeRows.map((row, index) => (
        <Handle
          key={row.id}
          id={row.id}
          type="target"
          position={Position.Left}
          className="hftr-handle"
          aria-label={`Decision ${row.label} in`}
          style={{
            top: `${((index + 1) / (intakeRows.length + 1)) * 100}%`,
            width: 7,
            height: 7,
            background: 'var(--color-ink-dim)',
            border: '1px solid var(--color-surface-0)',
          }}
        />
      ))}
      {outRows.map((row, index) => (
        <Handle
          key={row.id}
          id={row.id}
          type="source"
          position={Position.Right}
          className="hftr-handle"
          aria-label={`Decision ${row.label} out`}
          style={{
            top: `${((index + 1) / (outRows.length + 1)) * 100}%`,
            width: 7,
            height: 7,
            background: row.selected ? 'var(--color-accent)' : 'var(--color-ink-faint)',
            border: '1px solid var(--color-surface-0)',
          }}
        />
      ))}

      <div
        className="border-b px-2 py-1"
        style={{ borderColor: 'var(--color-line)' }}
      >
        <p className="truncate text-[8px] uppercase tracking-wide text-[var(--color-ink-faint)]">
          {kindChipLabel(data.kind)}
        </p>
        <p className="truncate text-[11px] font-medium text-[var(--color-ink)]">{data.label}</p>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-x-2 px-2 py-1">
        <ul className="space-y-0.5">
          {intakeRows.map((row) => (
            <li
              key={row.id}
              className="truncate text-[8px] text-[var(--color-ink-dim)]"
              title={row.label}
            >
              {row.label}
            </li>
          ))}
        </ul>
        <ul className="space-y-0.5 text-right">
          {outRows.map((row) => (
            <li
              key={row.id}
              className="truncate text-[8px]"
              style={{
                color: row.selected ? 'var(--color-accent)' : 'var(--color-ink-dim)',
              }}
              title={row.label}
            >
              {row.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
});

/** @deprecated Prefer DecisionNode (D-208). */
export const OptionAnchorNode = DecisionNode;
