'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, RequestError } from '@/lib/client';

export interface CompanyCardEngine {
  id: string;
  label: string;
  templateId: string;
}

export interface CompanyCardProps {
  id: string;
  name: string;
  mode: 'paper' | 'live' | string;
  philosophyPrompt: string;
  engines: CompanyCardEngine[];
}

/**
 * Companies directory card: paper/live badge, engine labels, navigate to
 * canvas, and rename / duplicate / archive actions.
 */
export function CompanyCard(props: CompanyCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [displayName, setDisplayName] = useState(props.name);
  const [nameDraft, setNameDraft] = useState(props.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming) renameInputRef.current?.focus();
  }, [renaming]);

  useEffect(() => {
    setDisplayName(props.name);
    setNameDraft(props.name);
  }, [props.name]);

  async function saveRename() {
    const next = nameDraft.trim();
    if (!next || next === displayName) {
      setRenaming(false);
      setNameDraft(displayName);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/companies/${props.id}`, {
        method: 'PATCH',
        body: { name: next },
      });
      setDisplayName(next);
      setRenaming(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof RequestError ? err.code : 'rename_failed');
    } finally {
      setBusy(false);
    }
  }

  async function duplicateCompany() {
    setBusy(true);
    setError(null);
    setMenuOpen(false);
    try {
      await api<{ company: { id: string } }>(`/api/companies/${props.id}/duplicate`, {
        method: 'POST',
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof RequestError ? err.code : 'duplicate_failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCompany() {
    const confirmed = window.confirm(
      `Archive “${displayName}”? The company leaves the directory; traces and ledgers are kept.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    setMenuOpen(false);
    try {
      await api(`/api/companies/${props.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (err) {
      setError(err instanceof RequestError ? err.code : 'delete_failed');
    } finally {
      setBusy(false);
    }
  }

  const modeLabel = props.mode === 'live' ? 'live' : 'paper';
  const engineLabels =
    props.engines.length > 0
      ? props.engines.map((e) => e.label).join(' · ')
      : 'No engines (Math only)';

  return (
    <article
      className="relative rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] transition-colors hover:border-[var(--color-accent)]"
      data-testid="company-card"
      data-company-id={props.id}
      data-mode={modeLabel}
    >
      {renaming ? (
        <div className="space-y-3 p-5">
          <label className="block text-xs text-[var(--color-ink-dim)]">
            Rename company
            <input
              ref={renameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void saveRename();
                }
                if (e.key === 'Escape') {
                  setRenaming(false);
                  setNameDraft(displayName);
                }
              }}
              maxLength={80}
              disabled={busy}
              className="mt-1 w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm text-[var(--color-ink)]"
              aria-label="Company name"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void saveRename()}
              disabled={busy}
              className="rounded bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false);
                setNameDraft(displayName);
              }}
              disabled={busy}
              className="rounded border border-[var(--color-line)] px-3 py-1 text-xs text-[var(--color-ink-dim)]"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-xs text-[var(--color-block)]">{error}</p>}
        </div>
      ) : (
        <>
          <Link
            href={`/companies/${props.id}`}
            className="block p-5 pr-12"
            aria-label={`Open ${displayName}`}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="min-w-0 truncate font-medium">{displayName}</span>
              <span
                className={`status-chip shrink-0 uppercase tracking-wide ${
                  modeLabel === 'live' ? 'mode-badge-live' : 'mode-badge-paper'
                }`}
              >
                {modeLabel}
              </span>
            </div>
            <p className="mb-2 text-xs text-[var(--color-ink-dim)]">
              <span className="text-[var(--color-ink-faint)]">Engines · </span>
              {engineLabels}
            </p>
            <p className="line-clamp-2 text-sm text-[var(--color-ink-dim)]">
              {props.philosophyPrompt}
            </p>
          </Link>

          <div ref={menuRef} className="absolute right-3 top-3">
            <button
              type="button"
              aria-label={`Company options for ${displayName}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="rounded px-2 py-1 text-sm text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] disabled:opacity-50"
            >
              ⋯
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] py-1 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-sm text-[var(--color-ink-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                  onClick={() => {
                    setMenuOpen(false);
                    setRenaming(true);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-sm text-[var(--color-ink-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                  onClick={() => void duplicateCompany()}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-sm text-[var(--color-block)] hover:bg-[var(--color-surface-2)]"
                  onClick={() => void deleteCompany()}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
          {error && (
            <p className="border-t border-[var(--color-line)] px-5 py-2 text-xs text-[var(--color-block)]">
              {error}
            </p>
          )}
        </>
      )}
    </article>
  );
}
