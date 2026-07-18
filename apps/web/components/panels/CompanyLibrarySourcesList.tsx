'use client';

import { useMemo, useState } from 'react';
import { useDataView } from '@/components/panels/DataViewContext';
import { useResearchView } from '@/components/research/ResearchViewContext';
import { fetchCompanyLibraries } from '@/lib/research-resource-api';

type LibraryModuleRow = {
  id: string;
  name: string;
  config: Record<string, unknown>;
};

/**
 * DATA tab — company canvas library modules (engine-created or manual). D-133.
 */
export function CompanyLibrarySourcesList(props: {
  companyId: string;
  modules: LibraryModuleRow[];
}) {
  const dataView = useDataView();
  const researchView = useResearchView();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openedModuleId, setOpenedModuleId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const rows = useMemo(() => props.modules, [props.modules]);

  async function openModule(m: LibraryModuleRow) {
    setOpeningId(m.id);
    setMessage(null);
    const topicScope = typeof m.config.topicScope === 'string' ? m.config.topicScope : '';
    try {
      const libraries = await fetchCompanyLibraries(props.companyId, { force: false });
      const match =
        (topicScope
          ? libraries.find((l) => l.topicScope === topicScope)
          : undefined) ??
        libraries.find((l) => l.name === m.name) ??
        null;
      if (match) {
        setOpenedModuleId(m.id);
        researchView.inspectLibrary(match.id, match.name);
      } else {
        setOpenedModuleId(m.id);
        dataView.selectCompanyModule(m.id, m.name);
        setMessage('No linked library store yet — showing module in Data Explorer.');
      }
    } catch {
      setOpenedModuleId(m.id);
      dataView.selectCompanyModule(m.id, m.name);
      setMessage('Could not resolve library store.');
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <section data-testid="company-library-sources" aria-label="Company libraries" className="mt-4">
      <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-faint)]">
        Company libraries
      </p>
      {message ? (
        <p className="mt-1 text-[10px] text-[var(--color-ink-dim)]">{message}</p>
      ) : null}
      {rows.length === 0 ? (
        <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">No company libraries yet.</p>
      ) : (
        <ul className="mt-2 space-y-1" role="listbox" aria-label="Company library modules">
          {rows.map((m) => {
            const scope =
              typeof m.config.topicScope === 'string' ? m.config.topicScope : 'library';
            const selected =
              openedModuleId === m.id &&
              (researchView.pageInspectorOpen ||
                (dataView.overlayOpen && dataView.target?.type === 'company_module'));
            return (
              <li
                key={m.id}
                className={`flex items-center gap-1.5 rounded border px-2 py-1 transition-colors ${
                  selected
                    ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)] ring-1 ring-[var(--color-accent)]'
                    : 'border-[var(--color-line)] bg-[var(--color-surface-1)]'
                }`}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid={`company-library-source-${m.id}`}
                  disabled={openingId === m.id}
                  onClick={() => void openModule(m)}
                  className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-[var(--color-ink)] disabled:opacity-50"
                >
                  {m.name}
                  <span className="font-normal text-[var(--color-ink-faint)]"> · {scope}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
