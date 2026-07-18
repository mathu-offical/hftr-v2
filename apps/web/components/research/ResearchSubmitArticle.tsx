'use client';

import { memo, useEffect, useState } from 'react';
import { ARTICLE_DISPLAY_TAG_MAX } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import type { ResearchModuleOption } from '@/components/research/ResearchNewTopicButton';

export interface ResearchSubmitArticleProps {
  companyId: string;
  modules: ResearchModuleOption[];
  libraries?: Array<{ id: string; name: string }>;
  onCreated?: (conceptId: string) => void;
}

function parseTagInput(raw: string): string[] {
  const parts = raw
    .split(/[,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of parts) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag.slice(0, 64));
    if (out.length >= ARTICLE_DISPLAY_TAG_MAX) break;
  }
  return out;
}

function ResearchSubmitArticleInner(props: ResearchSubmitArticleProps) {
  const [expanded, setExpanded] = useState(false);
  const [kind, setKind] = useState<'link' | 'text'>('text');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [notes, setNotes] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [moduleId, setModuleId] = useState(props.modules[0]?.id ?? '');
  const [libraryId, setLibraryId] = useState(props.libraries?.[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!moduleId && props.modules[0]?.id) {
      setModuleId(props.modules[0].id);
    }
  }, [props.modules, moduleId]);

  useEffect(() => {
    if (!libraryId && props.libraries?.[0]?.id) {
      setLibraryId(props.libraries[0].id);
    }
  }, [props.libraries, libraryId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || !moduleId || !libraryId) return;
    setBusy(true);
    setMessage(null);
    const tags = parseTagInput(tagsRaw);
    try {
      const result = await api<{ conceptId: string }>(
        `/api/companies/${props.companyId}/research/submit`,
        {
          method: 'POST',
          body: {
            moduleId,
            kind,
            content: trimmed,
            libraryId,
            ...(title.trim() ? { title: title.trim() } : {}),
            ...(kind === 'link' && notes.trim() ? { notes: notes.trim() } : {}),
            ...(tags.length > 0 ? { tags } : {}),
          },
        },
      );
      setContent('');
      setNotes('');
      setTitle('');
      setTagsRaw('');
      setMessage('Article saved to library.');
      props.onCreated?.(result.conceptId);
    } catch (err) {
      setMessage(
        err instanceof RequestError
          ? err.status === 422
            ? 'Could not submit — check module, library, and URL.'
            : 'Could not submit article.'
          : 'Could not submit article.',
      );
    } finally {
      setBusy(false);
    }
  }

  const noLibraries = (props.libraries?.length ?? 0) === 0;

  return (
    <div
      data-testid="research-submit-article"
      className="mt-2 rounded-lg border border-[var(--color-line)] p-2.5"
    >
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          disabled={noLibraries}
          className="w-full rounded-md border border-[var(--color-line)] px-2 py-1 text-[10px] text-[var(--color-ink)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
        >
          Submit research article
        </button>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            Operator article
          </p>
          <div className="flex gap-1" role="group" aria-label="Article kind">
            <button
              type="button"
              aria-pressed={kind === 'text'}
              onClick={() => setKind('text')}
              className={`rounded-md border px-2 py-0.5 text-[10px] ${
                kind === 'text'
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-[var(--color-line)] text-[var(--color-ink-faint)]'
              }`}
            >
              Text
            </button>
            <button
              type="button"
              aria-pressed={kind === 'link'}
              onClick={() => setKind('link')}
              className={`rounded-md border px-2 py-0.5 text-[10px] ${
                kind === 'link'
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-[var(--color-line)] text-[var(--color-ink-faint)]'
              }`}
            >
              Link
            </button>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            aria-label="Article title"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
          />
          {kind === 'link' ? (
            <>
              <input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="https://…"
                aria-label="Article URL"
                autoFocus
                className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
                aria-label="Link notes"
                rows={3}
                className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
              />
            </>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste article text or markdown"
              aria-label="Article text"
              autoFocus
              rows={5}
              className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
            />
          )}
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
          <select
            value={libraryId}
            onChange={(e) => setLibraryId(e.target.value)}
            aria-label="Save to library"
            required
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
          >
            <option value="" disabled>
              Save to library…
            </option>
            {(props.libraries ?? []).map((lib) => (
              <option key={lib.id} value={lib.id}>
                {lib.name}
              </option>
            ))}
          </select>
          <input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="Tags (1–3, comma-separated)"
            aria-label="Article tags"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busy || !content.trim() || !moduleId || !libraryId}
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
            {message && (
              <span className="text-[10px] text-[var(--color-ink-faint)]">{message}</span>
            )}
          </div>
        </form>
      )}
      {noLibraries && !expanded ? (
        <p className="mt-1 text-[9px] text-[var(--color-ink-faint)]">
          Create a library first — articles must save into a library.
        </p>
      ) : null}
    </div>
  );
}

export const ResearchSubmitArticle = memo(ResearchSubmitArticleInner);
