'use client';

import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type PanelEdgeRailItem<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
  /** Optional count badge (text-first; shown when > 0). */
  meta?: string | undefined;
};

/**
 * Persistent window-edge rail for left/right panels (D-118 / D-122).
 * Wider symbol buttons stay visible when the panel is open or collapsed;
 * activating a tab expands the panel onto that section.
 */
export function PanelEdgeRail<T extends string>(props: {
  side: 'left' | 'right';
  open: boolean;
  activeTab: T;
  items: PanelEdgeRailItem<T>[];
  onSelectTab: (id: T) => void;
  onToggleOpen: () => void;
  /** Accessible name for the tab symbol group. */
  'aria-label': string;
  collapseLabel: string;
  expandLabel: string;
}) {
  const border =
    props.side === 'left'
      ? 'border-r border-[var(--color-line)]'
      : 'border-l border-[var(--color-line)]';
  const ToggleIcon =
    props.side === 'left'
      ? props.open
        ? ChevronLeft
        : ChevronRight
      : props.open
        ? ChevronRight
        : ChevronLeft;

  return (
    <nav
      className={`flex h-full w-10 shrink-0 flex-col bg-[var(--color-surface-1)] ${border}`}
      aria-label={props['aria-label']}
    >
      <div className="flex flex-col gap-0.5 py-1">
        {props.items.map((item) => {
          const Icon = item.icon;
          const selected = props.open && props.activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => props.onSelectTab(item.id)}
              aria-pressed={selected}
              aria-label={item.label}
              title={item.label}
              className={`relative mx-0.5 flex flex-col items-center gap-0.5 rounded-sm px-0.5 py-2 transition-colors ${
                selected
                  ? 'bg-[var(--color-surface-2)] text-[var(--color-accent)]'
                  : 'text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]'
              }`}
            >
              <Icon size={16} strokeWidth={selected ? 2 : 1.75} aria-hidden />
              {item.meta ? (
                <span className="font-mono text-[8px] tabular-nums leading-none text-[var(--color-ink-dim)]">
                  {item.meta}
                </span>
              ) : null}
              {selected ? (
                <span
                  className={`absolute top-1.5 bottom-1.5 w-0.5 bg-[var(--color-accent)] ${
                    props.side === 'left' ? 'left-0' : 'right-0'
                  }`}
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-auto border-t border-[var(--color-line)] p-0.5">
        <button
          type="button"
          onClick={props.onToggleOpen}
          aria-expanded={props.open}
          aria-label={props.open ? props.collapseLabel : props.expandLabel}
          title={props.open ? props.collapseLabel : props.expandLabel}
          className="flex w-full items-center justify-center rounded-sm py-2 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
        >
          <ToggleIcon size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
