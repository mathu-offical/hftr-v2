'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, RequestError } from '@/lib/client';

type ArchiveConcept = {
  id: string;
  title: string;
  sourceClass: string;
  confidenceBand: string;
  archivedAt: string | null;
};

type ArchiveTopic = {
  id: string;
  title: string;
  confidenceBand: string;
  archivedAt: string | null;
};

type ArchiveLibrary = {
  id: string;
  name: string;
  archivedAt: string | null;
};

type ArchivePayload = {
  concepts: ArchiveConcept[];
  topics: ArchiveTopic[];
  libraries: ArchiveLibrary[];
};

type Props = {
  companyId: string;
  onChanged?: () => void;
};

export function ResearchArchiveSection(props: Props) {
  const [data, setData] = useState<ArchivePayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<ArchivePayload>(`/api/companies/${props.companyId}/research/archive`);
      setData(res);
    } catch {
      setData({ concepts: [], topics: [], libraries: [] });
    } finally {
      setLoaded(true);
    }
  }, [props.companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(
    action: 'archive_runtime' | 'clear_archive' | 'restore_object',
    objectKind?: 'concept' | 'topic' | 'library',
    objectId?: string,
  ) {
    if (action === 'clear_archive') {
      const ok = window.confirm(
        'Clear archive permanently deletes soft-deleted research. Seeded catalog content is protected. Continue?',
      );
      if (!ok) return;
    }
    if (action === 'archive_runtime') {
      const ok = window.confirm(
        'Archive all runtime research? Seeded catalog library concepts and Current awareness / Sector research points stay live.',
      );
      if (!ok) return;
    }
    setBusy(action);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/research/archive`, {
        method: 'POST',
        body: { action, objectKind, objectId },
      });
      await load();
      props.onChanged?.();
      setMessage(
        action === 'clear_archive'
          ? 'Archive cleared.'
          : action === 'archive_runtime'
            ? 'Runtime research archived.'
            : 'Restored.',
      );
    } catch (err) {
      setMessage(err instanceof RequestError ? err.code : 'Archive action failed.');
    } finally {
      setBusy(null);
    }
  }

  const empty =
    loaded &&
    data &&
    data.concepts.length === 0 &&
    data.topics.length === 0 &&
    data.libraries.length === 0;

  return (
    <section
      data-testid="research-archive"
      className="mt-3 rounded-lg border border-[var(--color-line)] p-2.5"
      aria-label="Research archive"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Archive
        </p>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void runAction('archive_runtime')}
            className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] disabled:opacity-50"
          >
            {busy === 'archive_runtime' ? '…' : 'Archive runtime'}
          </button>
          <button
            type="button"
            disabled={busy !== null || empty === true}
            onClick={() => void runAction('clear_archive')}
            className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] disabled:opacity-50"
          >
            {busy === 'clear_archive' ? '…' : 'Clear archive'}
          </button>
        </div>
      </div>

      {!loaded && (
        <p className="mt-2 text-[10px] text-[var(--color-ink-faint)]">Loading archive…</p>
      )}
      {empty && (
        <p className="mt-2 text-[10px] text-[var(--color-ink-faint)]">
          No archived research. Soft-deleted concepts, topics, and libraries appear here.
        </p>
      )}

      {data && data.concepts.length > 0 && (
        <ul className="mt-2 space-y-1">
          <li className="text-[9px] uppercase text-[var(--color-ink-faint)]">Concepts</li>
          {data.concepts.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 text-[10px] text-[var(--color-ink-dim)]"
            >
              <span className="truncate">{c.title}</span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runAction('restore_object', 'concept', c.id)}
                className="shrink-0 text-[var(--color-accent)] hover:underline disabled:opacity-50"
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}

      {data && data.topics.length > 0 && (
        <ul className="mt-2 space-y-1">
          <li className="text-[9px] uppercase text-[var(--color-ink-faint)]">Topics</li>
          {data.topics.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 text-[10px] text-[var(--color-ink-dim)]"
            >
              <span className="truncate">{t.title}</span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runAction('restore_object', 'topic', t.id)}
                className="shrink-0 text-[var(--color-accent)] hover:underline disabled:opacity-50"
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}

      {data && data.libraries.length > 0 && (
        <ul className="mt-2 space-y-1">
          <li className="text-[9px] uppercase text-[var(--color-ink-faint)]">Libraries</li>
          {data.libraries.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-2 text-[10px] text-[var(--color-ink-dim)]"
            >
              <span className="truncate">{l.name}</span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runAction('restore_object', 'library', l.id)}
                className="shrink-0 text-[var(--color-accent)] hover:underline disabled:opacity-50"
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p className="mt-2 text-[10px] text-[var(--color-ink-faint)]" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
