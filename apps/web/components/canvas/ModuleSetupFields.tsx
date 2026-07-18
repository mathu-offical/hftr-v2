'use client';

import { useEffect, useRef } from 'react';
import type { ModuleSetupField, ModuleSetupInput } from '@hftr/contracts';

export interface ModuleSetupDraft {
  topicSectors: string;
  allocationMode: 'amount' | 'percentage';
  allocationValue: string;
  targetExitLocal: string;
}

export const EMPTY_MODULE_SETUP_DRAFT: ModuleSetupDraft = {
  topicSectors: '',
  allocationMode: 'amount',
  allocationValue: '',
  targetExitLocal: '',
};

export const SETUP_FIELD_LABELS: Record<ModuleSetupField, string> = {
  capital_allocation: 'Capital allocation',
  topic_sector: 'Topic / sector',
  target_exit: 'Target exit',
};

export function missingFieldsFromDraft(
  requiredFields: readonly ModuleSetupField[],
  draft: ModuleSetupDraft,
): ModuleSetupField[] {
  return requiredFields.filter((field) => {
    switch (field) {
      case 'capital_allocation':
        return !draft.allocationValue.trim();
      case 'topic_sector':
        return !draft.topicSectors.trim();
      case 'target_exit':
        return !draft.targetExitLocal;
      default: {
        const _exhaustive: never = field;
        return _exhaustive;
      }
    }
  });
}

export function moduleSetupInputFromDraft(
  draft: ModuleSetupDraft,
  requiredFields: readonly ModuleSetupField[],
): ModuleSetupInput {
  const required = new Set(requiredFields);
  const setup: ModuleSetupInput = {};
  if (required.has('topic_sector') && draft.topicSectors.trim()) {
    setup.topicSectors = draft.topicSectors
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }
  if (required.has('capital_allocation') && draft.allocationValue.trim()) {
    setup.capitalAllocation = {
      mode: draft.allocationMode,
      value: draft.allocationValue.trim(),
    };
  }
  if (required.has('target_exit') && draft.targetExitLocal) {
    setup.targetExitAt = new Date(draft.targetExitLocal).toISOString();
    setup.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return setup;
}

function FieldStatusChip(props: { field: ModuleSetupField }) {
  return (
    <span className="shrink-0 rounded-full border border-[var(--color-warn)] px-1.5 py-0.5 text-[9px] text-[var(--color-warn)]">
      Required · {SETUP_FIELD_LABELS[props.field]}
    </span>
  );
}

function ConfirmedFieldCheck(props: { field: ModuleSetupField; insetForNativeControl?: boolean }) {
  return (
    <span
      role="status"
      aria-label={`Confirmed: ${SETUP_FIELD_LABELS[props.field]}`}
      className={`pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full border
        border-[var(--color-ok)]/50 bg-[var(--color-ok)]/10 px-1 text-[9px]
        text-[var(--color-ok)] ${props.insetForNativeControl ? 'right-8' : 'right-2'}`}
    >
      ✓
    </span>
  );
}

function fieldBorderClass(
  missing: boolean,
  compact?: boolean,
  options?: { width?: 'full' | 'auto' },
): string {
  const width = options?.width === 'auto' ? 'w-auto shrink-0' : 'w-full';
  const base = compact
    ? `${width} rounded border bg-[var(--color-surface-0)] px-1.5 py-1 text-[10px] outline-none`
    : `${width} rounded-md border bg-[var(--color-surface-0)] px-2 py-1.5 text-xs outline-none`;
  const state = missing
    ? 'border-[var(--color-warn)] focus:border-[var(--color-warn)]'
    : 'border-[var(--color-line)] focus:border-[var(--color-accent)]';
  return `${base} ${state}`;
}

function FieldLabel(props: {
  field: ModuleSetupField;
  showLabels?: boolean;
}) {
  const label = SETUP_FIELD_LABELS[props.field];
  if (!props.showLabels) {
    return <span className="sr-only">{label}</span>;
  }
  return (
    <span
      className="mb-0.5 block truncate text-[10px] font-medium text-[var(--color-ink-dim)]"
      title={label}
    >
      {label}
    </span>
  );
}

export function ModuleSetupFields(props: {
  requiredFields: readonly ModuleSetupField[];
  missingFields: readonly ModuleSetupField[];
  draft: ModuleSetupDraft;
  onChange: (draft: ModuleSetupDraft) => void;
  compact?: boolean;
  /** Visible human-readable labels (engine group chrome). */
  showLabels?: boolean;
  /** Hide capital helper copy (engine group uses a short strip). */
  hideHints?: boolean;
  /** Focus this field when set (tap-to-edit from group chrome). */
  focusField?: ModuleSetupField | null;
  onFocusField?: (field: ModuleSetupField) => void;
}) {
  const required = new Set(props.requiredFields);
  const missing = new Set(props.missingFields);
  const topicRef = useRef<HTMLInputElement>(null);
  const allocationRef = useRef<HTMLInputElement>(null);
  const exitRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!props.focusField) return;
    const target =
      props.focusField === 'topic_sector'
        ? topicRef.current
        : props.focusField === 'capital_allocation'
          ? allocationRef.current
          : props.focusField === 'target_exit'
            ? exitRef.current
            : null;
    target?.focus();
    if (target && 'select' in target && typeof target.select === 'function') {
      target.select();
    }
  }, [props.focusField]);

  if (props.requiredFields.length === 0) {
    return (
      <p className="text-[10px] text-[var(--color-ink-faint)]">
        No additional setup required for this module.
      </p>
    );
  }

  const topicMissing = missing.has('topic_sector');
  const allocationMissing = missing.has('capital_allocation');
  const targetExitMissing = missing.has('target_exit');

  return (
    <div className={props.compact ? 'space-y-1.5' : 'space-y-3'}>
      {required.has('topic_sector') && (
        <div
          className="space-y-0.5"
          onPointerDown={() => props.onFocusField?.('topic_sector')}
        >
          {topicMissing && (
            <div className="flex flex-wrap items-center gap-1">
              <FieldStatusChip field="topic_sector" />
            </div>
          )}
          <label className="block">
            <FieldLabel field="topic_sector" showLabels={props.showLabels} />
            <div className="relative">
              <input
                ref={topicRef}
                value={props.draft.topicSectors}
                onChange={(event) =>
                  props.onChange({ ...props.draft, topicSectors: event.target.value })
                }
                onFocus={() => props.onFocusField?.('topic_sector')}
                placeholder="Semiconductors, energy, macro"
                aria-label="Topic / sector"
                className={`${fieldBorderClass(topicMissing, props.compact)} truncate${topicMissing ? '' : ' pr-8'}`}
              />
              {!topicMissing && <ConfirmedFieldCheck field="topic_sector" />}
            </div>
          </label>
        </div>
      )}

      {required.has('capital_allocation') && (
        <div
          className="space-y-0.5"
          onPointerDown={() => props.onFocusField?.('capital_allocation')}
        >
          {allocationMissing && (
            <div className="flex flex-wrap items-center gap-1">
              <FieldStatusChip field="capital_allocation" />
            </div>
          )}
          <label className="block space-y-0.5">
            <FieldLabel field="capital_allocation" showLabels={props.showLabels} />
            <div className="flex items-stretch gap-1">
              <select
                value={props.draft.allocationMode}
                onChange={(event) =>
                  props.onChange({
                    ...props.draft,
                    allocationMode: event.target.value as 'amount' | 'percentage',
                  })
                }
                aria-label="Capital allocation mode"
                className={fieldBorderClass(allocationMissing, props.compact, { width: 'auto' })}
              >
                <option value="amount">USD</option>
                <option value="percentage">Percent</option>
              </select>
              <div className="relative min-w-0 flex-1">
                <input
                  ref={allocationRef}
                  inputMode="decimal"
                  value={props.draft.allocationValue}
                  onChange={(event) =>
                    props.onChange({ ...props.draft, allocationValue: event.target.value })
                  }
                  onFocus={() => props.onFocusField?.('capital_allocation')}
                  placeholder={props.draft.allocationMode === 'amount' ? '2500.00' : '25'}
                  aria-label="Capital allocation value"
                  className={`${fieldBorderClass(allocationMissing, props.compact)} truncate${allocationMissing ? '' : ' pr-8'}`}
                />
                {!allocationMissing && <ConfirmedFieldCheck field="capital_allocation" />}
              </div>
            </div>
            {!props.hideHints && (
              <span className="block text-[9px] text-[var(--color-ink-faint)]">
                Trading capital only. Provider and LLM budgets are tracked separately.
              </span>
            )}
          </label>
        </div>
      )}

      {required.has('target_exit') && (
        <div
          className="space-y-0.5"
          onPointerDown={() => props.onFocusField?.('target_exit')}
        >
          {targetExitMissing && (
            <div className="flex flex-wrap items-center gap-1">
              <FieldStatusChip field="target_exit" />
            </div>
          )}
          <label className="block">
            <FieldLabel field="target_exit" showLabels={props.showLabels} />
            <div className="relative">
              <input
                ref={exitRef}
                type="datetime-local"
                value={props.draft.targetExitLocal}
                onChange={(event) =>
                  props.onChange({ ...props.draft, targetExitLocal: event.target.value })
                }
                onFocus={() => props.onFocusField?.('target_exit')}
                aria-label="Target exit date / time"
                className={`${fieldBorderClass(targetExitMissing, props.compact)}${targetExitMissing ? '' : ' pr-14'}`}
              />
              {!targetExitMissing && (
                <ConfirmedFieldCheck field="target_exit" insetForNativeControl />
              )}
            </div>
          </label>
        </div>
      )}
    </div>
  );
}
