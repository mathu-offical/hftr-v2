'use client';

import { useState } from 'react';
import { ENGINE_TEMPLATES, type EngineTemplate, type ModuleType } from '@hftr/contracts';
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

/** Store categories (DevSpecs/dev-notebook.md: divide nodes by category). */
const CATEGORIES: Array<{ label: string; types: ModuleType[] }> = [
  { label: 'Research & knowledge', types: ['research', 'library'] },
  { label: 'Data', types: ['live_api'] },
  { label: 'Signals', types: ['trend'] },
  { label: 'Trading', types: ['trading'] },
  { label: 'Controls', types: ['policy', 'fund_router'] },
  { label: 'Utilities', types: ['simulator', 'analyzer'] },
];

/**
 * Floating module store, layered over the canvas (top-left). Two sections:
 * single modules grouped by category, and insertable end-to-end engine
 * templates that require user inputs before insertion (dev-notebook spec).
 * Math is absent by design — auto-created with the company (D-008).
 */
export function Palette(props: {
  onAdd: (type: ModuleType, name: string, config: unknown) => void;
  onInsertEngine: (engine: EngineTemplate, inputs: Record<string, string>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<'modules' | 'engines'>('modules');
  const [configuring, setConfiguring] = useState<EngineTemplate | null>(null);

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
    <aside className="absolute left-4 top-4 z-20 flex max-h-[calc(100%-2rem)] w-64 flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)]/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
        <div className="flex gap-1">
          {(
            [
              { id: 'modules', label: 'Modules' },
              { id: 'engines', label: 'Engines' },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSection(s.id);
                setConfiguring(null);
              }}
              className={`rounded px-2 py-0.5 text-[11px] ${
                section === s.id
                  ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                  : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close module store"
          className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {section === 'modules' &&
          CATEGORIES.map((cat) => (
            <div key={cat.label} className="mb-2">
              <div className="px-2 pb-1 pt-1.5 text-[9px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                {cat.label}
              </div>
              {cat.types.map((type) => {
                const entry = ADDABLE.find((a) => a.type === type);
                if (!entry) return null;
                const visual = MODULE_VISUALS[type];
                return (
                  <button
                    key={type}
                    onClick={() => props.onAdd(type, visual.label, entry.defaultConfig)}
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
                      {entry.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}

        {section === 'engines' && !configuring && (
          <div className="space-y-1.5">
            {ENGINE_TEMPLATES.map((engine) => (
              <button
                key={engine.id}
                disabled={!engine.available}
                onClick={() => setConfiguring(engine)}
                className="w-full rounded-lg border border-[var(--color-line)] px-2.5 py-2 text-left hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-ink)]">{engine.label}</span>
                  {!engine.available && (
                    <span className="text-[9px] uppercase tracking-wide text-[var(--color-warn)]">
                      soon
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-ink-faint)]">
                  {engine.available ? engine.description : engine.unavailableReason}
                </p>
              </button>
            ))}
          </div>
        )}

        {section === 'engines' && configuring && (
          <EngineConfigForm
            engine={configuring}
            onCancel={() => setConfiguring(null)}
            onInsert={async (inputs) => {
              await props.onInsertEngine(configuring, inputs);
              setConfiguring(null);
              setOpen(false);
            }}
          />
        )}
      </div>
    </aside>
  );
}

/** Collects the engine's required user inputs before insertion. */
function EngineConfigForm(props: {
  engine: EngineTemplate;
  onCancel: () => void;
  onInsert: (inputs: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.engine.inputs.map((i) => [i.key, i.options?.[0] ?? ''])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = props.engine.inputs.some((i) => !values[i.key]?.trim());

  async function insert() {
    setBusy(true);
    setError(null);
    try {
      await props.onInsert(values);
    } catch {
      setError('Insert failed — some modules may have been created.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 p-1">
      <div>
        <div className="text-sm text-[var(--color-ink)]">{props.engine.label}</div>
        <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-ink-faint)]">
          {props.engine.description}
        </p>
      </div>
      {props.engine.inputs.map((input) => (
        <label key={input.key} className="block space-y-1">
          <span className="text-[11px] text-[var(--color-ink-dim)]">{input.label}</span>
          {input.kind === 'select' ? (
            <select
              value={values[input.key]}
              onChange={(e) => setValues((v) => ({ ...v, [input.key]: e.target.value }))}
              className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-xs outline-none"
            >
              {input.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={values[input.key]}
              onChange={(e) => setValues((v) => ({ ...v, [input.key]: e.target.value }))}
              placeholder={input.placeholder}
              className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
            />
          )}
        </label>
      ))}
      <div className="flex gap-2">
        <button
          onClick={insert}
          disabled={busy || missing}
          className="flex-1 rounded-md border border-[var(--color-accent)] px-2 py-1.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
        >
          {busy ? 'Inserting…' : 'Insert engine'}
        </button>
        <button
          onClick={props.onCancel}
          className="rounded-md border border-[var(--color-line)] px-2 py-1.5 text-xs text-[var(--color-ink-dim)]"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-[10px] text-[var(--color-block)]">{error}</p>}
    </div>
  );
}
