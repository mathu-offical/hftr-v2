'use client';

import { memo, useEffect, useState } from 'react';
import { api, RequestError } from '@/lib/client';

export interface ResearchModuleOption {
  id: string;
  name: string;
}

export interface ResearchNewTopicButtonProps {
  companyId: string;
  modules: ResearchModuleOption[];
  onCreated?: () => void;
}

function ResearchNewTopicButtonInner(props: ResearchNewTopicButtonProps) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [moduleId, setModuleId] = useState(props.modules[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!moduleId && props.modules[0]?.id) {
      setModuleId(props.modules[0].id);
    }
  }, [props.modules, moduleId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !moduleId) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/research/topics`, {
        method: 'POST',
        body: { moduleId, title: trimmed },
      });
      setTitle('');
      setMessage('Topic submitted.');
      props.onCreated?.();
    } catch (err) {
      setMessage(
        err instanceof RequestError && err.status === 404
          ? 'Topics API not available yet.'
          : 'Could not submit topic.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="research-new-topic" className="rounded-lg border border-[var(--color-line)] p-2.5">
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full rounded-md border border-[var(--color-accent)] px-2 py-1 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
        >
          Submit new topic
        </button>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            New topic
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Topic title"
            aria-label="New topic title"
            autoFocus
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
          />
          {props.modules.length > 1 && (
            <select
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              aria-label="Research module"
              className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
            >
              {props.modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busy || !title.trim() || !moduleId}
              className="rounded-md border border-[var(--color-accent)] px-2 py-0.5 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
            >
              {busy ? 'Submitting…' : 'Submit'}
            </button>
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                setMessage(null);
              }}
              className="text-[10px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            >
              Cancel
            </button>
            {message && <span className="text-[10px] text-[var(--color-ink-faint)]">{message}</span>}
          </div>
        </form>
      )}
    </div>
  );
}

export const ResearchNewTopicButton = memo(ResearchNewTopicButtonInner);
