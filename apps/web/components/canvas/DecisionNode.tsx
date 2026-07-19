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

function selectedLabel(data: DecisionNodeData): string {
  const selected = data.options?.find((opt) => opt.id === data.selectedOptionId);
  return selected?.label ?? data.label;
}

/**
 * Unified decision node (D-192): one card per deterministic choice point.
 * Options live in config; each option exposes its own source handle for routing.
 * All Handles are direct children of the root (React Flow requirement).
 */
export const DecisionNode = memo(function DecisionNode({
  data,
  selected,
}: NodeProps<DecisionFlowNode>) {
  const position = data.position ?? 'typical';
  const intakes = data.intakes ?? { data: true, systemControl: true, clock: false };
  const options: DecisionOption[] = data.options ?? [];
  const borderColor = selected
    ? 'var(--color-accent)'
    : 'color-mix(in srgb, var(--color-line) 85%, transparent)';

  const cardMinHeight = Math.max(72, 48 + options.length * 14);

  return (
    <div
      role="group"
      aria-label={`${data.label} decision`}
      className="relative flex w-[168px] flex-col gap-1 rounded-md border px-2 py-1.5 shadow-md"
      style={{
        minHeight: cardMinHeight,
        borderColor,
        background: 'var(--color-surface-1)',
      }}
      title={data.label}
    >
      {intakes.data ? (
        <Handle
          id={DECISION_HANDLE_DATA_IN}
          type="target"
          position={Position.Left}
          className="hftr-handle"
          aria-label="Decision data in"
          style={{
            top: '28%',
            width: 6,
            height: 6,
            background: 'var(--color-ink-faint)',
            border: '1px solid var(--color-surface-0)',
          }}
        />
      ) : null}
      {intakes.systemControl ? (
        <Handle
          id={DECISION_HANDLE_SYSTEM_IN}
          type="target"
          position={Position.Left}
          className="hftr-handle"
          aria-label="Decision system control in"
          style={{
            top: '62%',
            width: 6,
            height: 6,
            background: 'var(--color-ink-dim)',
            border: '1px solid var(--color-surface-0)',
          }}
        />
      ) : null}

      {options.length === 0 ? (
        <Handle
          id={OPTION_ANCHOR_HANDLE_OUT}
          type="source"
          position={Position.Right}
          className="hftr-handle"
          aria-label="Decision out"
          style={{
            top: '50%',
            width: 6,
            height: 6,
            background: 'var(--color-ink-faint)',
            border: '1px solid var(--color-surface-0)',
          }}
        />
      ) : (
        options.map((option, index) => {
          const isSelected = option.id === data.selectedOptionId;
          const topPct = ((index + 1) / (options.length + 1)) * 100;
          return (
            <Handle
              key={option.id}
              id={decisionOptionOutHandle(option.id)}
              type="source"
              position={Position.Right}
              className="hftr-handle"
              aria-label={`Option out ${option.label}`}
              style={{
                top: `${topPct}%`,
                width: 6,
                height: 6,
                background: isSelected ? 'var(--color-accent)' : 'var(--color-ink-faint)',
                border: '1px solid var(--color-surface-0)',
              }}
            />
          );
        })
      )}

      <div className="flex items-center justify-between gap-1">
        <span className="max-w-[88px] truncate rounded border border-[var(--color-line)] px-1 py-0.5 text-[7px] uppercase tracking-wide text-[var(--color-ink-faint)]">
          {kindChipLabel(data.kind)}
        </span>
        <span className="shrink-0 rounded border border-[var(--color-line)] px-1 py-0.5 text-[7px] uppercase tracking-wide text-[var(--color-ink-dim)]">
          {position}
        </span>
      </div>
      <p className="truncate text-[10px] font-medium text-[var(--color-ink)]">{data.label}</p>
      <p className="truncate text-[8px] text-[var(--color-ink-dim)]">
        Selected: {selectedLabel(data)}
      </p>
      {options.length > 0 ? (
        <ul className="mt-0.5 space-y-0.5 pr-2">
          {options.map((option) => {
            const isSelected = option.id === data.selectedOptionId;
            return (
              <li
                key={option.id}
                className="truncate text-right text-[7px]"
                style={{
                  color: isSelected ? 'var(--color-accent)' : 'var(--color-ink-faint)',
                }}
                title={option.label}
              >
                {option.label}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

/** @deprecated Prefer DecisionNode (D-192). */
export const OptionAnchorNode = DecisionNode;
