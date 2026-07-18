'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BrokerConnectionSummary, LlmProvider, ResearchKeyProvider } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import { notifyLlmCredentialsChanged } from '@/components/shell/LlmConnectionStatus';

type RetentionAttested = 'none' | 'org_zdr';
type SettingsTab = 'llm' | 'research' | 'brokers';
/** Operator-visible verify outcome for a key row (text-first; color reinforces). */
type KeyVerifyUiStatus = 'idle' | 'verified' | 'verified_deferred' | 'failed' | 'unknown';

function formatSaveError(err: unknown): string {
  if (!(err instanceof RequestError)) return 'Save failed.';
  switch (err.code) {
    case 'encryption_key_missing':
      return 'Server encryption key missing — redeploy with SETTINGS_ENCRYPTION_KEY.';
    case 'encryption_failed':
      return 'Could not encrypt key on server.';
    case 'invalid_key_format':
      return 'Key format rejected for this provider.';
    case 'invalid_input': {
      const detail = err.issues?.[0]?.message;
      return detail ? `Invalid input: ${detail}` : 'Invalid input.';
    }
    case 'unauthorized':
      return 'Not signed in.';
    case 'decrypt_failed':
      return 'Cannot decrypt saved key — Delete and re-enter after checking SETTINGS_ENCRYPTION_KEY.';
    case 'key_not_configured':
      return 'No key saved yet — paste a key and Save & verify.';
    default:
      return `Save failed (${err.code}).`;
  }
}

/** Operator-facing copy for verify route failure codes (text-first). */
function formatVerifyFailure(code: string | null | undefined): string {
  switch (code) {
    case 'auth_rejected':
      return 'Provider rejected credentials.';
    case 'ping_timeout':
      return 'Provider did not respond in time.';
    case 'decrypt_failed':
      return 'Cannot decrypt saved key — Delete and re-enter after checking SETTINGS_ENCRYPTION_KEY.';
    case null:
    case undefined:
      return 'unknown';
    default:
      if (code.startsWith('provider_http_')) {
        return `Provider HTTP ${code.slice('provider_http_'.length)}.`;
      }
      return code;
  }
}

async function mapPool<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) return;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function VerifyStatusBadge(props: { status: KeyVerifyUiStatus }) {
  const label =
    props.status === 'verified'
      ? 'Verified'
      : props.status === 'verified_deferred'
        ? 'Format ok'
        : props.status === 'failed'
          ? 'Verify failed'
          : props.status === 'unknown'
            ? 'Not verified'
            : '—';
  const tone =
    props.status === 'verified' || props.status === 'verified_deferred'
      ? 'text-[var(--color-ok)]'
      : props.status === 'failed'
        ? 'text-[var(--color-block)]'
        : 'text-[var(--color-ink-faint)]';
  return (
    <span
      className={`text-[10px] uppercase tracking-wider ${tone}`}
      data-testid="key-verify-status"
      data-status={props.status}
    >
      {label}
    </span>
  );
}
const RESEARCH_KEY_PROVIDERS: { id: ResearchKeyProvider; label: string; hint: string }[] = [
  { id: 'brave', label: 'Brave Search', hint: 'Web search for research gather' },
  { id: 'market_news', label: 'Market news', hint: 'Marketaux public market news' },
  { id: 'finnhub', label: 'Finnhub', hint: 'Company and general market news (free tier available)' },
  { id: 'polygon', label: 'Polygon.io', hint: 'Reference news feed (API key required)' },
  { id: 'fred', label: 'FRED', hint: 'St. Louis Fed macro series search (free API key)' },
  {
    id: 'alpha_vantage',
    label: 'Alpha Vantage',
    hint: 'News sentiment feed (free tier available)',
  },
  { id: 'twelve_data', label: 'Twelve Data', hint: 'Daily equity time-series entitlement check' },
  { id: 'marketstack', label: 'Marketstack', hint: 'End-of-day equity data entitlement check' },
];

const PROVIDERS: { id: LlmProvider; label: string; tier: string }[] = [
  { id: 'anthropic', label: 'Anthropic (Claude)', tier: 'strategic' },
  { id: 'mistral', label: 'Mistral', tier: 'tactical / assistant' },
  { id: 'groq', label: 'Groq', tier: 'execution compile' },
  { id: 'cerebras', label: 'Cerebras', tier: 'execution / tactical' },
  { id: 'fireworks', label: 'Fireworks', tier: 'tactical / execution' },
  { id: 'openrouter', label: 'OpenRouter', tier: 'tactical / execution (ZDR)' },
];

interface KeyRow {
  provider: LlmProvider;
  keyHint: string;
  retentionAttested: RetentionAttested;
  updatedAt: string;
}

interface ResearchKeyRow {
  provider: ResearchKeyProvider;
  keyHint: string;
  updatedAt: string;
}

/** Ribbon control that opens the user settings modal. */
export function UserSettingsLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open user settings"
        className="rounded-md border border-[var(--color-line)] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[var(--color-ink-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
      >
        Settings
      </button>
      <UserSettingsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * User settings modal (ui-ux.spec USER SETTINGS): per-user LLM API keys, research
 * gather keys, and broker credentials. Keys are stored encrypted server-side; the
 * client only ever sees a hint.
 *
 * Layout: fixed dialog height (`h-[min(36rem,90vh)]`) with sticky header + tabs;
 * only the tab panel scrolls (`min-h-0 flex-1 overflow-y-auto`) so short tabs stay
 * the same chrome size and long lists do not grow the shell.
 */
export function UserSettingsModal(props: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>('llm');
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [researchKeys, setResearchKeys] = useState<ResearchKeyRow[]>([]);
  const [drafts, setDrafts] = useState<Record<LlmProvider, string>>({
    anthropic: '',
    mistral: '',
    groq: '',
    cerebras: '',
    fireworks: '',
    openrouter: '',
  });
  const [anthropicZdr, setAnthropicZdr] = useState(false);
  const [researchDrafts, setResearchDrafts] = useState<Record<ResearchKeyProvider, string>>({
    brave: '',
    market_news: '',
    finnhub: '',
    polygon: '',
    fred: '',
    alpha_vantage: '',
    twelve_data: '',
    marketstack: '',
  });
  const [messages, setMessages] = useState<
    Partial<Record<LlmProvider | ResearchKeyProvider | 'brokers', string>>
  >({});
  const [verifyStatus, setVerifyStatus] = useState<
    Partial<Record<LlmProvider | ResearchKeyProvider, KeyVerifyUiStatus>>
  >({});
  const [busy, setBusy] = useState<LlmProvider | ResearchKeyProvider | 'brokers' | null>(null);

  const load = useCallback(async (): Promise<{
    llm: KeyRow[];
    research: ResearchKeyRow[];
  }> => {
    try {
      const [llm, research] = await Promise.all([
        api<{ keys: KeyRow[] }>('/api/settings/keys'),
        api<{ keys: ResearchKeyRow[] }>('/api/settings/research-keys').catch(() => ({
          keys: [] as ResearchKeyRow[],
        })),
      ]);
      setKeys(llm.keys);
      setResearchKeys(research.keys);
      const anthropic = llm.keys.find((k) => k.provider === 'anthropic');
      setAnthropicZdr(anthropic?.retentionAttested === 'org_zdr');
      return { llm: llm.keys, research: research.keys };
    } catch {
      setKeys([]);
      setResearchKeys([]);
      return { llm: [], research: [] };
    }
  }, []);

  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;

    void (async () => {
      const data = await load();
      if (cancelled) return;

      const seeded: Partial<Record<LlmProvider | ResearchKeyProvider, KeyVerifyUiStatus>> = {};
      for (const row of data.llm) seeded[row.provider] = 'unknown';
      for (const row of data.research) seeded[row.provider] = 'unknown';
      setVerifyStatus(seeded);

      const llmProviders = data.llm.map((r) => r.provider);
      const researchProviders = data.research.map((r) => r.provider);

      await mapPool(llmProviders, 3, async (provider) => {
        try {
          const res = await api<{ ok: boolean; failure: string | null; deferred?: boolean }>(
            `/api/settings/keys/${provider}/verify`,
            { method: 'POST' },
          );
          if (cancelled) return;
          if (res.ok && res.deferred) {
            setVerifyStatus((s) => ({ ...s, [provider]: 'verified_deferred' }));
          } else if (res.ok) {
            setVerifyStatus((s) => ({ ...s, [provider]: 'verified' }));
          } else {
            setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
            setMessages((m) => ({
              ...m,
              [provider]: `Verify failed: ${formatVerifyFailure(res.failure)}`,
            }));
          }
        } catch (err) {
          if (cancelled) return;
          setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
          setMessages((m) => ({
            ...m,
            [provider]: err instanceof RequestError ? formatSaveError(err) : 'Verify failed.',
          }));
        }
      });

      await mapPool(researchProviders, 3, async (provider) => {
        try {
          const res = await api<{ ok: boolean; failure: string | null }>(
            `/api/settings/research-keys/${provider}/verify`,
            { method: 'POST' },
          );
          if (cancelled) return;
          if (res.ok) {
            setVerifyStatus((s) => ({ ...s, [provider]: 'verified' }));
          } else {
            setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
            setMessages((m) => ({
              ...m,
              [provider]: `Verify failed: ${formatVerifyFailure(res.failure)}`,
            }));
          }
        } catch (err) {
          if (cancelled) return;
          setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
          setMessages((m) => ({
            ...m,
            [provider]: err instanceof RequestError ? formatSaveError(err) : 'Verify failed.',
          }));
        }
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [props.open, load]);

  useEffect(() => {
    if (!props.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') props.onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  async function save(provider: LlmProvider) {
    const apiKey = drafts[provider].trim();
    const hasKey = apiKey.length >= 8;
    const saved = keys.find((k) => k.provider === provider);

    if (!hasKey && !saved) {
      setMessages((m) => ({ ...m, [provider]: 'Key must be at least 8 characters.' }));
      setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
      return;
    }
    if (hasKey && apiKey.length > 512) {
      setMessages((m) => ({ ...m, [provider]: 'Key must be at most 512 characters.' }));
      setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
      return;
    }
    if (hasKey && provider === 'anthropic' && !apiKey.startsWith('sk-ant-')) {
      setMessages((m) => ({
        ...m,
        [provider]: 'Anthropic keys must start with sk-ant-.',
      }));
      setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
      return;
    }

    // New or replacement key material must verify before persist (fail-closed).
    if (!hasKey) {
      setMessages((m) => ({
        ...m,
        [provider]: 'Paste a key to Save & verify (attestation-only updates use the checkbox).',
      }));
      return;
    }

    setBusy(provider);
    try {
      const check = await api<{ ok: boolean; failure: string | null; deferred?: boolean }>(
        `/api/settings/keys/${provider}/verify`,
        { method: 'POST', body: { apiKey } },
      );
      if (!check.ok) {
        setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
        setMessages((m) => ({
          ...m,
          [provider]: `Not saved — verify failed: ${formatVerifyFailure(check.failure)}`,
        }));
        return;
      }

      const body: {
        provider: LlmProvider;
        apiKey: string;
        retentionAttested?: RetentionAttested;
      } = { provider, apiKey };
      if (provider === 'anthropic') {
        body.retentionAttested = anthropicZdr ? 'org_zdr' : 'none';
      }
      await api('/api/settings/keys', { method: 'PUT', body });
      setDrafts((d) => ({ ...d, [provider]: '' }));
      setVerifyStatus((s) => ({
        ...s,
        [provider]: check.deferred ? 'verified_deferred' : 'verified',
      }));
      setMessages((m) => ({
        ...m,
        [provider]: check.deferred
          ? 'Saved — format ok (live ping deferred for Anthropic).'
          : 'Saved and verified with provider.',
      }));
      notifyLlmCredentialsChanged();
      await load();
    } catch (err) {
      setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
      setMessages((m) => ({ ...m, [provider]: formatSaveError(err) }));
    } finally {
      setBusy(null);
    }
  }

  async function saveAnthropicAttestation(checked: boolean) {
    setAnthropicZdr(checked);
    const saved = keys.find((k) => k.provider === 'anthropic');
    if (!saved) return;

    setBusy('anthropic');
    try {
      await api('/api/settings/keys', {
        method: 'PUT',
        body: {
          provider: 'anthropic',
          retentionAttested: checked ? 'org_zdr' : 'none',
        },
      });
      setMessages((m) => ({ ...m, anthropic: 'Attestation saved.' }));
      await load();
    } catch {
      setMessages((m) => ({ ...m, anthropic: 'Attestation save failed.' }));
      setAnthropicZdr(!checked);
    } finally {
      setBusy(null);
    }
  }

  async function remove(provider: LlmProvider) {
    setBusy(provider);
    try {
      await api(`/api/settings/keys/${provider}`, { method: 'DELETE' });
      if (provider === 'anthropic') setAnthropicZdr(false);
      setMessages((m) => ({ ...m, [provider]: 'Removed.' }));
      setVerifyStatus((s) => {
        const next = { ...s };
        delete next[provider];
        return next;
      });
      notifyLlmCredentialsChanged();
      await load();
    } catch {
      setMessages((m) => ({ ...m, [provider]: 'Delete failed.' }));
    } finally {
      setBusy(null);
    }
  }

  async function verify(provider: LlmProvider) {
    const draft = drafts[provider].trim();
    const saved = keys.find((k) => k.provider === provider);
    if (draft.length < 8 && !saved) {
      setMessages((m) => ({
        ...m,
        [provider]: 'Enter a key (8+ chars) or save one before verify.',
      }));
      setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
      return;
    }

    setBusy(provider);
    try {
      const res = await api<{ ok: boolean; failure: string | null; deferred?: boolean }>(
        `/api/settings/keys/${provider}/verify`,
        {
          method: 'POST',
          ...(draft.length >= 8 ? { body: { apiKey: draft } } : {}),
        },
      );
      if (res.ok && res.deferred) {
        setVerifyStatus((s) => ({ ...s, [provider]: 'verified_deferred' }));
        setMessages((m) => ({ ...m, [provider]: 'Format ok — live ping deferred.' }));
      } else if (res.ok) {
        setVerifyStatus((s) => ({ ...s, [provider]: 'verified' }));
        setMessages((m) => ({ ...m, [provider]: 'Verified with provider.' }));
      } else {
        setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
        setMessages((m) => ({
          ...m,
          [provider]: `Verify failed: ${formatVerifyFailure(res.failure)}`,
        }));
      }
    } catch (err) {
      setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
      setMessages((m) => ({
        ...m,
        [provider]: err instanceof RequestError ? formatSaveError(err) : 'Verify failed.',
      }));
    } finally {
      setBusy(null);
    }
  }

  async function verifyResearchKey(provider: ResearchKeyProvider) {
    const draft = researchDrafts[provider].trim();
    const saved = researchKeys.find((k) => k.provider === provider);
    if (draft.length < 8 && !saved) {
      setMessages((m) => ({
        ...m,
        [provider]: 'Enter a key (8+ chars) or save one before verify.',
      }));
      setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
      return;
    }

    setBusy(provider);
    try {
      const res = await api<{ ok: boolean; failure: string | null }>(
        `/api/settings/research-keys/${provider}/verify`,
        {
          method: 'POST',
          ...(draft.length >= 8 ? { body: { apiKey: draft } } : {}),
        },
      );
      if (res.ok) {
        setVerifyStatus((s) => ({ ...s, [provider]: 'verified' }));
        setMessages((m) => ({ ...m, [provider]: 'Verified with provider.' }));
      } else {
        setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
        setMessages((m) => ({
          ...m,
          [provider]: `Verify failed: ${formatVerifyFailure(res.failure)}`,
        }));
      }
    } catch (err) {
      setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
      setMessages((m) => ({
        ...m,
        [provider]: err instanceof RequestError ? formatSaveError(err) : 'Verify failed.',
      }));
    } finally {
      setBusy(null);
    }
  }

  async function saveResearchKey(provider: ResearchKeyProvider) {
    const apiKey = researchDrafts[provider].trim();
    if (apiKey.length < 8) {
      setMessages((m) => ({
        ...m,
        [provider]: 'Paste a key (8+ chars) to Save & verify.',
      }));
      setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
      return;
    }
    setBusy(provider);
    try {
      const check = await api<{ ok: boolean; failure: string | null }>(
        `/api/settings/research-keys/${provider}/verify`,
        { method: 'POST', body: { apiKey } },
      );
      if (!check.ok) {
        setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
        setMessages((m) => ({
          ...m,
          [provider]: `Not saved — verify failed: ${formatVerifyFailure(check.failure)}`,
        }));
        return;
      }
      await api('/api/settings/research-keys', {
        method: 'PUT',
        body: { provider, apiKey },
      });
      setResearchDrafts((d) => ({ ...d, [provider]: '' }));
      setVerifyStatus((s) => ({ ...s, [provider]: 'verified' }));
      setMessages((m) => ({ ...m, [provider]: 'Saved and verified with provider.' }));
      await load();
    } catch (err) {
      setVerifyStatus((s) => ({ ...s, [provider]: 'failed' }));
      setMessages((m) => ({ ...m, [provider]: formatSaveError(err) }));
    } finally {
      setBusy(null);
    }
  }

  async function removeResearchKey(provider: ResearchKeyProvider) {
    setBusy(provider);
    try {
      await api(`/api/settings/research-keys/${provider}`, { method: 'DELETE' });
      setMessages((m) => ({ ...m, [provider]: 'Removed.' }));
      setVerifyStatus((s) => {
        const next = { ...s };
        delete next[provider];
        return next;
      });
      await load();
    } catch {
      setMessages((m) => ({ ...m, [provider]: 'Delete failed.' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={props.onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="User settings"
        onClick={(e) => e.stopPropagation()}
        className="flex h-[min(36rem,90vh)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] shadow-2xl"
      >
        <header className="shrink-0 border-b border-[var(--color-line)] p-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-[var(--color-ink)]">User settings</h2>
              <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
                Credentials are encrypted at rest. Never shown in full after save.
              </p>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              aria-label="Close settings"
              className="shrink-0 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            >
              ×
            </button>
          </div>
        </header>

        <div
          className="flex shrink-0 gap-1 border-b border-[var(--color-line)] px-5"
          role="tablist"
          aria-label="Settings sections"
        >
          {(
            [
              { id: 'llm' as const, label: 'LLM providers' },
              { id: 'research' as const, label: 'Research' },
              { id: 'brokers' as const, label: 'Brokers' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`user-settings-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`user-settings-panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`border-b-2 px-3 py-2 text-[11px] uppercase tracking-wider ${
                tab === t.id
                  ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                  : 'border-transparent text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          id={`user-settings-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`user-settings-tab-${tab}`}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5"
        >
          {tab === 'llm' && (
            <ul className="space-y-4">
              {PROVIDERS.map((p) => {
                const saved = keys.find((k) => k.provider === p.id);
                const status: KeyVerifyUiStatus =
                  verifyStatus[p.id] ?? (saved ? 'unknown' : 'idle');
                return (
                  <li key={p.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-[var(--color-ink)]">{p.label}</span>
                      <span className="flex items-center gap-2">
                        <VerifyStatusBadge status={status} />
                        <span className="text-[10px] text-[var(--color-ink-faint)]">{p.tier}</span>
                      </span>
                    </div>
                    {saved ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--color-ink-dim)]">
                        <span>
                          saved ·····{saved.keyHint}
                          <span className="ml-2 text-[var(--color-ink-faint)]">
                            {new Date(saved.updatedAt).toLocaleDateString()}
                          </span>
                        </span>
                        <span className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void verify(p.id)}
                            disabled={busy === p.id}
                            className="text-[var(--color-accent)] hover:underline disabled:opacity-50"
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(p.id)}
                            disabled={busy === p.id}
                            className="text-[var(--color-block)] hover:underline disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[var(--color-ink-faint)]">No key saved</p>
                    )}
                    {p.id === 'anthropic' && (
                      <label className="flex items-center gap-2 text-[11px] text-[var(--color-ink-dim)]">
                        <input
                          type="checkbox"
                          checked={anthropicZdr}
                          disabled={busy === 'anthropic'}
                          onChange={(e) => void saveAnthropicAttestation(e.target.checked)}
                        />
                        Organization ZDR attested
                      </label>
                    )}
                    <div className="flex gap-1.5">
                      <input
                        type="password"
                        value={drafts[p.id]}
                        onChange={(e) => {
                          setDrafts((d) => ({ ...d, [p.id]: e.target.value }));
                          setVerifyStatus((s) => ({ ...s, [p.id]: 'idle' }));
                        }}
                        placeholder={saved ? 'Replace key…' : 'Paste API key'}
                        aria-label={`${p.label} API key`}
                        autoComplete="off"
                        className="min-w-0 flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
                      />
                      {drafts[p.id].trim().length >= 8 && (
                        <button
                          type="button"
                          onClick={() => void verify(p.id)}
                          disabled={busy === p.id}
                          className="shrink-0 rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-xs text-[var(--color-ink-dim)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                        >
                          Verify
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void save(p.id)}
                        disabled={busy === p.id}
                        className="shrink-0 rounded-md border border-[var(--color-accent)] px-2.5 py-1.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
                      >
                        Save & verify
                      </button>
                    </div>
                    {messages[p.id] && (
                      <p
                        className={`text-[10px] ${
                          verifyStatus[p.id] === 'failed'
                            ? 'text-[var(--color-block)]'
                            : 'text-[var(--color-ink-faint)]'
                        }`}
                        role="status"
                      >
                        {messages[p.id]}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {tab === 'research' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-[var(--color-ink)]">Research gather keys</p>
                <p className="mt-0.5 text-[10px] text-[var(--color-ink-faint)]">
                  Optional keys for external research sources (Brave, Marketaux, Finnhub,
                  Polygon, FRED, Alpha Vantage, Twelve Data, Marketstack). Alpaca news uses
                  paper broker credentials. Public gather also includes SEC, Frankfurter,
                  CoinGecko, World Bank, and GDELT when ready.
                </p>
              </div>
              <ul className="space-y-4">
                {RESEARCH_KEY_PROVIDERS.map((p) => {
                  const saved = researchKeys.find((k) => k.provider === p.id);
                  const status: KeyVerifyUiStatus =
                    verifyStatus[p.id] ?? (saved ? 'unknown' : 'idle');
                  return (
                    <li key={p.id} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs text-[var(--color-ink)]">{p.label}</span>
                        <span className="flex items-center gap-2">
                          <VerifyStatusBadge status={status} />
                          <span className="text-[10px] text-[var(--color-ink-faint)]">{p.hint}</span>
                        </span>
                      </div>
                      {saved ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--color-ink-dim)]">
                          <span>
                            saved ·····{saved.keyHint}
                            <span className="ml-2 text-[var(--color-ink-faint)]">
                              {new Date(saved.updatedAt).toLocaleDateString()}
                            </span>
                          </span>
                          <span className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void verifyResearchKey(p.id)}
                              disabled={busy === p.id}
                              className="text-[var(--color-accent)] hover:underline disabled:opacity-50"
                            >
                              Verify
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeResearchKey(p.id)}
                              disabled={busy === p.id}
                              className="text-[var(--color-block)] hover:underline disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </span>
                        </div>
                      ) : (
                        <p className="text-[11px] text-[var(--color-ink-faint)]">No key saved</p>
                      )}
                      <div className="flex gap-1.5">
                        <input
                          type="password"
                          value={researchDrafts[p.id]}
                          onChange={(e) => {
                            setResearchDrafts((d) => ({ ...d, [p.id]: e.target.value }));
                            setVerifyStatus((s) => ({ ...s, [p.id]: 'idle' }));
                          }}
                          placeholder={saved ? 'Replace key…' : 'Paste API key'}
                          aria-label={`${p.label} API key`}
                          autoComplete="off"
                          className="min-w-0 flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
                        />
                        {researchDrafts[p.id].trim().length >= 8 && (
                          <button
                            type="button"
                            onClick={() => void verifyResearchKey(p.id)}
                            disabled={busy === p.id}
                            className="shrink-0 rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-xs text-[var(--color-ink-dim)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                          >
                            Verify
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void saveResearchKey(p.id)}
                          disabled={busy === p.id}
                          className="shrink-0 rounded-md border border-[var(--color-accent)] px-2.5 py-1.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
                        >
                          Save & verify
                        </button>
                      </div>
                      {messages[p.id] && (
                        <p
                          className={`text-[10px] ${
                            verifyStatus[p.id] === 'failed'
                              ? 'text-[var(--color-block)]'
                              : 'text-[var(--color-ink-faint)]'
                          }`}
                          role="status"
                        >
                          {messages[p.id]}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {tab === 'brokers' && (
            <BrokersTab
              busy={busy === 'brokers'}
              message={messages.brokers ?? null}
              onBusy={setBusy}
              onMessage={(msg) => setMessages((m) => ({ ...m, brokers: msg }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BrokersTab(props: {
  busy: boolean;
  message: string | null;
  onBusy: (v: LlmProvider | 'brokers' | null) => void;
  onMessage: (msg: string) => void;
}) {
  return (
    <div className="space-y-8">
      <AlpacaBrokerSection {...props} />
      <KalshiBrokerSection {...props} />
    </div>
  );
}

function AlpacaBrokerSection(props: {
  busy: boolean;
  message: string | null;
  onBusy: (v: LlmProvider | 'brokers' | null) => void;
  onMessage: (msg: string) => void;
}) {
  const [connection, setConnection] = useState<BrokerConnectionSummary | null>(null);
  const [keyId, setKeyId] = useState('');
  const [secret, setSecret] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api<{ connection: BrokerConnectionSummary | null }>(
        '/api/settings/brokers/alpaca',
      );
      setConnection(r.connection);
    } catch {
      setConnection(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Most direct path: paste Key ID + Secret, verify handshake, only keep if connected. */
  async function saveAndVerify() {
    if (keyId.trim().length < 8 || secret.trim().length < 8) {
      props.onMessage(
        'Paste your Alpaca paper API Key ID and Secret Key (each at least 8 characters).',
      );
      return;
    }
    props.onBusy('brokers');
    try {
      const saved = await api<{ id: string }>('/api/settings/brokers/alpaca', {
        method: 'PUT',
        body: { keyId: keyId.trim(), secret: secret.trim(), mode: 'paper' },
      });
      try {
        await api(`/api/settings/brokers/${saved.id}/verify`, { method: 'POST' });
      } catch {
        await api(`/api/settings/brokers/${saved.id}`, { method: 'DELETE' }).catch(() => undefined);
        props.onMessage('Not saved — Alpaca verify failed. Check Key ID and Secret.');
        await load();
        return;
      }
      setKeyId('');
      setSecret('');
      props.onMessage('Alpaca paper connected and verified.');
      await load();
    } catch {
      props.onMessage('Connect failed. Check Key ID and Secret, then try again.');
    } finally {
      props.onBusy(null);
    }
  }

  async function verify() {
    if (!connection) return;
    props.onBusy('brokers');
    try {
      await api(`/api/settings/brokers/${connection.id}/verify`, { method: 'POST' });
      props.onMessage('Verification complete.');
      await load();
    } catch {
      props.onMessage('Verification failed.');
    } finally {
      props.onBusy(null);
    }
  }

  async function revoke() {
    if (!connection) return;
    props.onBusy('brokers');
    try {
      await api(`/api/settings/brokers/${connection.id}`, { method: 'DELETE' });
      setConnection(null);
      props.onMessage('Connection revoked.');
    } catch {
      props.onMessage('Revoke failed.');
    } finally {
      props.onBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-medium text-[var(--color-ink)]">Alpaca paper</h3>
        <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
          Paste API Key ID + Secret from the Alpaca paper dashboard (no OAuth). Bind the
          connection to a company from that company&apos;s drawer.
        </p>
      </div>

      {connection && (
        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)] p-3 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-[var(--color-ink)]">
              {connection.venue} · {connection.mode}
            </span>
            <StatusChip status={connection.status} />
          </div>
          <p className="mt-1.5 text-[var(--color-ink-dim)]">
            Key ·····{connection.keyHint}
            {connection.lastVerifiedAt && (
              <span className="ml-2 text-[var(--color-ink-faint)]">
                verified {new Date(connection.lastVerifiedAt).toLocaleString()}
              </span>
            )}
          </p>
          {connection.capabilities && (
            <div className="mt-1.5 space-y-0.5 text-[var(--color-ink-dim)]">
              <p>Assets: {connection.capabilities.assets.join(', ')}</p>
              <p>Order types: {connection.capabilities.orderTypes.join(', ')}</p>
              <p>Sessions: {connection.capabilities.sessions}</p>
              <p>Supports paper: {connection.capabilities.supportsPaper ? 'yes' : 'no'}</p>
              <p>
                Fractional: {connection.capabilities.supportsFractional ? 'yes' : 'no'} · Funding:{' '}
                {connection.capabilities.fundingUx}
              </p>
            </div>
          )}
          {connection.boundCompanyId && (
            <p className="mt-1 font-mono text-[10px] text-[var(--color-ink-faint)]">
              Bound company: {connection.boundCompanyId}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => void verify()}
              disabled={props.busy || connection.status === 'revoked'}
              className="rounded border border-[var(--color-accent)] px-2 py-1 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
            >
              Verify
            </button>
            <button
              onClick={() => void revoke()}
              disabled={props.busy}
              className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px] text-[var(--color-block)] hover:underline disabled:opacity-50"
            >
              Revoke
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="block space-y-1">
          <span className="text-[11px] text-[var(--color-ink-dim)]">API Key ID</span>
          <input
            type="password"
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            autoComplete="off"
            placeholder="PK…"
            aria-label="Alpaca key ID"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-[var(--color-ink-dim)]">Secret Key</span>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="off"
            placeholder="Paste secret key"
            aria-label="Alpaca secret"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <button
          onClick={() => void saveAndVerify()}
          disabled={props.busy}
          className="rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
        >
          Save & verify
        </button>
      </div>

      {props.message && (
        <p className="text-[10px] text-[var(--color-ink-faint)]">{props.message}</p>
      )}
    </div>
  );
}

function KalshiBrokerSection(props: {
  busy: boolean;
  onBusy: (v: LlmProvider | 'brokers' | null) => void;
  onMessage: (msg: string) => void;
}) {
  const [connection, setConnection] = useState<BrokerConnectionSummary | null>(null);
  const [apiKeyId, setApiKeyId] = useState('');
  const [privateKeyPem, setPrivateKeyPem] = useState('');
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ connection: BrokerConnectionSummary | null }>(
        '/api/settings/brokers/kalshi',
      );
      setConnection(r.connection);
    } catch {
      setConnection(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAndVerify() {
    if (apiKeyId.trim().length < 8 || privateKeyPem.trim().length < 32) {
      setLocalMessage('API key ID and private key PEM are required (PEM at least 32 characters).');
      return;
    }
    props.onBusy('brokers');
    try {
      const saved = await api<{ id: string }>('/api/settings/brokers/kalshi', {
        method: 'PUT',
        body: {
          apiKeyId: apiKeyId.trim(),
          privateKeyPem: privateKeyPem.trim(),
          mode: 'paper',
          demoMode: true,
        },
      });
      try {
        const result = await api<{ status: string }>(
          `/api/settings/brokers/${saved.id}/verify`,
          { method: 'POST' },
        );
        if (result.status !== 'connected') {
          await api(`/api/settings/brokers/${saved.id}`, { method: 'DELETE' }).catch(
            () => undefined,
          );
          setLocalMessage(`Not saved — Kalshi verify status: ${result.status}.`);
          props.onMessage('Kalshi verify failed — credentials not kept.');
          await load();
          return;
        }
      } catch {
        await api(`/api/settings/brokers/${saved.id}`, { method: 'DELETE' }).catch(() => undefined);
        setLocalMessage('Not saved — Kalshi verify failed.');
        props.onMessage('Kalshi verify failed — credentials not kept.');
        await load();
        return;
      }
      setApiKeyId('');
      setPrivateKeyPem('');
      setLocalMessage('Kalshi demo credentials saved and verified.');
      props.onMessage('Kalshi demo connected and verified.');
      await load();
    } catch {
      setLocalMessage('Save failed.');
      props.onMessage('Kalshi save failed.');
    } finally {
      props.onBusy(null);
    }
  }

  async function verify() {
    if (!connection) return;
    props.onBusy('brokers');
    try {
      const result = await api<{ status: string }>(
        `/api/settings/brokers/${connection.id}/verify`,
        { method: 'POST' },
      );
      setLocalMessage(
        result.status === 'connected'
          ? 'Kalshi demo connection verified.'
          : `Verification finished with status: ${result.status}.`,
      );
      props.onMessage('Kalshi verification complete.');
      await load();
    } catch {
      setLocalMessage('Verification failed.');
      props.onMessage('Kalshi verification failed.');
    } finally {
      props.onBusy(null);
    }
  }

  async function revoke() {
    if (!connection) return;
    props.onBusy('brokers');
    try {
      await api(`/api/settings/brokers/${connection.id}`, { method: 'DELETE' });
      setConnection(null);
      setLocalMessage('Kalshi connection revoked.');
      props.onMessage('Kalshi connection revoked.');
    } catch {
      setLocalMessage('Revoke failed.');
      props.onMessage('Kalshi revoke failed.');
    } finally {
      props.onBusy(null);
    }
  }

  return (
    <div className="space-y-4 border-t border-[var(--color-line)] pt-4">
      <div>
        <h3 className="text-xs font-medium text-[var(--color-ink)]">Kalshi demo</h3>
        <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
          Event-contract demo API credentials. Live Kalshi remains fail-closed.
        </p>
      </div>

      {connection && (
        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)] p-3 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-[var(--color-ink)]">
              {connection.venue} · {connection.mode} · demo
            </span>
            <StatusChip status={connection.status} />
          </div>
          <p className="mt-1.5 text-[var(--color-ink-dim)]">
            Key ·····{connection.keyHint}
            {connection.lastVerifiedAt && (
              <span className="ml-2 text-[var(--color-ink-faint)]">
                verified {new Date(connection.lastVerifiedAt).toLocaleString()}
              </span>
            )}
          </p>
          {connection.capabilities && (
            <div className="mt-1.5 space-y-0.5 text-[var(--color-ink-dim)]">
              <p>Assets: {connection.capabilities.assets.join(', ')}</p>
              <p>Order types: {connection.capabilities.orderTypes.join(', ')}</p>
              <p>Sessions: {connection.capabilities.sessions}</p>
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => void verify()}
              disabled={props.busy || connection.status === 'revoked'}
              className="rounded border border-[var(--color-accent)] px-2 py-1 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
            >
              Verify
            </button>
            <button
              onClick={() => void revoke()}
              disabled={props.busy}
              className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px] text-[var(--color-block)] hover:underline disabled:opacity-50"
            >
              Revoke
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="block space-y-1">
          <span className="text-[11px] text-[var(--color-ink-dim)]">API key ID</span>
          <input
            type="password"
            value={apiKeyId}
            onChange={(e) => setApiKeyId(e.target.value)}
            autoComplete="off"
            aria-label="Kalshi API key ID"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-[var(--color-ink-dim)]">Private key PEM</span>
          <textarea
            value={privateKeyPem}
            onChange={(e) => setPrivateKeyPem(e.target.value)}
            autoComplete="off"
            aria-label="Kalshi private key PEM"
            rows={4}
            placeholder="-----BEGIN PRIVATE KEY-----"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 font-mono text-[10px] outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <button
          onClick={() => void saveAndVerify()}
          disabled={props.busy}
          className="rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
        >
          Save & verify
        </button>
      </div>

      {localMessage && <p className="text-[10px] text-[var(--color-ink-faint)]">{localMessage}</p>}
    </div>
  );
}

function StatusChip(props: { status: string }) {
  const tone =
    props.status === 'connected'
      ? 'text-[var(--color-ok)]'
      : props.status === 'error' || props.status === 'revoked'
        ? 'text-[var(--color-block)]'
        : 'text-[var(--color-ink-faint)]';
  return <span className={`text-[10px] uppercase tracking-wider ${tone}`}>{props.status}</span>;
}
