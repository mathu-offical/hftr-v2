'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { ACTIVITY_REFRESH_EVENT } from './PaperTradeForm';

/**
 * Type-specific module controls for the inspector. Trend modules get a scan
 * trigger; trading modules get strategy-family configuration backed by the
 * seeded catalog. Config writes go through the schema-validated PATCH.
 */

export function TrendScanForm(props: { companyId: string; moduleId: string; disabled: boolean }) {
  const [symbols, setSymbols] = useState('AAPL, MSFT, NVDA, TSLA');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function scan() {
    const list = symbols
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (list.length === 0) {
      setMessage('Enter at least one symbol.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/modules/${props.moduleId}/scan`, {
        method: 'POST',
        body: { symbols: list, lookbackMinutes: 60 },
      });
      setMessage('Scan complete — see Trends.');
      window.dispatchEvent(new Event(ACTIVITY_REFRESH_EVENT));
    } catch {
      setMessage('Scan rejected.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2.5 border-t border-[var(--color-line)] pt-4">
      <span className="text-xs text-[var(--color-ink-dim)]">Trend scan</span>
      <input
        value={symbols}
        onChange={(e) => setSymbols(e.target.value)}
        placeholder="Symbols, comma separated"
        aria-label="Symbols to scan"
        className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-sm uppercase outline-none focus:border-[var(--color-accent)]"
      />
      <button
        onClick={scan}
        disabled={busy || props.disabled}
        className="w-full rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
      >
        {busy ? 'Scanning…' : 'Scan now'}
      </button>
      {props.disabled && (
        <p className="text-xs text-[var(--color-ink-faint)]">Activate the module to scan.</p>
      )}
      {message && <p className="text-xs text-[var(--color-ink-dim)]">{message}</p>}
    </div>
  );
}

export function WatchlistForm(props: { companyId: string; moduleId: string }) {
  const [symbol, setSymbol] = useState('');
  const [bias, setBias] = useState<'long' | 'short' | 'neutral'>('neutral');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function add() {
    const sym = symbol.trim().toUpperCase();
    if (!sym) {
      setMessage('Enter a symbol.');
      return;
    }
    try {
      await api(`/api/companies/${props.companyId}/watchlists`, {
        method: 'POST',
        body: { moduleId: props.moduleId, symbol: sym, bias, note },
      });
      setSymbol('');
      setNote('');
      setMessage(`${sym} added to watch list.`);
      window.dispatchEvent(new Event(ACTIVITY_REFRESH_EVENT));
    } catch {
      setMessage('Could not add to watch list.');
    }
  }

  return (
    <div className="space-y-2 border-t border-[var(--color-line)] pt-4">
      <span className="text-xs text-[var(--color-ink-dim)]">Watch list</span>
      <div className="flex gap-1.5">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          maxLength={12}
          placeholder="Symbol"
          aria-label="Watch symbol"
          className="w-full min-w-0 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-sm uppercase outline-none focus:border-[var(--color-accent)]"
        />
        <select
          value={bias}
          onChange={(e) => setBias(e.target.value as typeof bias)}
          aria-label="Bias"
          className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none"
        >
          <option value="neutral">neutral</option>
          <option value="long">long</option>
          <option value="short">short</option>
        </select>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="Note (optional)"
        aria-label="Watch note"
        className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
      />
      <button
        onClick={add}
        className="w-full rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      >
        Add to watch list
      </button>
      {message && <p className="text-xs text-[var(--color-ink-dim)]">{message}</p>}
    </div>
  );
}

interface CatalogEntry {
  entryKey: string;
  title: string;
  tier: string | null;
}

interface TradingConfig {
  subtype: string;
  strategyFamilies: string[];
  exitTimelineDays: number;
  cadenceMinutes: number;
}

const DEFAULT_TRADING_CONFIG: TradingConfig = {
  subtype: 'day',
  strategyFamilies: [],
  exitTimelineDays: 1,
  cadenceMinutes: 5,
};

export function TradingConfigForm(props: { companyId: string; moduleId: string }) {
  const [families, setFamilies] = useState<CatalogEntry[]>([]);
  const [config, setConfig] = useState<TradingConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const [cat, mod] = await Promise.all([
          api<{ entries: CatalogEntry[] }>('/api/catalogs/strategy_families'),
          api<{ module: { config: Partial<TradingConfig> } }>(
            `/api/companies/${props.companyId}/modules/${props.moduleId}`,
          ),
        ]);
        if (stopped) return;
        setFamilies(cat.entries);
        setConfig({ ...DEFAULT_TRADING_CONFIG, ...mod.module.config });
      } catch {
        if (!stopped) setMessage('Could not load strategy catalog.');
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, [props.companyId, props.moduleId]);

  async function toggleFamily(key: string) {
    if (!config) return;
    const next = config.strategyFamilies.includes(key)
      ? config.strategyFamilies.filter((f) => f !== key)
      : [...config.strategyFamilies, key];
    const nextConfig = { ...config, strategyFamilies: next };
    setConfig(nextConfig);
    try {
      await api(`/api/companies/${props.companyId}/modules/${props.moduleId}`, {
        method: 'PATCH',
        body: { config: nextConfig },
      });
      setMessage(null);
    } catch {
      setConfig(config); // revert
      setMessage('Save failed.');
    }
  }

  if (!config) {
    return (
      <div className="border-t border-[var(--color-line)] pt-4 text-xs text-[var(--color-ink-faint)]">
        {message ?? 'Loading strategy catalog…'}
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-[var(--color-line)] pt-4">
      <span className="text-xs text-[var(--color-ink-dim)]">
        Strategy families ({config.strategyFamilies.length} selected)
      </span>
      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {families.map((f) => {
          const selected = config.strategyFamilies.includes(f.entryKey);
          return (
            <button
              key={f.entryKey}
              onClick={() => toggleFamily(f.entryKey)}
              className={`flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-xs ${
                selected
                  ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                  : 'border-[var(--color-line)] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]'
              }`}
            >
              <span className="truncate">{f.title.replace(/_/g, ' ')}</span>
              {f.tier && (
                <span className="ml-2 shrink-0 text-[10px] uppercase text-[var(--color-ink-faint)]">
                  {f.tier.replace(/_/g, ' ').toLowerCase()}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {message && <p className="text-xs text-[var(--color-block)]">{message}</p>}
    </div>
  );
}
