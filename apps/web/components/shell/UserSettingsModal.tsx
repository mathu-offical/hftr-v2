'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';

type Provider = 'anthropic' | 'mistral' | 'groq';

const PROVIDERS: { id: Provider; label: string; tier: string }[] = [
  { id: 'anthropic', label: 'Anthropic (Claude)', tier: 'strategic' },
  { id: 'mistral', label: 'Mistral', tier: 'tactical / assistant' },
  { id: 'groq', label: 'Groq', tier: 'execution compile' },
];

interface KeyRow {
  provider: Provider;
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
        className="rounded-md px-2 py-1 text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
      >
        Settings
      </button>
      <UserSettingsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * User settings modal (ui-ux.spec USER SETTINGS): per-user LLM API key entry.
 * Keys are stored encrypted server-side; the client only ever sees a hint.
 */
export function UserSettingsModal(props: { open: boolean; onClose: () => void }) {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [drafts, setDrafts] = useState<Record<Provider, string>>({
    anthropic: '',
    mistral: '',
    groq: '',
  });
  const [messages, setMessages] = useState<Partial<Record<Provider, string>>>({});
  const [busy, setBusy] = useState<Provider | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ keys: KeyRow[] }>('/api/settings/keys');
      setKeys(r.keys);
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

  async function save(provider: Provider) {
    const apiKey = drafts[provider].trim();
    if (apiKey.length < 8) {
      setMessages((m) => ({ ...m, [provider]: 'Key must be at least 8 characters.' }));
      return;
    }
    setBusy(provider);
    try {
      await api('/api/settings/keys', { method: 'PUT', body: { provider, apiKey } });
      setDrafts((d) => ({ ...d, [provider]: '' }));
      setMessages((m) => ({ ...m, [provider]: 'Saved.' }));
      await load();
    } catch {
      setMessages((m) => ({ ...m, [provider]: 'Save failed.' }));
    } finally {
      setBusy(null);
    }
  }

  async function remove(provider: Provider) {
    setBusy(provider);
    try {
      await api(`/api/settings/keys/${provider}`, { method: 'DELETE' });
      setMessages((m) => ({ ...m, [provider]: 'Removed.' }));
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
        className="w-full max-w-md rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-[var(--color-ink)]">User settings</h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
              LLM API keys are encrypted at rest. Never shown in full after save.
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
                  <div className="flex items-center justify-between text-[11px] text-[var(--color-ink-dim)]">
                    <span>
                      saved ·····{saved.keyHint}
                      <span className="ml-2 text-[var(--color-ink-faint)]">
                        {new Date(saved.updatedAt).toLocaleDateString()}
                      </span>
                    </span>
                    <button
                      onClick={() => remove(p.id)}
                      disabled={busy === p.id}
                      className="text-[var(--color-block)] hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-[var(--color-ink-faint)]">No key saved</p>
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
      </div>
    </div>
  );
}
