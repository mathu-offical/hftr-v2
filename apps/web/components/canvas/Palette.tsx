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
 * Left rail: add modules to the canvas. Math is absent by design — it is
 * auto-created with the company and non-deletable (D-008).
 */
export function Palette(props: {
  onAdd: (type: ModuleType, name: string, config: unknown) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface-1)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)] hover:text-[var(--color-ink-dim)]"
      >
        Add module {open ? '−' : '+'}
      </button>
      {open && (
        <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {ADDABLE.map(({ type, defaultConfig, hint }) => {
            const visual = MODULE_VISUALS[type];
            return (
              <button
                key={type}
                onClick={() => props.onAdd(type, visual.label, defaultConfig)}
                title={hint}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--color-ink-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: visual.hue }}
                />
                {visual.label}
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
