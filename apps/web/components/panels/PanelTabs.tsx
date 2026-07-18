'use client';

import type { ReactNode } from 'react';

export type PanelTabItem<T extends string> = {
  id: T;
  label: ReactNode;
  /** Optional count / badge rendered in mono after the label. */
  meta?: ReactNode;
  /** Native tooltip / full name when rail uses short labels. */
  title?: string;
  disabled?: boolean;
};

type PanelTabsProps<T extends string> = {
  tabs: PanelTabItem<T>[];
  /** Single-select active tab (default mode). */
  value?: T;
  onChange?: (id: T) => void;
  /**
   * Multi-select active tabs (bottom panel D-114). When set, buttons use
   * aria-pressed and `onToggle` instead of exclusive selection.
   */
  values?: T[];
  onToggle?: (id: T) => void;
  /** Accessible name for the tablist / toolbar. */
  'aria-label': string;
  /**
   * `rail` — panel headers (left/right/bottom).
   * `compact` — nested category strips inside a panel body.
   */
  density?: 'rail' | 'compact';
  className?: string;
};

/**
 * Financial-terminal tab strip: mono uppercase labels, hairline base,
 * accent underline on the active tab (text-first; color reinforces).
 * Multi mode (`values` + `onToggle`) allows several tabs pressed at once.
 */
export function PanelTabs<T extends string>(props: PanelTabsProps<T>) {
  const density = props.density ?? 'rail';
  const isCompact = density === 'compact';
  const multi = props.values != null;

  return (
    <div
      role={multi ? 'toolbar' : 'tablist'}
      aria-label={props['aria-label']}
      className={`flex min-w-0 items-stretch gap-0 overflow-x-auto ${
        isCompact ? 'border-b border-[var(--color-line)]' : ''
      } ${props.className ?? ''}`.trim()}
    >
      {props.tabs.map((t) => {
        const selected = multi
          ? (props.values?.includes(t.id) ?? false)
          : props.value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role={multi ? 'button' : 'tab'}
            id={`panel-tab-${t.id}`}
            aria-selected={multi ? undefined : selected}
            aria-pressed={multi ? selected : undefined}
            aria-label={t.title}
            title={t.title}
            disabled={t.disabled}
            onClick={() => {
              if (multi) props.onToggle?.(t.id);
              else props.onChange?.(t.id);
            }}
            className={`relative shrink-0 whitespace-nowrap border-b-2 font-mono uppercase tracking-[0.12em] transition-colors ${
              isCompact ? 'px-2 py-1.5 text-[9px]' : 'px-2.5 py-2 text-[10px]'
            } ${
              selected
                ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                : 'border-transparent text-[var(--color-ink-faint)] hover:text-[var(--color-ink-dim)]'
            } ${t.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
          >
            <span className="inline-flex items-baseline gap-1.5">
              <span>{t.label}</span>
              {t.meta != null ? (
                <span
                  className={`tabular-nums tracking-normal normal-case ${
                    selected ? 'text-[var(--color-ink-dim)]' : 'text-[var(--color-ink-faint)]'
                  }`}
                >
                  {t.meta}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
