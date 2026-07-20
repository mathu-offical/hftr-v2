'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { LlmAvailabilityChips } from '@/components/shell/LlmConnectionStatus';
import { ACTIVITY_REFRESH_EVENT } from './PaperTradeForm';

function ManualControlToggle(props: {
  enabled: boolean;
  disabled?: boolean;
  onChange: (manualControl: boolean) => void | Promise<void>;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-2 text-[11px] text-[var(--color-ink-dim)]">
      <span>Manual control</span>
      <input
        type="checkbox"
        checked={props.enabled}
        disabled={props.disabled}
        onChange={(e) => void props.onChange(e.target.checked)}
        aria-label="Manual control of in-envelope levers"
        className="h-3.5 w-3.5 accent-[var(--color-accent)]"
      />
    </label>
  );
}

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-[var(--color-ink-dim)]">Trend scan</span>
        <LlmAvailabilityChips tiers={['tactical']} />
      </div>
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

type PaperRoutingMode = 'funds_only' | 'execute_on_service' | 'both_verify';

interface ExecutionBindingConfig {
  routingMode: PaperRoutingMode;
  brokerConnectionId: string | null;
  useProviderLedgerAsFundsSource: boolean;
}

interface TradingConfig {
  subtype: string;
  strategyFamilies: string[];
  exitTimelineDays: number;
  cadenceMinutes: number;
  manualControl: boolean;
  executionBinding: ExecutionBindingConfig;
}

interface BrokerOption {
  id: string;
  venue: string;
  mode: string;
  status: string;
  keyHint: string;
}

const DEFAULT_EXECUTION_BINDING: ExecutionBindingConfig = {
  routingMode: 'funds_only',
  brokerConnectionId: null,
  useProviderLedgerAsFundsSource: true,
};

const DEFAULT_TRADING_CONFIG: TradingConfig = {
  subtype: 'day',
  strategyFamilies: [],
  exitTimelineDays: 1,
  cadenceMinutes: 5,
  manualControl: false,
  executionBinding: DEFAULT_EXECUTION_BINDING,
};

const ROUTING_MODE_OPTIONS: Array<{ value: PaperRoutingMode; label: string; detail: string }> = [
  {
    value: 'funds_only',
    label: 'Funds only (default)',
    detail: 'Live quotes when entitled; fills on internal paper core. No venue submit.',
  },
  {
    value: 'execute_on_service',
    label: 'Execute on service',
    detail: 'Orders submit to the bound paper service. Requires a connected service.',
  },
  {
    value: 'both_verify',
    label: 'Both verify',
    detail: 'Internal fill + shadow service submit for BookDelta training. Requires a connected service.',
  },
];

export function TradingConfigForm(props: { companyId: string; moduleId: string }) {
  const [families, setFamilies] = useState<CatalogEntry[]>([]);
  const [config, setConfig] = useState<TradingConfig | null>(null);
  const [brokers, setBrokers] = useState<BrokerOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const [cat, mod, brokerRes] = await Promise.all([
          api<{ entries: CatalogEntry[] }>('/api/catalogs/strategy_families'),
          api<{
            module: {
              config: Partial<TradingConfig> & {
                executionBinding?: Partial<ExecutionBindingConfig> | null;
              };
            };
          }>(`/api/companies/${props.companyId}/modules/${props.moduleId}`),
          api<{ connections: BrokerOption[] }>('/api/settings/brokers').catch(() => ({
            connections: [] as BrokerOption[],
          })),
        ]);
        if (stopped) return;
        setFamilies(cat.entries);
        const rawBinding: Partial<ExecutionBindingConfig> =
          mod.module.config.executionBinding ?? {};
        setConfig({
          ...DEFAULT_TRADING_CONFIG,
          ...mod.module.config,
          executionBinding: {
            ...DEFAULT_EXECUTION_BINDING,
            ...rawBinding,
            brokerConnectionId: rawBinding.brokerConnectionId ?? null,
          },
        });
        setBrokers(
          brokerRes.connections.filter((b) => b.mode === 'paper' && b.status !== 'revoked'),
        );
      } catch {
        if (!stopped) setMessage('Could not load strategy catalog.');
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, [props.companyId, props.moduleId]);

  async function saveConfig(nextConfig: TradingConfig, prev: TradingConfig) {
    setConfig(nextConfig);
    try {
      await api(`/api/companies/${props.companyId}/modules/${props.moduleId}`, {
        method: 'PATCH',
        body: { config: nextConfig },
      });
      setMessage(null);
    } catch {
      setConfig(prev);
      setMessage('Save failed.');
    }
  }

  async function toggleFamily(key: string) {
    if (!config) return;
    const next = config.strategyFamilies.includes(key)
      ? config.strategyFamilies.filter((f) => f !== key)
      : [...config.strategyFamilies, key];
    await saveConfig({ ...config, strategyFamilies: next }, config);
  }

  if (!config) {
    return (
      <div className="border-t border-[var(--color-line)] pt-4 text-xs text-[var(--color-ink-faint)]">
        {message ?? 'Loading strategy catalog…'}
      </div>
    );
  }

  const binding = config.executionBinding;
  const elevateNeedsService =
    binding.routingMode === 'execute_on_service' || binding.routingMode === 'both_verify';
  const hasDedicatedOrCanInherit = brokers.length > 0 || binding.brokerConnectionId != null;

  return (
    <div className="space-y-2 border-t border-[var(--color-line)] pt-4">
      <span className="text-xs text-[var(--color-ink-dim)]">
        Strategy families ({config.strategyFamilies.length} selected)
      </span>
      <ManualControlToggle
        enabled={config.manualControl}
        onChange={async (manualControl) => {
          await saveConfig({ ...config, manualControl }, config);
        }}
      />

      <div className="space-y-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] p-2.5">
        <span className="text-xs font-medium text-[var(--color-ink)]">Execution binding</span>
        <p className="text-[10px] leading-snug text-[var(--color-ink-faint)]">
          Per-engine routing (D-122). Default is funds only — safest. Elevating modes require a
          connected paper service.
        </p>
        <label className="block space-y-1 text-[11px] text-[var(--color-ink-dim)]">
          <span>Routing mode</span>
          <select
            value={binding.routingMode}
            aria-label="Paper routing mode"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1.5 text-xs text-[var(--color-ink)]"
            onChange={(e) => {
              const routingMode = e.target.value as PaperRoutingMode;
              void saveConfig(
                {
                  ...config,
                  executionBinding: { ...binding, routingMode },
                },
                config,
              );
            }}
          >
            {ROUTING_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[10px] leading-snug text-[var(--color-ink-faint)]">
          {ROUTING_MODE_OPTIONS.find((o) => o.value === binding.routingMode)?.detail}
        </p>
        {elevateNeedsService && !hasDedicatedOrCanInherit && (
          <p className="text-[10px] text-[var(--color-block)]">
            No paper broker connections available. Bind a service in Settings or keep funds only.
          </p>
        )}
        <label className="block space-y-1 text-[11px] text-[var(--color-ink-dim)]">
          <span>Service connection</span>
          <select
            value={binding.brokerConnectionId ?? ''}
            aria-label="Engine broker connection"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1.5 text-xs text-[var(--color-ink)]"
            onChange={(e) => {
              const brokerConnectionId = e.target.value === '' ? null : e.target.value;
              void saveConfig(
                {
                  ...config,
                  executionBinding: { ...binding, brokerConnectionId },
                },
                config,
              );
            }}
          >
            <option value="">Inherit company broker</option>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.venue.replace(/_/g, ' ')} · ···{b.keyHint} ({b.status})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-2 text-[11px] text-[var(--color-ink-dim)]">
          <span>Use provider ledger as funds source</span>
          <input
            type="checkbox"
            checked={binding.useProviderLedgerAsFundsSource}
            aria-label="Use provider ledger as funds source"
            className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            onChange={(e) => {
              void saveConfig(
                {
                  ...config,
                  executionBinding: {
                    ...binding,
                    useProviderLedgerAsFundsSource: e.target.checked,
                  },
                },
                config,
              );
            }}
          />
        </label>
      </div>

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
type AdmissionMode = 'auto_admit_validated' | 'require_operator_approval';

interface ResearchConfig {
  topicScope: string;
  researchSubtype: string;
  curiosity: Curiosity;
  cadenceMinutes: number;
  targetLibraryIds: string[];
  sourceAllowlist: string[];
  sourceBlocklist: string[];
  admissionMode: AdmissionMode;
  manualControl: boolean;
}

interface LibraryOption {
  id: string;
  name: string;
}

const DEFAULT_RESEARCH_CONFIG: Omit<ResearchConfig, 'topicScope'> = {
  researchSubtype: 'external_web',
  curiosity: 'balanced',
  cadenceMinutes: 180,
  targetLibraryIds: [],
  sourceAllowlist: [],
  sourceBlocklist: [],
  admissionMode: 'auto_admit_validated',
  manualControl: false,
};

const RESEARCH_SUBTYPE_OPTIONS = [
  { value: 'external_web', label: 'External web' },
  { value: 'external_filings', label: 'Filings & fundamentals' },
  { value: 'external_market_news', label: 'Market news' },
  { value: 'specialty_desk', label: 'Specialty desk' },
  { value: 'event_catalyst', label: 'Event catalyst' },
  { value: 'crypto_onchain_context', label: 'Crypto on-chain context' },
  { value: 'prediction_niche', label: 'Prediction niche' },
  { value: 'microstructure_context', label: 'Microstructure context' },
] as const;

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
        <span className="text-[11px] text-[var(--color-ink-dim)]">Research subtype</span>
        <select
          value={config.researchSubtype}
          disabled={saving}
          onChange={(e) => void saveConfig({ ...config, researchSubtype: e.target.value })}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        >
          {RESEARCH_SUBTYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
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
        <span className="text-[11px] text-[var(--color-ink-dim)]">Admission mode</span>
        <select
          value={config.admissionMode}
          disabled={saving}
          onChange={(e) =>
            void saveConfig({ ...config, admissionMode: e.target.value as AdmissionMode })
          }
          aria-label="Research admission mode"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        >
          <option value="auto_admit_validated">Auto-admit after validation</option>
          <option value="require_operator_approval">Require operator approval</option>
        </select>
      </label>
      <ManualControlToggle
        enabled={config.manualControl}
        disabled={saving}
        onChange={(manualControl) => void saveConfig({ ...config, manualControl })}
      />
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

interface LibrarianConfig {
  topicScope: string;
  librarianSubtype: string;
  cadenceMinutes: number;
  targetLibraryIds: string[];
  seedProtect: boolean;
  manualControl: boolean;
}

const DEFAULT_LIBRARIAN_CONFIG: Omit<LibrarianConfig, 'topicScope'> = {
  librarianSubtype: 'librarian_relevance',
  cadenceMinutes: 360,
  targetLibraryIds: [],
  seedProtect: false,
  manualControl: false,
};

const LIBRARIAN_SUBTYPE_OPTIONS = [
  { value: 'librarian_relevance', label: 'Relevance & hygiene' },
  { value: 'librarian_seed_keeper', label: 'Seed keeper' },
] as const;

export function LibrarianConfigForm(props: { companyId: string; moduleId: string }) {
  const [config, setConfig] = useState<LibrarianConfig | null>(null);
  const [libraries, setLibraries] = useState<LibraryOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const [mod, libs] = await Promise.all([
          api<{ module: { config: Partial<LibrarianConfig> } }>(
            `/api/companies/${props.companyId}/modules/${props.moduleId}`,
          ),
          api<{ libraries: LibraryOption[] }>(`/api/companies/${props.companyId}/libraries`).catch(
            () => ({ libraries: [] as LibraryOption[] }),
          ),
        ]);
        if (stopped) return;
        setConfig({
          topicScope: mod.module.config.topicScope ?? '',
          ...DEFAULT_LIBRARIAN_CONFIG,
          ...mod.module.config,
        });
        setLibraries(libs.libraries);
      } catch {
        if (!stopped) setMessage('Could not load librarian settings.');
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, [props.companyId, props.moduleId]);

  async function saveConfig(next: LibrarianConfig) {
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
        {message ?? 'Loading librarian settings…'}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 border-t border-[var(--color-line)] pt-4">
      <span className="text-xs text-[var(--color-ink-dim)]">Librarian settings</span>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Librarian subtype</span>
        <select
          value={config.librarianSubtype}
          disabled={saving}
          onChange={(e) => void saveConfig({ ...config, librarianSubtype: e.target.value })}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        >
          {LIBRARIAN_SUBTYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-2">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Protect seeded mechanisms</span>
        <input
          type="checkbox"
          checked={config.seedProtect}
          disabled={saving}
          onChange={(e) => void saveConfig({ ...config, seedProtect: e.target.checked })}
          className="h-3.5 w-3.5 accent-[var(--color-accent)]"
        />
      </label>
      <ManualControlToggle
        enabled={config.manualControl}
        disabled={saving}
        onChange={(manualControl) => void saveConfig({ ...config, manualControl })}
      />
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
      {message && <p className="text-xs text-[var(--color-block)]">{message}</p>}
    </div>
  );
}

interface LibraryConfig {
  topicScope: string;
  masterLibrary: boolean;
  libraryClass: string;
  ownerEngineInstanceId?: string | null;
  nestedModuleIds?: string[];
  engineDataHub?: boolean;
  shelves?: Array<{
    origin: string;
    stream: string;
    label?: string;
  }>;
  shelfOutputs?: Array<{
    origin: string;
    stream: string;
    bus?: 'data_out';
    enabled: boolean;
    streamId?: string;
    streamDescriptor?: string;
  }>;
  topicFeed?: { enabled: boolean };
}

const DEFAULT_LIBRARY_CONFIG: Omit<LibraryConfig, 'topicScope'> = {
  masterLibrary: false,
  libraryClass: 'topic_runtime',
  ownerEngineInstanceId: null,
  nestedModuleIds: [],
  engineDataHub: false,
};

const LIBRARY_CLASS_OPTIONS = [
  { value: 'seeded_mechanisms', label: 'Seeded mechanisms' },
  { value: 'topic_runtime', label: 'Topic runtime' },
  { value: 'market_history', label: 'Market history' },
  { value: 'runtime_market_cache', label: 'Runtime market cache' },
  { value: 'runtime_app_logs', label: 'Runtime app logs' },
  { value: 'specialty_evidence', label: 'Specialty evidence' },
  { value: 'master_graph', label: 'Master graph' },
  { value: 'engine_data_hub', label: 'Engine data hub' },
] as const;

export function LibraryConfigForm(props: { companyId: string; moduleId: string }) {
  const [config, setConfig] = useState<LibraryConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const mod = await api<{ module: { config: Partial<LibraryConfig> } }>(
          `/api/companies/${props.companyId}/modules/${props.moduleId}`,
        );
        if (stopped) return;
        setConfig({
          topicScope: mod.module.config.topicScope ?? '',
          ...DEFAULT_LIBRARY_CONFIG,
          ...mod.module.config,
        });
      } catch {
        if (!stopped) setMessage('Could not load library settings.');
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, [props.companyId, props.moduleId]);

  async function saveConfig(next: LibraryConfig) {
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
        {message ?? 'Loading library settings…'}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 border-t border-[var(--color-line)] pt-4">
      <span className="text-xs text-[var(--color-ink-dim)]">Library settings</span>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Library class</span>
        <select
          value={config.libraryClass}
          disabled={saving}
          onChange={(e) => void saveConfig({ ...config, libraryClass: e.target.value })}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        >
          {LIBRARY_CLASS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {(config.libraryClass === 'engine_data_hub' || config.engineDataHub) && (
        <div className="space-y-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-[10px] text-[var(--color-ink-dim)]">
          <p className="font-medium uppercase tracking-wider">Engine Data Hub (D-216)</p>
          <p className="truncate font-mono text-[9px] text-[var(--color-ink-faint)]">
            Owner: {config.ownerEngineInstanceId ?? '—'}
          </p>
          <p>Nested modules: {(config.nestedModuleIds ?? []).length}</p>
          <p>Shelves: {(config.shelves ?? []).length || 12} (origin × stream)</p>
          <label className="flex items-center gap-2 text-[10px] text-[var(--color-ink)]">
            <input
              type="checkbox"
              checked={config.topicFeed?.enabled ?? true}
              disabled={saving}
              onChange={(e) =>
                void saveConfig({
                  ...config,
                  topicFeed: { enabled: e.target.checked },
                })
              }
            />
            Live topic feed
          </label>
          {(config.shelfOutputs ?? []).length > 0 && (
            <div className="max-h-40 space-y-1 overflow-y-auto border-t border-[var(--color-line)] pt-1.5">
              <p className="text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                Shelf outs (data_out)
              </p>
              {(config.shelfOutputs ?? []).map((out) => {
                const key = `${out.origin}|${out.stream}`;
                return (
                  <label
                    key={key}
                    className="flex items-start gap-2 text-[10px] text-[var(--color-ink)]"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={out.enabled}
                      disabled={saving}
                      onChange={(e) => {
                        const nextOuts = (config.shelfOutputs ?? []).map((row) =>
                          row.origin === out.origin && row.stream === out.stream
                            ? { ...row, enabled: e.target.checked }
                            : row,
                        );
                        void saveConfig({ ...config, shelfOutputs: nextOuts });
                      }}
                    />
                    <span>
                      {out.streamDescriptor ?? `${out.origin} · ${out.stream}`}
                      <span className="block font-mono text-[8px] text-[var(--color-ink-faint)]">
                        {out.streamId ?? `shelf:${out.origin}:${out.stream}`}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
      {message && <p className="text-xs text-[var(--color-block)]">{message}</p>}
    </div>
  );
}

type MathConfig = {
  mathType: string;
};

const DEFAULT_MATH_CONFIG: MathConfig = { mathType: 'company_hub' };

const MATH_TYPE_OPTIONS = [
  { value: 'company_hub', label: 'Company hub' },
  { value: 'fund_path', label: 'Fund path' },
  { value: 'desk_execution', label: 'Desk execution' },
  { value: 'trend_signal', label: 'Trend signal' },
  { value: 'research_metric', label: 'Research metric' },
  { value: 'analyzer_reconcile', label: 'Analyzer reconcile' },
  { value: 'simulator_sandbox', label: 'Simulator sandbox' },
  { value: 'session_calendar', label: 'Session calendar' },
] as const;

export function MathConfigForm(props: { companyId: string; moduleId: string }) {
  const [config, setConfig] = useState<MathConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const mod = await api<{ module: { config: Partial<MathConfig> } }>(
          `/api/companies/${props.companyId}/modules/${props.moduleId}`,
        );
        if (stopped) return;
        setConfig({ ...DEFAULT_MATH_CONFIG, ...mod.module.config });
      } catch {
        if (!stopped) setMessage('Could not load Math settings.');
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, [props.companyId, props.moduleId]);

  async function saveConfig(next: MathConfig) {
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
        {message ?? 'Loading Math settings…'}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 border-t border-[var(--color-line)] pt-4">
      <span className="text-xs text-[var(--color-ink-dim)]">Math type</span>
      <select
        value={config.mathType}
        disabled={saving}
        onChange={(e) => void saveConfig({ ...config, mathType: e.target.value })}
        className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
      >
        {MATH_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {message && <p className="text-xs text-[var(--color-block)]">{message}</p>}
    </div>
  );
}

interface ClockConfig {
  timezone: string;
  displayMode: 'wall' | 'session';
}

const DEFAULT_CLOCK_CONFIG: ClockConfig = {
  timezone: 'America/New_York',
  displayMode: 'session',
};

export function ClockConfigForm(props: { companyId: string; moduleId: string }) {
  const [config, setConfig] = useState<ClockConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const mod = await api<{ module: { config: Partial<ClockConfig> } }>(
          `/api/companies/${props.companyId}/modules/${props.moduleId}`,
        );
        if (stopped) return;
        setConfig({ ...DEFAULT_CLOCK_CONFIG, ...mod.module.config });
      } catch {
        if (!stopped) setMessage('Could not load Clock settings.');
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, [props.companyId, props.moduleId]);

  async function saveConfig(next: ClockConfig) {
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
        {message ?? 'Loading Clock settings…'}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 border-t border-[var(--color-line)] pt-4">
      <span className="text-xs text-[var(--color-ink-dim)]">Master Clock</span>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Display mode</span>
        <select
          value={config.displayMode}
          disabled={saving}
          onChange={(e) =>
            void saveConfig({
              ...config,
              displayMode: e.target.value as ClockConfig['displayMode'],
            })
          }
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        >
          <option value="session">Session</option>
          <option value="wall">Wall</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Timezone (IANA)</span>
        <input
          type="text"
          value={config.timezone}
          disabled={saving}
          onChange={(e) => void saveConfig({ ...config, timezone: e.target.value })}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </label>
      {message && <p className="text-xs text-[var(--color-block)]">{message}</p>}
    </div>
  );
}

interface AnalyzerConfig {
  emitMode: 'to_library' | 'to_desk_stream' | 'verify_loopback';
  streamDescriptor?: string;
  exposedOutputChannels?: string[];
  hubFeedClass?: 'direct' | 'analyzed';
  hubShelfOrigin?: string;
  hubShelfStream?: string;
  targetLibraryModuleId?: string;
}

const DEFAULT_ANALYZER_CONFIG: AnalyzerConfig = {
  emitMode: 'verify_loopback',
  exposedOutputChannels: ['analyzer_concat'],
};

export function AnalyzerConfigForm(props: { companyId: string; moduleId: string }) {
  const [config, setConfig] = useState<AnalyzerConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const mod = await api<{ module: { config: Partial<AnalyzerConfig> } }>(
          `/api/companies/${props.companyId}/modules/${props.moduleId}`,
        );
        if (stopped) return;
        setConfig({ ...DEFAULT_ANALYZER_CONFIG, ...mod.module.config });
      } catch {
        if (!stopped) setMessage('Could not load Analyzer settings.');
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, [props.companyId, props.moduleId]);

  async function saveConfig(next: AnalyzerConfig) {
    setConfig(next);
    setSaving(true);
    try {
      await api(`/api/companies/${props.companyId}/modules/${props.moduleId}`, {
        method: 'PATCH',
        body: { config: next },
      });
      setMessage(null);
    } catch {
      setMessage('Could not save Analyzer settings.');
    } finally {
      setSaving(false);
    }
  }

  async function runConcat() {
    if (!config || config.emitMode === 'verify_loopback') {
      setMessage('Switch emit mode to Desk stream or Library to run concat.');
      return;
    }
    setRunning(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/modules/${props.moduleId}/concat`, {
        method: 'POST',
      });
      setMessage('Concat queued — data_out / library updated when the job finishes.');
    } catch {
      setMessage('Could not enqueue analyzer concat.');
    } finally {
      setRunning(false);
    }
  }

  if (!config) {
    return <p className="text-xs text-[var(--color-ink-faint)]">Loading analyzer…</p>;
  }

  return (
    <div className="space-y-2">
      <span className="text-xs text-[var(--color-ink-dim)]">Analyzer emit (D-091)</span>
      <label className="block space-y-1">
        <span className="text-[10px] text-[var(--color-ink-dim)]">Emit mode</span>
        <select
          value={config.emitMode}
          disabled={saving || running}
          onChange={(e) =>
            void saveConfig({
              ...config,
              emitMode: e.target.value as AnalyzerConfig['emitMode'],
            })
          }
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        >
          <option value="to_desk_stream">Desk / engine stream</option>
          <option value="to_library">Library write</option>
          <option value="verify_loopback">Verify loopback</option>
        </select>
      </label>
      {config.hubFeedClass && (
        <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-[10px] text-[var(--color-ink-dim)]">
          <p className="font-medium uppercase tracking-wider">Hub feed (D-216)</p>
          <p>
            Class: <span className="text-[var(--color-ink)]">{config.hubFeedClass}</span>
            {config.hubShelfOrigin ? ` · ${config.hubShelfOrigin}` : ''}
            {config.hubShelfStream ? ` / ${config.hubShelfStream}` : ''}
          </p>
          {config.targetLibraryModuleId && (
            <p className="truncate font-mono text-[8px] text-[var(--color-ink-faint)]">
              Hub module: {config.targetLibraryModuleId}
            </p>
          )}
        </div>
      )}
      <label className="block space-y-1">
        <span className="text-[10px] text-[var(--color-ink-dim)]">Stream descriptor</span>
        <input
          value={config.streamDescriptor ?? ''}
          disabled={saving || running}
          onChange={(e) => void saveConfig({ ...config, streamDescriptor: e.target.value })}
          placeholder="Qualitative package label"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </label>
      {config.emitMode !== 'verify_loopback' && (
        <button
          type="button"
          disabled={saving || running}
          onClick={() => void runConcat()}
          className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1 text-xs text-[var(--color-ink)] hover:border-[var(--color-accent)] disabled:opacity-50"
        >
          {running ? 'Running concat…' : 'Run concat'}
        </button>
      )}
      <div className="space-y-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] p-2">
        <span className="text-[10px] text-[var(--color-ink-dim)]">
          Delivery outs (D-108) — clock / master / system stay locked
        </span>
        <label className="flex items-center justify-between gap-2 text-[11px] text-[var(--color-ink-dim)]">
          <span>Concat</span>
          <input
            type="checkbox"
            disabled={saving || running}
            checked={(config.exposedOutputChannels ?? ['analyzer_concat']).includes(
              'analyzer_concat',
            )}
            onChange={(e) => {
              const next = e.target.checked
                ? Array.from(
                    new Set([...(config.exposedOutputChannels ?? []), 'analyzer_concat']),
                  )
                : (config.exposedOutputChannels ?? ['analyzer_concat']).filter(
                    (id) => id !== 'analyzer_concat',
                  );
              const patched = { ...config, exposedOutputChannels: next };
              void (async () => {
                await saveConfig(patched);
                window.dispatchEvent(
                  new CustomEvent('hftr:module-config-saved', {
                    detail: { moduleId: props.moduleId, config: patched },
                  }),
                );
              })();
            }}
          />
        </label>
      </div>
      {message && <p className="text-xs text-[var(--color-block)]">{message}</p>}
    </div>
  );
}

interface TimeConfig {
  transform: string;
  timezone?: string;
  descriptor?: string;
}

const DEFAULT_TIME_CONFIG: TimeConfig = { transform: 'session_window' };

const TIME_TRANSFORM_OPTIONS = [
  { value: 'elapsed', label: 'Elapsed' },
  { value: 'add_duration', label: 'Add duration' },
  { value: 'timezone_convert', label: 'Timezone convert' },
  { value: 'session_window', label: 'Session window' },
  { value: 'schedule_ref', label: 'Schedule ref' },
] as const;

export function TimeConfigForm(props: { companyId: string; moduleId: string }) {
  const [config, setConfig] = useState<TimeConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const mod = await api<{ module: { config: Partial<TimeConfig> } }>(
          `/api/companies/${props.companyId}/modules/${props.moduleId}`,
        );
        if (stopped) return;
        setConfig({ ...DEFAULT_TIME_CONFIG, ...mod.module.config });
      } catch {
        if (!stopped) setMessage('Could not load Time settings.');
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, [props.companyId, props.moduleId]);

  async function saveConfig(next: TimeConfig) {
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
        {message ?? 'Loading Time settings…'}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 border-t border-[var(--color-line)] pt-4">
      <span className="text-xs text-[var(--color-ink-dim)]">Time processor</span>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Transform</span>
        <select
          value={config.transform}
          disabled={saving}
          onChange={(e) => void saveConfig({ ...config, transform: e.target.value })}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        >
          {TIME_TRANSFORM_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Descriptor</span>
        <input
          type="text"
          value={config.descriptor ?? ''}
          disabled={saving}
          placeholder="Operator preview (no raw datetimes)"
          onChange={(e) => void saveConfig({ ...config, descriptor: e.target.value })}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </label>
      {message && <p className="text-xs text-[var(--color-block)]">{message}</p>}
    </div>
  );
}

interface TrendConfig {
  focus: string;
  trendPosture: string;
  maxActiveTrends: number;
  cadenceMinutes: number;
  manualControl: boolean;
}

const DEFAULT_TREND_CONFIG: Omit<TrendConfig, 'focus'> = {
  trendPosture: 'session_intraday',
  maxActiveTrends: 10,
  cadenceMinutes: 30,
  manualControl: false,
};

const TREND_POSTURE_OPTIONS = [
  { value: 'session_intraday', label: 'Session intraday' },
  { value: 'crypto_cross_cap', label: 'Crypto cross-cap' },
  { value: 'event_probability', label: 'Event probability' },
  { value: 'position_horizon', label: 'Position horizon' },
  { value: 'microstructure_swarm', label: 'Microstructure swarm' },
  { value: 'research_only', label: 'Research only' },
] as const;

export function TrendConfigForm(props: { companyId: string; moduleId: string }) {
  const [config, setConfig] = useState<TrendConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const mod = await api<{ module: { config: Partial<TrendConfig> } }>(
          `/api/companies/${props.companyId}/modules/${props.moduleId}`,
        );
        if (stopped) return;
        setConfig({
          focus: mod.module.config.focus ?? '',
          ...DEFAULT_TREND_CONFIG,
          ...mod.module.config,
        });
      } catch {
        if (!stopped) setMessage('Could not load trend settings.');
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, [props.companyId, props.moduleId]);

  async function saveConfig(next: TrendConfig) {
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
        {message ?? 'Loading trend settings…'}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 border-t border-[var(--color-line)] pt-4">
      <span className="text-xs text-[var(--color-ink-dim)]">Trend settings</span>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Trend posture</span>
        <select
          value={config.trendPosture}
          disabled={saving}
          onChange={(e) => void saveConfig({ ...config, trendPosture: e.target.value })}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        >
          {TREND_POSTURE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <ManualControlToggle
        enabled={config.manualControl}
        disabled={saving}
        onChange={(manualControl) => void saveConfig({ ...config, manualControl })}
      />
      {message && <p className="text-xs text-[var(--color-block)]">{message}</p>}
    </div>
  );
}

interface LiveApiConfig {
  sourceKind: string;
  venue: string;
  instruments: string[];
  feedClass: string;
  pollSeconds: number;
  outputWidgetKinds: string[];
  queryPolicy: string;
  staticQuery: string;
  schedulePolicy: string;
}

const DEFAULT_LIVE_API_CONFIG: LiveApiConfig = {
  sourceKind: '',
  venue: 'paper_sim',
  instruments: [],
  feedClass: 'iex_free',
  pollSeconds: 60,
  outputWidgetKinds: ['generic'],
  queryPolicy: 'static_only',
  staticQuery: '',
  schedulePolicy: 'module_poll',
};

const LIVE_VENUE_OPTIONS = [
  { value: 'alpaca', label: 'Alpaca' },
  { value: 'kalshi', label: 'Kalshi' },
  { value: 'polymarket', label: 'Polymarket' },
  { value: 'coinbase', label: 'Coinbase' },
  { value: 'paper_sim', label: 'Paper sim' },
] as const;

/** Common hydrators for canvas live_api nodes (D-120). Full inventory is on DATA tab. */
const LIVE_SOURCE_KIND_OPTIONS = [
  { value: '', label: 'Select hydrator…' },
  { value: 'alpaca_bars', label: 'alpaca_bars' },
  { value: 'alpaca_news', label: 'alpaca_news' },
  { value: 'twelve_data', label: 'twelve_data' },
  { value: 'marketstack', label: 'marketstack' },
  { value: 'market_news', label: 'market_news' },
  { value: 'finnhub_news', label: 'finnhub_news' },
  { value: 'polygon_news', label: 'polygon_news' },
  { value: 'brave_search', label: 'brave_search' },
  { value: 'sec_edgar', label: 'sec_edgar' },
  { value: 'fred', label: 'fred' },
  { value: 'coingecko', label: 'coingecko' },
] as const;

/** D-077: Live API inspector form (venue, instruments, feed, poll). */
export function LiveApiConfigForm(props: { companyId: string; moduleId: string }) {
  const [config, setConfig] = useState<LiveApiConfig | null>(null);
  const [instrumentsText, setInstrumentsText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const mod = await api<{ module: { config: Partial<LiveApiConfig> } }>(
          `/api/companies/${props.companyId}/modules/${props.moduleId}`,
        );
        if (stopped) return;
        const next = {
          ...DEFAULT_LIVE_API_CONFIG,
          ...mod.module.config,
          instruments: Array.isArray(mod.module.config.instruments)
            ? mod.module.config.instruments
            : [],
        };
        setConfig(next);
        setInstrumentsText(next.instruments.join(', '));
      } catch {
        if (!stopped) setMessage('Could not load live API settings.');
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, [props.companyId, props.moduleId]);

  async function saveConfig(next: LiveApiConfig) {
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
        {message ?? 'Loading live API settings…'}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 border-t border-[var(--color-line)] pt-4">
      <span className="text-xs text-[var(--color-ink-dim)]">Live API settings</span>
      {!config.sourceKind ? (
        <p className="text-[11px] text-[var(--color-ink-faint)]">
          Incomplete — pick a hydrator (source kind). Canvas identity is defined by the hydrator.
        </p>
      ) : null}
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Hydrator (source kind)</span>
        <select
          value={config.sourceKind}
          disabled={saving}
          onChange={(e) => void saveConfig({ ...config, sourceKind: e.target.value })}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        >
          {LIVE_SOURCE_KIND_OPTIONS.map((opt) => (
            <option key={opt.value || 'empty'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Venue</span>
        <select
          value={config.venue}
          disabled={saving}
          onChange={(e) => void saveConfig({ ...config, venue: e.target.value })}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        >
          {LIVE_VENUE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Instruments</span>
        <input
          type="text"
          value={instrumentsText}
          disabled={saving}
          onChange={(e) => setInstrumentsText(e.target.value)}
          onBlur={() => {
            const instruments = instrumentsText
              .split(',')
              .map((s) => s.trim().toUpperCase())
              .filter(Boolean);
            void saveConfig({ ...config, instruments });
          }}
          placeholder="SPY, QQQ, AAPL"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Feed class</span>
        <input
          type="text"
          value={config.feedClass}
          disabled={saving}
          onChange={(e) => setConfig({ ...config, feedClass: e.target.value })}
          onBlur={() =>
            void saveConfig({ ...config, feedClass: config.feedClass.trim() || 'iex_free' })
          }
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Poll seconds</span>
        <input
          type="number"
          min={5}
          max={3600}
          value={config.pollSeconds}
          disabled={saving}
          onChange={(e) =>
            setConfig({
              ...config,
              pollSeconds: Math.min(3600, Math.max(5, Number(e.target.value) || 60)),
            })
          }
          onBlur={() => void saveConfig(config)}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Query policy (D-184)</span>
        <select
          value={config.queryPolicy}
          disabled={saving}
          onChange={(e) => void saveConfig({ ...config, queryPolicy: e.target.value })}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        >
          <option value="static_only">Static only</option>
          <option value="upstream_then_static">Upstream then static</option>
          <option value="upstream_or_null">Upstream or null</option>
          <option value="static_prefer_upstream">Static prefer upstream</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Static query</span>
        <input
          type="text"
          value={config.staticQuery}
          disabled={saving}
          onChange={(e) => setConfig({ ...config, staticQuery: e.target.value })}
          onBlur={() => void saveConfig(config)}
          placeholder="Operator query text (no raw financial numbers)"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Schedule policy</span>
        <select
          value={config.schedulePolicy}
          disabled={saving}
          onChange={(e) => void saveConfig({ ...config, schedulePolicy: e.target.value })}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        >
          <option value="module_poll">Module poll</option>
          <option value="clock_bound">Clock bound</option>
          <option value="manual">Manual</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-ink-dim)]">Output widget kinds</span>
        <input
          type="text"
          value={config.outputWidgetKinds.join(', ')}
          disabled={saving}
          onChange={(e) =>
            setConfig({
              ...config,
              outputWidgetKinds: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          onBlur={() =>
            void saveConfig({
              ...config,
              outputWidgetKinds:
                config.outputWidgetKinds.length > 0 ? config.outputWidgetKinds : ['generic'],
            })
          }
          placeholder="headline, series, generic"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </label>
      {message && <p className="text-xs text-[var(--color-block)]">{message}</p>}
    </div>
  );
}
