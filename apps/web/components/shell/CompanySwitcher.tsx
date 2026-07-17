'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';

interface CompanyRow {
  id: string;
  name: string;
  mode: string;
}

/** Ribbon company navigation dropdown (ui-ux spec: top app shell). */
export function CompanySwitcher(props: { companyId: string; companyName: string }) {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<CompanyRow[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || companies !== null) return;
    api<{ companies: CompanyRow[] }>('/api/companies')
      .then((r) => setCompanies(r.companies))
      .catch(() => setCompanies([]));
  }, [open, companies]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-[var(--color-surface-2)]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {props.companyName}
        <span className="text-[9px] text-[var(--color-ink-faint)]">▼</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] py-1 shadow-xl">
          {companies === null && (
            <p className="px-3 py-2 text-xs text-[var(--color-ink-faint)]">Loading…</p>
          )}
          {companies?.map((c) => (
            <Link
              key={c.id}
              href={`/companies/${c.id}`}
              onClick={() => setOpen(false)}
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
