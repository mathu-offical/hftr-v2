'use client';

import { useMemo, useState } from 'react';
import {
  COMPANY_UNIVERSE_EXCLUDE_MAX,
  SECTOR_FOCUS_GROUP_DEFS,
  addSectorGroup,
  groupLabel,
  groupsFromSectorFocuses,
  overlapPeerLabels,
  parseUniverseExcludeDraft,
  presetsForGroup,
  removeSectorGroup,
  type SectorFocusGroupId,
} from '@hftr/contracts';
import { api } from '@/lib/client';

/**
 * Company drawer Sectors tab (D-106): refine group specifics downward and
 * curate a separate universe exclude symbol list.
 */
export function CompanySectorsTab(props: {
  companyId: string;
  initialFocuses: string[];
  initialExcludes: string[];
}) {
  const [focuses, setFocuses] = useState(props.initialFocuses);
  const [excludes, setExcludes] = useState(props.initialExcludes);
  const [excludeDraft, setExcludeDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedGroups = useMemo(() => groupsFromSectorFocuses(focuses), [focuses]);

  async function save(nextFocuses: string[], nextExcludes: string[]) {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}`, {
        method: 'PATCH',
        body: { sectorFocuses: nextFocuses, universeExcludes: nextExcludes },
      });
      setFocuses(nextFocuses);
      setExcludes(nextExcludes);
      setMessage('Sectors saved — baseline Sector knowledge re-seeds when focuses change.');
    } catch {
      setMessage('Save failed.');
    } finally {
      setBusy(false);
    }
  }

  function toggleGroup(groupId: SectorFocusGroupId) {
    const next = selectedGroups.includes(groupId)
      ? removeSectorGroup(focuses, groupId)
      : addSectorGroup(focuses, groupId);
    void save(next, excludes);
  }

  function toggleSpecific(label: string, groupId: SectorFocusGroupId) {
    if (!selectedGroups.includes(groupId)) return;
    const next = focuses.includes(label)
      ? focuses.filter((item) => item !== label)
      : [...focuses, label];
    // Drop empty groups implicitly (no labels left for that group).
    void save(next, excludes);
  }

  function addExcludesFromDraft() {
    const parsed = parseUniverseExcludeDraft(excludeDraft);
    if (parsed.length === 0) return;
    const merged = [...excludes];
    for (const symbol of parsed) {
      if (merged.includes(symbol)) continue;
      if (merged.length >= COMPANY_UNIVERSE_EXCLUDE_MAX) break;
      merged.push(symbol);
    }
    setExcludeDraft('');
    void save(focuses, merged);
  }

  function removeExclude(symbol: string) {
    void save(
      focuses,
      excludes.filter((item) => item !== symbol),
    );
  }

  return (
    <div className="space-y-6" data-testid="company-sectors-tab">
      <section className="space-y-2">
        <div>
          <h3 className="text-sm font-medium text-[var(--color-ink)]">Sector groups</h3>
          <p className="text-[11px] text-[var(--color-ink-faint)]">
            Groups set the inclusion boundary. Specifics default on; deselect to narrow data.
            Shared coverage across focuses is an intentional overlap signal.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sector groups">
          {SECTOR_FOCUS_GROUP_DEFS.map((group) => {
            const on = selectedGroups.includes(group.id);
            return (
              <button
                key={group.id}
                type="button"
                disabled={busy}
                aria-pressed={on}
                onClick={() => toggleGroup(group.id)}
                className={
                  on
                    ? 'rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)]/15 px-2.5 py-1 text-[11px] text-[var(--color-accent)] disabled:opacity-50'
                    : 'rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[11px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)]/50 disabled:opacity-50'
                }
              >
                {group.label}
              </button>
            );
          })}
        </div>
      </section>

      {selectedGroups.length === 0 ? (
        <p className="text-xs text-[var(--color-ink-faint)]">
          No sector groups selected. Add one or more groups above.
        </p>
      ) : (
        <section className="space-y-4">
          {selectedGroups.map((groupId) => {
            const presets = presetsForGroup(groupId);
            const activeCount = presets.filter((p) => focuses.includes(p.label)).length;
            return (
              <div
                key={groupId}
                className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] p-3"
              >
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h4 className="text-xs font-medium text-[var(--color-ink)]">
                    {groupLabel(groupId)}
                  </h4>
                  <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">
                    {activeCount}/{presets.length} active
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {presets.map((preset) => {
                    const on = focuses.includes(preset.label);
                    const peers = overlapPeerLabels(preset.label);
                    return (
                      <li key={preset.id}>
                        <label className="flex cursor-pointer items-start gap-2 text-[11px] text-[var(--color-ink-dim)]">
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={busy}
                            onChange={() => toggleSpecific(preset.label, groupId)}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="text-[var(--color-ink)]">{preset.label}</span>
                            {peers.length > 0 && (
                              <span className="mt-0.5 block text-[10px] text-[var(--color-ink-faint)]">
                                Overlaps: {peers.join(' · ')}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      <section className="space-y-2 border-t border-[var(--color-line)] pt-4">
        <div>
          <h3 className="text-sm font-medium text-[var(--color-ink)]">Universe excludes</h3>
          <p className="text-[11px] text-[var(--color-ink-faint)]">
            Separately curated ticker carve-outs. Further shapes the company lens after sector
            selection — not a substitute for deselecting focuses.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={excludeDraft}
            onChange={(e) => setExcludeDraft(e.target.value)}
            disabled={busy}
            placeholder="AAPL, MSFT, …"
            aria-label="Universe exclude symbols"
            className="min-w-[12rem] flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 font-mono text-xs outline-none focus:border-[var(--color-accent)]"
          />
          <button
            type="button"
            disabled={busy || !excludeDraft.trim()}
            onClick={() => addExcludesFromDraft()}
            className="rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
          >
            Add excludes
          </button>
        </div>
        {excludes.length > 0 ? (
          <div className="flex flex-wrap gap-1" data-testid="universe-excludes-selected">
            {excludes.map((symbol) => (
              <button
                key={symbol}
                type="button"
                disabled={busy}
                onClick={() => removeExclude(symbol)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-block)] hover:text-[var(--color-block)]"
                aria-label={`Remove exclude ${symbol}`}
              >
                {symbol}
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-[var(--color-ink-faint)]">No excludes yet.</p>
        )}
        <p className="font-mono text-[10px] text-[var(--color-ink-faint)]">
          {excludes.length}/{COMPANY_UNIVERSE_EXCLUDE_MAX}
        </p>
      </section>

      {message && <p className="text-xs text-[var(--color-ink-dim)]">{message}</p>}
    </div>
  );
}
