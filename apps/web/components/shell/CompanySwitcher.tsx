'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import {
  loadCompanyListMeta,
  peekCompanyListMeta,
  toCompanyListMeta,
  type CompanyListMeta,
  upsertCompanyListMeta,
} from '@/lib/company-list-cache';
import { InlineLoadingStrip } from '@/components/shell/LoadingChrome';

async function fetchCompanyListMeta(): Promise<CompanyListMeta[]> {
  const r = await api<{ companies: Array<{ id: string; name: string; mode: string }> }>(
    '/api/companies',
  );
  return toCompanyListMeta(r.companies);
}

/** Ribbon company navigation dropdown — uses D-197 list metadata cache. */
export function CompanySwitcher(props: {
  companyId: string;
  companyName: string;
  companyMode?: string;
}) {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<CompanyListMeta[] | null>(() =>
    peekCompanyListMeta(),
  );
  const [loading, setLoading] = useState(() => peekCompanyListMeta() === null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshList = useCallback(async (force = false) => {
    try {
      const result = await loadCompanyListMeta(fetchCompanyListMeta, {
        force,
        onUpdate: (rows) => setCompanies(rows),
      });
      setCompanies(result.data);
    } catch {
      if (peekCompanyListMeta() === null) setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Warm cache on mount so the first open is instant when possible.
  useEffect(() => {
    void refreshList(false);
  }, [refreshList]);

  // Keep current company visible in cache (name/mode may come from SSR).
  useEffect(() => {
    upsertCompanyListMeta({
      id: props.companyId,
      name: props.companyName,
      mode:
        props.companyMode ??
        peekCompanyListMeta()?.find((c) => c.id === props.companyId)?.mode ??
        'paper',
    });
  }, [props.companyId, props.companyName, props.companyMode]);

  useEffect(() => {
    if (!open) return;
    void refreshList(false);
  }, [open, refreshList]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const rows = companies ?? [];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-[var(--color-surface-2)]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {props.companyName}
        <span className="text-[9px] text-[var(--color-ink-faint)]">▼</span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] py-1 shadow-xl"
          role="listbox"
          aria-label="Companies"
        >
          {loading && rows.length === 0 ? (
            <div className="px-3 py-2">
              <InlineLoadingStrip label="Companies" detail="…" />
            </div>
          ) : null}
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/companies/${c.id}`}
              onClick={() => setOpen(false)}
              role="option"
              aria-selected={c.id === props.companyId}
              className={`flex items-center justify-between px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)] ${
                c.id === props.companyId ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-dim)]'
              }`}
            >
              <span className="truncate">{c.name}</span>
              <span className="ml-2 shrink-0 text-[10px] uppercase text-[var(--color-ink-faint)]">
                {c.mode}
              </span>
            </Link>
          ))}
          <div className="mt-1 border-t border-[var(--color-line)] pt-1">
            <Link
              href="/companies"
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-surface-2)]"
            >
              All companies →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
