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

const DISPLAY_KINDS = ['table', 'list', 'ledger', 'chart', 'graph'] as const;
type DisplayKindOption = (typeof DISPLAY_KINDS)[number];

interface DisplayConfig {
  displayKind: DisplayKindOption;
  title: string;
  sourceModuleIds: string[];
}

const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  displayKind: 'table',
  title: 'Display',
  sourceModuleIds: [],
};

export function DisplayConfigForm(props: { companyId: string; moduleId: string }) {
  const [config, setConfig] = useState<DisplayConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const mod = await api<{ module: { config: Partial<DisplayConfig> } }>(
          `/api/companies/${props.companyId}/modules/${props.moduleId}`,
        );
        if (stopped) return;
        setConfig({ ...DEFAULT_DISPLAY_CONFIG, ...mod.module.config });
      } catch {
        if (!stopped) setMessage('Could not load display settings.');
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, [props.companyId, props.moduleId]);

  async function updateDisplayKind(displayKind: DisplayKindOption) {
    if (!config) return;
    const next = { ...config, displayKind };
    const prev = config;
    setConfig(next);
    setSaving(true);
    try {
      await api(`/api/companies/${props.companyId}/modules/${props.moduleId}`, {
        method: 'PATCH',
        body: { config: next },
      });
      setMessage(null);
    } catch {
      setConfig(prev);
      setMessage('Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function saveTitle(title: string) {
    if (!config || title.trim() === config.title) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setMessage('Title is required.');
      return;
    }
    const next = { ...config, title: trimmed };
    const prev = config;
    setConfig(next);
    setSaving(true);
    try {
      await api(`/api/companies/${props.companyId}/modules/${props.moduleId}`, {
        method: 'PATCH',
        body: { config: next },
      });
      setMessage(null);
    } catch {
      setConfig(prev);
      setMessage('Save failed.');
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <div className="border-t border-[var(--color-line)] pt-4 text-xs text-[var(--color-ink-faint)]">
        {message ?? 'Loading display settings…'}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 border-t border-[var(--color-line)] pt-4">
      <span className="text-xs text-[var(--color-ink-dim)]">Display settings</span>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Kind</span>
        <select
          value={config.displayKind}
          onChange={(e) => void updateDisplayKind(e.target.value as DisplayKindOption)}
          disabled={saving}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        >
          {DISPLAY_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Title</span>
        <input
          defaultValue={config.title}
          key={`${props.moduleId}-${config.title}`}
          onBlur={(e) => void saveTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          maxLength={80}
          disabled={saving}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </label>
      {message && <p className="text-xs text-[var(--color-block)]">{message}</p>}
    </div>
  );
}

type Curiosity = 'conservative' | 'balanced' | 'exploratory';

interface ResearchConfig {
  topicScope: string;
  curiosity: Curiosity;
  cadenceMinutes: number;
  targetLibraryIds: string[];
  sourceAllowlist: string[];
  sourceBlocklist: string[];
}

interface LibraryOption {
  id: string;
  name: string;
}

const DEFAULT_RESEARCH_CONFIG: Omit<ResearchConfig, 'topicScope'> = {
  curiosity: 'balanced',
  cadenceMinutes: 180,
  targetLibraryIds: [],
  sourceAllowlist: [],
  sourceBlocklist: [],
};

export function ResearchConfigForm(props: { companyId: string; moduleId: string }) {
  const [config, setConfig] = useState<ResearchConfig | null>(null);
  const [libraries, setLibraries] = useState<LibraryOption[]>([]);
  const [allowlistText, setAllowlistText] = useState('');
  const [blocklistText, setBlocklistText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const [mod, libs] = await Promise.all([
          api<{ module: { config: Partial<ResearchConfig> } }>(
            `/api/companies/${props.companyId}/modules/${props.moduleId}`,
          ),
          api<{ libraries: LibraryOption[] }>(`/api/companies/${props.companyId}/libraries`).catch(
            () => ({ libraries: [] as LibraryOption[] }),
          ),
        ]);
        if (stopped) return;
        const merged: ResearchConfig = {
          topicScope: mod.module.config.topicScope ?? '',
          ...DEFAULT_RESEARCH_CONFIG,
          ...mod.module.config,
        };
        setConfig(merged);
        setLibraries(libs.libraries);
        setAllowlistText(merged.sourceAllowlist.join(', '));
        setBlocklistText(merged.sourceBlocklist.join(', '));
      } catch {
        if (!stopped) setMessage('Could not load research settings.');
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, [props.companyId, props.moduleId]);

  async function saveConfig(next: ResearchConfig) {
    const prev = config;
    setConfig(next);
    setSaving(true);
    try {
      await api(`/api/companies/${props.companyId}/modules/${props.moduleId}`, {
        method: 'PATCH',
        body: { config: next },
      });
      setMessage(null);
    } catch {
      setConfig(prev);
      setMessage('Save failed.');
    } finally {
      setSaving(false);
    }
  }

  function parseCsvList(value: string): string[] {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (!config) {
    return (
      <div className="border-t border-[var(--color-line)] pt-4 text-xs text-[var(--color-ink-faint)]">
        {message ?? 'Loading research settings…'}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 border-t border-[var(--color-line)] pt-4">
      <span className="text-xs text-[var(--color-ink-dim)]">Research settings</span>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Curiosity</span>
        <select
          value={config.curiosity}
          disabled={saving}
          onChange={(e) => void saveConfig({ ...config, curiosity: e.target.value as Curiosity })}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        >
          <option value="conservative">conservative</option>
          <option value="balanced">balanced</option>
          <option value="exploratory">exploratory</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Cadence (minutes)</span>
        <input
          type="number"
          min={30}
          max={1440}
          value={config.cadenceMinutes}
          disabled={saving}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(n)) setConfig({ ...config, cadenceMinutes: n });
          }}
          onBlur={() => void saveConfig(config)}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </label>
      <div className="space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Target libraries</span>
        {libraries.length === 0 ? (
          <p className="text-[10px] text-[var(--color-ink-faint)]">No libraries yet.</p>
        ) : (
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {libraries.map((lib) => {
              const selected = config.targetLibraryIds.includes(lib.id);
              return (
                <button
                  key={lib.id}
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    const nextIds = selected
                      ? config.targetLibraryIds.filter((id) => id !== lib.id)
                      : [...config.targetLibraryIds, lib.id];
                    void saveConfig({ ...config, targetLibraryIds: nextIds });
                  }}
                  className={`flex w-full rounded-md border px-2 py-1 text-left text-[11px] ${
                    selected
                      ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                      : 'border-[var(--color-line)] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {lib.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Source allowlist</span>
        <input
          value={allowlistText}
          disabled={saving}
          onChange={(e) => setAllowlistText(e.target.value)}
          onBlur={() => {
            const next = { ...config, sourceAllowlist: parseCsvList(allowlistText) };
            void saveConfig(next);
          }}
          placeholder="Comma-separated domains or feeds"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Source blocklist</span>
        <input
          value={blocklistText}
          disabled={saving}
          onChange={(e) => setBlocklistText(e.target.value)}
          onBlur={() => {
            const next = { ...config, sourceBlocklist: parseCsvList(blocklistText) };
            void saveConfig(next);
          }}
          placeholder="Comma-separated domains or feeds"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </label>
      {message && <p className="text-xs text-[var(--color-block)]">{message}</p>}
    </div>
  );
}
