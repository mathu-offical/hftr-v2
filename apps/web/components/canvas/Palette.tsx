'use client';

import { useState } from 'react';
import type { ModuleType } from '@hftr/contracts';
import { MODULE_VISUALS } from './types';

/** Default configs satisfying each type's contract schema (minimum viable). */
const ADDABLE: Array<{ type: ModuleType; defaultConfig: unknown; hint: string }> = [
  {
    type: 'research',
    defaultConfig: { topicScope: 'General market research' },
    hint: 'Explores topics, feeds libraries',
  },
  { type: 'library', defaultConfig: { topicScope: 'General' }, hint: 'Curated knowledge store' },
  {
    type: 'live_api',
    defaultConfig: { venue: 'paper_sim', instruments: ['SPY'] },
    hint: 'Market data feed',
  },
  {
    type: 'trend',
    defaultConfig: { focus: 'Broad market momentum' },
    hint: 'Finds tradeable trends',
  },
  { type: 'trading', defaultConfig: { subtype: 'day' }, hint: 'Executes a strategy pipeline' },
  { type: 'policy', defaultConfig: {}, hint: 'Binds risk/goal envelopes' },
  { type: 'simulator', defaultConfig: {}, hint: 'Paper-tests strategies' },
  { type: 'analyzer', defaultConfig: {}, hint: 'Reviews outcomes' },
  { type: 'fund_router', defaultConfig: {}, hint: 'Moves allocations under policy' },
];

/**
 * Floating module store, layered over the canvas (top-left). Math is absent
 * by design — it is auto-created with the company and non-deletable (D-008).
 */
export function Palette(props: {
  onAdd: (type: ModuleType, name: string, config: unknown) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open module store"
        className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-1)]/90 px-3.5 py-2 text-xs text-[var(--color-ink-dim)] shadow-lg backdrop-blur hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
      >
        <span className="text-[var(--color-accent)]">+</span>
        Add module
      </button>
    );
  }

  return (
    <aside className="absolute left-4 top-4 z-20 flex max-h-[calc(100%-2rem)] w-56 flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)]/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Module store
        </span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close module store"
          className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {ADDABLE.map(({ type, defaultConfig, hint }) => {
          const visual = MODULE_VISUALS[type];
          return (
            <button
              key={type}
              onClick={() => props.onAdd(type, visual.label, defaultConfig)}
              className="group flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-[var(--color-surface-2)]"
            >
              <span className="flex items-center gap-2 text-sm text-[var(--color-ink-dim)] group-hover:text-[var(--color-ink)]">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: visual.hue }}
                />
                {visual.label}
              </span>
              <span className="pl-4 text-[10px] leading-tight text-[var(--color-ink-faint)]">
                {hint}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
