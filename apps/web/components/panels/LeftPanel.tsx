'use client';

import { useState } from 'react';

type Tab = 'research' | 'data';

interface ModuleOption {
  id: string;
  name: string;
  type: string;
  status: string;
  config: Record<string, unknown>;
}

interface LinkRow {
  fromModuleId: string;
  toModuleId: string;
  linkKind: string;
}

/**
 * Left panel (ui-ux spec): Research curation spaces and Data sources.
 * Research gets the 3D galaxy view at the research milestone; today it lists
 * research/trend scopes. Data sources show which nodes each source hydrates
 * (derived from data_feed links). Collapsible to a slim strip.
 */
export function LeftPanel(props: { modules: ModuleOption[]; links: LinkRow[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('research');

  const research = props.modules.filter((m) => m.type === 'research' || m.type === 'trend');
  const sources = props.modules.filter((m) => m.type === 'live_api' || m.type === 'library');
  const nameOf = (id: string) => props.modules.find((m) => m.id === id)?.name ?? 'unknown';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="border-r border-[var(--color-line)] bg-[var(--color-surface-1)] px-1.5 text-[10px] tracking-widest text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        style={{ writingMode: 'vertical-rl' }}
      >
        RESEARCH · DATA
      </button>
    );
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface-1)]">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
        <div className="flex gap-1">
          {(
            [
              { id: 'research', label: 'Research' },
              { id: 'data', label: 'Data sources' },
            ] as { id: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded px-2 py-1 text-xs ${
                tab === t.id
                  ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                  : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          aria-label="Collapse left panel"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm">
        {tab === 'research' && (
          <>
            {research.length === 0 ? (
              <p className="px-1 text-xs text-[var(--color-ink-faint)]">
                No research or trend modules yet — add them from the canvas palette. The 3D research
                galaxy lands with the research milestone.
              </p>
            ) : (
              <ul className="space-y-2">
                {research.map((m) => (
                  <li key={m.id} className="rounded-lg border border-[var(--color-line)] p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{m.name}</span>
                      <span className="text-[10px] uppercase text-[var(--color-ink-faint)]">
                        {m.type}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--color-ink-dim)]">
                      {String(m.config.topicScope ?? m.config.focus ?? 'scope not configured yet')}
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--color-ink-faint)]">{m.status}</div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === 'data' && (
          <>
            {sources.length === 0 ? (
              <p className="px-1 text-xs text-[var(--color-ink-faint)]">
                No data sources yet — add a Live API or Library module from the canvas palette.
              </p>
            ) : (
              <ul className="space-y-2">
                {sources.map((m) => {
                  const hydrates = props.links
                    .filter((l) => l.fromModuleId === m.id && l.linkKind === 'data_feed')
                    .map((l) => nameOf(l.toModuleId));
                  return (
                    <li key={m.id} className="rounded-lg border border-[var(--color-line)] p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{m.name}</span>
                        <span className="text-[10px] uppercase text-[var(--color-ink-faint)]">
                          {m.type === 'live_api' ? 'live api' : 'library'}
                        </span>
                      </div>
                      {m.type === 'live_api' && (
                        <div className="mt-1 text-[11px] text-[var(--color-ink-dim)]">
                          venue {String(m.config.venue ?? '—')} ·{' '}
                          {Array.isArray(m.config.instruments)
                            ? `${m.config.instruments.length} instruments`
                            : 'no instruments'}
                        </div>
                      )}
                      <div className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
                        {hydrates.length > 0
                          ? `hydrates: ${hydrates.join(', ')}`
                          : 'not feeding any node yet'}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
