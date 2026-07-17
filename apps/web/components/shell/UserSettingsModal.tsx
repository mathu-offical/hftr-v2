'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BrokerConnectionSummary, LlmProvider } from '@hftr/contracts';
import { api } from '@/lib/client';

type RetentionAttested = 'none' | 'org_zdr';
type SettingsTab = 'llm' | 'brokers';

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

/** Ribbon control that opens the user settings modal. */
export function UserSettingsLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open user settings"
        className="rounded-md px-2 py-1 text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
      >
        Settings
      </button>
      <UserSettingsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * User settings modal (ui-ux.spec USER SETTINGS): per-user LLM API keys and broker
 * credentials. Keys are stored encrypted server-side; the client only ever sees a hint.
 */
export function UserSettingsModal(props: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>('llm');
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [drafts, setDrafts] = useState<Record<LlmProvider, string>>({
    anthropic: '',
    mistral: '',
    groq: '',
    cerebras: '',
    fireworks: '',
    openrouter: '',
  });
  const [anthropicZdr, setAnthropicZdr] = useState(false);
  const [messages, setMessages] = useState<Partial<Record<LlmProvider | 'brokers', string>>>({});
  const [busy, setBusy] = useState<LlmProvider | 'brokers' | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ keys: KeyRow[] }>('/api/settings/keys');
      setKeys(r.keys);
      const anthropic = r.keys.find((k) => k.provider === 'anthropic');
      setAnthropicZdr(anthropic?.retentionAttested === 'org_zdr');
    } catch {
      setKeys([]);
    }
  }, []);

  useEffect(() => {
    if (!props.open) return;
    void load();
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
      return;
    }

    setBusy(provider);
    try {
      const body: {
        provider: LlmProvider;
        apiKey?: string;
        retentionAttested?: RetentionAttested;
      } = { provider };
      if (hasKey) body.apiKey = apiKey;
      if (provider === 'anthropic') {
        body.retentionAttested = anthropicZdr ? 'org_zdr' : 'none';
      }
      await api('/api/settings/keys', { method: 'PUT', body });
      setDrafts((d) => ({ ...d, [provider]: '' }));
      setMessages((m) => ({ ...m, [provider]: 'Saved.' }));
      await load();
    } catch {
      setMessages((m) => ({ ...m, [provider]: 'Save failed.' }));
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
      await load();
    } catch {
      setMessages((m) => ({ ...m, [provider]: 'Delete failed.' }));
    } finally {
      setBusy(null);
    }
  }

  async function verify(provider: LlmProvider) {
    setBusy(provider);
    try {
      const res = await api<{ ok: boolean; failure: string | null; deferred?: boolean }>(
        `/api/settings/keys/${provider}/verify`,
        { method: 'POST' },
      );
      if (res.ok && res.deferred) {
        setMessages((m) => ({ ...m, [provider]: 'Format ok — live ping deferred.' }));
      } else if (res.ok) {
        setMessages((m) => ({ ...m, [provider]: 'Verified with provider.' }));
      } else {
        setMessages((m) => ({
          ...m,
          [provider]: `Verify failed: ${res.failure ?? 'unknown'}`,
        }));
      }
    } catch {
      setMessages((m) => ({ ...m, [provider]: 'Verify failed.' }));
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
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-line)] p-5 pb-3">
          <div>
            <h2 className="text-sm font-medium text-[var(--color-ink)]">User settings</h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
              Credentials are encrypted at rest. Never shown in full after save.
            </p>
          </div>
          <button
            onClick={props.onClose}
            aria-label="Close settings"
            className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          >
            ×
          </button>
        </div>

        <div className="flex gap-1 border-b border-[var(--color-line)] px-5">
          {(
            [
              { id: 'llm' as const, label: 'LLM providers' },
              { id: 'brokers' as const, label: 'Brokers' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
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

        <div className="overflow-y-auto p-5">
          {tab === 'llm' && (
            <ul className="space-y-4">
              {PROVIDERS.map((p) => {
                const saved = keys.find((k) => k.provider === p.id);
                return (
                  <li key={p.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-medium text-[var(--color-ink)]">{p.label}</span>
                      <span className="text-[10px] text-[var(--color-ink-faint)]">{p.tier}</span>
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
                            onClick={() => verify(p.id)}
                            disabled={busy === p.id}
                            className="text-[var(--color-accent)] hover:underline disabled:opacity-50"
                          >
                            Verify
                          </button>
                          <button
                            onClick={() => remove(p.id)}
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
                        onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                        placeholder={saved ? 'Replace key…' : 'Paste API key'}
                        aria-label={`${p.label} API key`}
                        autoComplete="off"
                        className="min-w-0 flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
                      />
                      <button
                        onClick={() => save(p.id)}
                        disabled={busy === p.id}
                        className="shrink-0 rounded-md border border-[var(--color-accent)] px-2.5 py-1.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                    {messages[p.id] && (
                      <p className="text-[10px] text-[var(--color-ink-faint)]">{messages[p.id]}</p>
                    )}
                  </li>
                );
              })}
            </ul>
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

  async function save() {
    if (keyId.trim().length < 8 || secret.trim().length < 8) {
      props.onMessage('Key ID and secret must each be at least 8 characters.');
      return;
    }
    props.onBusy('brokers');
    try {
      await api('/api/settings/brokers/alpaca', {
        method: 'PUT',
        body: { keyId: keyId.trim(), secret: secret.trim(), mode: 'paper' },
      });
      setKeyId('');
      setSecret('');
      props.onMessage('Alpaca paper credentials saved — verify to connect.');
      await load();
    } catch {
      props.onMessage('Save failed.');
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
          Paper trading credentials bind per company from the company drawer.
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
          <span className="text-[11px] text-[var(--color-ink-dim)]">Key ID</span>
          <input
            type="password"
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            autoComplete="off"
            aria-label="Alpaca key ID"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-[var(--color-ink-dim)]">Secret</span>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="off"
            aria-label="Alpaca secret"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <button
          onClick={() => void save()}
          disabled={props.busy}
          className="rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
        >
          Save credentials
        </button>
      </div>

      {props.message && (
        <p className="text-[10px] text-[var(--color-ink-faint)]">{props.message}</p>
      )}
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
