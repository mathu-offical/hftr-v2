'use client';

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

function FieldStatusChip(props: { field: ModuleSetupField; missing: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] ${
        props.missing
          ? 'border-[var(--color-warn)] text-[var(--color-warn)]'
          : 'border-[var(--color-ok)] text-[var(--color-ok)]'
      }`}
    >
      {props.missing ? 'Required' : 'Set'} · {SETUP_FIELD_LABELS[props.field]}
    </span>
  );
}

function fieldBorderClass(missing: boolean, compact?: boolean): string {
  const base = compact
    ? 'w-full rounded border bg-[var(--color-surface-0)] px-1.5 py-1 text-[10px] outline-none'
    : 'w-full rounded-md border bg-[var(--color-surface-0)] px-2 py-1.5 text-xs outline-none';
  const state = missing
    ? 'border-[var(--color-warn)] focus:border-[var(--color-warn)]'
    : 'border-[var(--color-ok)] focus:border-[var(--color-accent)]';
  return `${base} ${state}`;
}

export function ModuleSetupFields(props: {
  requiredFields: readonly ModuleSetupField[];
  missingFields: readonly ModuleSetupField[];
  draft: ModuleSetupDraft;
  onChange: (draft: ModuleSetupDraft) => void;
  compact?: boolean;
}) {
  const required = new Set(props.requiredFields);
  const missing = new Set(props.missingFields);

  if (props.requiredFields.length === 0) {
    return (
      <p className="text-[10px] text-[var(--color-ink-faint)]">
        No additional setup required for this module.
      </p>
    );
  }

  return (
    <div className={props.compact ? 'space-y-2' : 'space-y-3'}>
      {required.has('topic_sector') && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            <FieldStatusChip field="topic_sector" missing={missing.has('topic_sector')} />
          </div>
          <label className="block">
            <span className="sr-only">Topic / sector</span>
            <input
              value={props.draft.topicSectors}
              onChange={(event) =>
                props.onChange({ ...props.draft, topicSectors: event.target.value })
              }
              placeholder="Semiconductors, energy, macro"
              aria-label="Topic / sector"
              className={fieldBorderClass(missing.has('topic_sector'), props.compact)}
            />
          </label>
        </div>
      )}

      {required.has('capital_allocation') && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            <FieldStatusChip
              field="capital_allocation"
              missing={missing.has('capital_allocation')}
            />
          </div>
          <label className="block space-y-1">
            <span className="sr-only">Capital allocation</span>
            <div className="flex gap-1">
              <select
                value={props.draft.allocationMode}
                onChange={(event) =>
                  props.onChange({
                    ...props.draft,
                    allocationMode: event.target.value as 'amount' | 'percentage',
                  })
                }
                aria-label="Capital allocation mode"
                className={fieldBorderClass(missing.has('capital_allocation'), props.compact)}
              >
                <option value="amount">USD</option>
                <option value="percentage">Percent</option>
              </select>
              <input
                inputMode="decimal"
                value={props.draft.allocationValue}
                onChange={(event) =>
                  props.onChange({ ...props.draft, allocationValue: event.target.value })
                }
                placeholder={props.draft.allocationMode === 'amount' ? '2500.00' : '25'}
                aria-label="Capital allocation value"
                className={fieldBorderClass(missing.has('capital_allocation'), props.compact)}
              />
            </div>
            <span className="block text-[9px] text-[var(--color-ink-faint)]">
              Trading capital only. Provider and LLM budgets are tracked separately.
            </span>
          </label>
        </div>
      )}

      {required.has('target_exit') && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            <FieldStatusChip field="target_exit" missing={missing.has('target_exit')} />
          </div>
          <label className="block">
            <span className="sr-only">Target exit date / time</span>
            <input
              type="datetime-local"
              value={props.draft.targetExitLocal}
              onChange={(event) =>
                props.onChange({ ...props.draft, targetExitLocal: event.target.value })
              }
              aria-label="Target exit date / time"
              className={fieldBorderClass(missing.has('target_exit'), props.compact)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
