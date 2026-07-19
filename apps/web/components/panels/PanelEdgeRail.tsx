'use client';

import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type PanelEdgeRailItem<T extends string> = {
  id: T;
  label: string;
  /** Short mono caption under the icon (2–4 chars). */
  abbrev: string;
  icon: LucideIcon;
  /** Optional count badge (text-first; shown when > 0). */
  meta?: string | undefined;
};

export type PanelEdgeRailAction = {
  id: string;
  label: string;
  abbrev: string;
  icon: LucideIcon;
  pressed?: boolean;
  /** When pressed, tab symbols unpress (e.g. left Libraries full-height). */
  exclusive?: boolean;
  meta?: string | undefined;
  onClick: () => void;
};

/**
 * Persistent window-edge rail for left/right panels (D-118 / D-123 / D-128).
 * Prominent symbol buttons stay visible when the panel is open or collapsed;
 * activating a tab expands the panel onto that section. Optional rail actions
 * sit above the show/hide chevron (e.g. left Libraries, right Assistant).
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
  /** Extra actions above the collapse control (left Libraries, etc.). */
  railActions?: PanelEdgeRailAction[];
}) {
  const border =
    props.side === 'left'
      ? 'border-r-2 border-[var(--color-line)]'
      : 'border-l-2 border-[var(--color-line)]';
  const ToggleIcon =
    props.side === 'left'
      ? props.open
        ? ChevronLeft
        : ChevronRight
      : props.open
        ? ChevronRight
        : ChevronLeft;

  function renderSymbolButton(opts: {
    key: string;
    label: string;
    abbrev: string;
    icon: LucideIcon;
    pressed: boolean;
    meta?: string | undefined;
    onClick: () => void;
  }) {
    const Icon = opts.icon;
    return (
      <button
        key={opts.key}
        type="button"
        onClick={opts.onClick}
        aria-pressed={opts.pressed}
        aria-label={opts.label}
        title={opts.label}
        className={`relative flex flex-col items-center gap-0.5 rounded-md px-0.5 py-2.5 transition-colors ${
          opts.pressed
            ? 'bg-[var(--color-surface-0)] text-[var(--color-accent)] shadow-[inset_0_0_0_1px_var(--color-accent)]'
            : 'text-[var(--color-ink-dim)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-ink)]'
        }`}
      >
        <Icon size={18} strokeWidth={opts.pressed ? 2.25 : 1.85} aria-hidden />
        <span
          className={`font-mono text-[9px] uppercase tracking-[0.08em] leading-none ${
            opts.pressed ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink-faint)]'
          }`}
        >
          {opts.abbrev}
        </span>
        {opts.meta ? (
          <span className="font-mono text-[8px] tabular-nums leading-none text-[var(--color-ink-dim)]">
            {opts.meta}
          </span>
        ) : null}
        {opts.pressed ? (
          <span
            className={`absolute top-2 bottom-2 w-0.5 rounded-full bg-[var(--color-accent)] ${
              props.side === 'left' ? 'left-0' : 'right-0'
            }`}
            aria-hidden
          />
        ) : null}
      </button>
    );
  }

  return (
    <nav
      className={`flex h-full w-12 shrink-0 flex-col bg-[var(--color-surface-2)] ${border}`}
      aria-label={props['aria-label']}
    >
      <div className="flex flex-col gap-1 px-0.5 py-1.5">
        {props.items.map((item) =>
          renderSymbolButton({
            key: item.id,
            label: item.label,
            abbrev: item.abbrev,
            icon: item.icon,
            pressed:
              props.open &&
              props.activeTab === item.id &&
              !(props.railActions?.some((a) => a.exclusive && a.pressed) ?? false),
            meta: item.meta,
            onClick: () => props.onSelectTab(item.id),
          }),
        )}
      </div>

      <div className="mt-auto flex flex-col border-t border-[var(--color-line)]">
        {props.railActions && props.railActions.length > 0 ? (
          <div className="flex flex-col gap-1 border-b border-[var(--color-line)] px-0.5 py-1.5">
            {props.railActions.map((action) =>
              renderSymbolButton({
                key: action.id,
                label: action.label,
                abbrev: action.abbrev,
                icon: action.icon,
                pressed: Boolean(action.pressed),
                meta: action.meta,
                onClick: action.onClick,
              }),
            )}
          </div>
        ) : null}
        <div className="p-0.5">
          <button
            type="button"
            onClick={props.onToggleOpen}
            aria-expanded={props.open}
            aria-label={props.open ? props.collapseLabel : props.expandLabel}
            title={props.open ? props.collapseLabel : props.expandLabel}
            className={`flex w-full items-center justify-center rounded-md py-2.5 transition-colors ${
              props.open
                ? 'text-[var(--color-ink)] hover:bg-[var(--color-surface-1)]'
                : 'text-[var(--color-accent)] hover:bg-[var(--color-surface-1)]'
            }`}
          >
            <ToggleIcon size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
    </nav>
  );
}
