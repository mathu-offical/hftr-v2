'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { formatUsdFromCents, type EquityStatus } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import { currentValueHeadline, normalizeCapitalMode } from '@/lib/capital-mode-label';
import {
  patchCompanyListMeta,
  removeCompanyListMeta,
  upsertCompanyListMeta,
} from '@/lib/company-list-cache';

export interface CompanyCardEngine {
  id: string;
  label: string;
  templateId: string;
}

export interface CompanyCardEquity {
  equityCents: string | null;
  status: EquityStatus;
  asOfIso: string | null;
}

export interface CompanyCardServiceCoverage {
  modulesWithRequiredGaps: number;
  missingRequiredCapabilities: string[];
  boundCapabilityCount: number;
}

export interface CompanyCardProps {
  id: string;
  name: string;
  mode: 'paper' | 'live' | string;
  philosophyPrompt: string;
  engines: CompanyCardEngine[];
  seedCreditsCents: string;
  equity: CompanyCardEquity;
  serviceCoverage?: CompanyCardServiceCoverage;
}

/**
 * Companies directory card: paper/live badge, seed/equity, engine labels,
 * navigate to canvas, and rename / duplicate / archive actions.
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
      patchCompanyListMeta(props.id, { name: next });
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
      const { company } = await api<{ company: { id: string; name: string; mode: string } }>(
        `/api/companies/${props.id}/duplicate`,
        { method: 'POST' },
      );
      upsertCompanyListMeta({
        id: company.id,
        name: company.name,
        mode: company.mode,
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
      `Archive “${displayName}”? It leaves the directory, stops schedules, and clears live/broker binding. Traces and ledgers are kept.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    setMenuOpen(false);
    try {
      await api(`/api/companies/${props.id}`, { method: 'DELETE' });
      removeCompanyListMeta(props.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof RequestError ? err.code : 'delete_failed');
    } finally {
      setBusy(false);
    }
  }

  const modeLabel = props.mode === 'live' ? 'live' : 'paper';
  const capitalMode = normalizeCapitalMode(props.mode);
  const equityHeadline = currentValueHeadline(capitalMode);
  const engineLabels =
    props.engines.length > 0
      ? props.engines.map((e) => e.label).join(' · ')
      : 'No engines (Math only)';
  const seedLabel = formatUsdFromCents(props.seedCreditsCents);
  const equityLabel =
    props.equity.equityCents !== null ? formatUsdFromCents(props.equity.equityCents) : null;
  const equityStatusTone =
    props.equity.status === 'stale'
      ? 'text-[var(--color-warn)]'
      : props.equity.status === 'unavailable'
        ? 'text-[var(--color-block)]'
        : 'text-[var(--color-ink-faint)]';

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
              aria-label="Save company name"
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
            <div className="mb-2 space-y-0.5 text-xs text-[var(--color-ink-dim)]">
              {seedLabel && (
                <p data-testid="company-card-seed" className="tabular-nums">
                  {capitalMode === 'paper' ? 'Paper seed' : 'Seed'} {seedLabel}
                </p>
              )}
              <p data-testid="company-card-equity" className="tabular-nums">
                {equityLabel ? (
                  <>
                    {equityHeadline} {equityLabel}
                  </>
                ) : (
                  <span className={equityStatusTone}>{equityHeadline} Unavailable</span>
                )}
                {props.equity.status === 'stale' && (
                  <span className={`ml-2 ${equityStatusTone}`}>Stale</span>
                )}
                {props.equity.status === 'unavailable' && equityLabel && (
                  <span className={`ml-2 ${equityStatusTone}`}>Unavailable</span>
                )}
              </p>
              {props.serviceCoverage && (
                <p data-testid="company-card-service-coverage" className="text-[var(--color-ink-faint)]">
                  {props.serviceCoverage.modulesWithRequiredGaps > 0 ? (
                    <span className="text-[var(--color-warn)]">
                      Service gaps · {props.serviceCoverage.modulesWithRequiredGaps} module
                      {props.serviceCoverage.modulesWithRequiredGaps === 1 ? '' : 's'} missing{' '}
                      {props.serviceCoverage.missingRequiredCapabilities.join(', ') ||
                        'required capabilities'}
                    </span>
                  ) : (
                    <span>
                      Services bound · {props.serviceCoverage.boundCapabilityCount} capacit
                      {props.serviceCoverage.boundCapabilityCount === 1 ? 'y' : 'ies'}
                    </span>
                  )}
                </p>
              )}
            </div>
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
