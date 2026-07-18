'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Library } from '@hftr/contracts';
import { api } from '@/lib/client';
import {
  classifyLibraryShelf,
  LIBRARY_SHELF_LABELS,
  LIBRARY_SHELF_ORDER,
  type LibraryShelfKind,
} from '@/lib/research-library-shelves';

type LibraryConceptRow = {
  conceptId: string;
  title: string;
};

export interface ResearchLibraryShelvesProps {
  companyId: string;
  libraries: Library[];
  onSelectConcept: (conceptId: string) => void;
  /** Primary click on a library row — opens inspector + galaxy nest (does not expand). */
  onSelectLibrary?: (libraryId: string, libraryName: string) => void;
  onSelectTopic?: (topicId: string) => void;
}

function LibraryConceptLeaves(props: {
  companyId: string;
  libraryId: string;
  open: boolean;
  onSelectConcept: (conceptId: string) => void;
}) {
  const [concepts, setConcepts] = useState<LibraryConceptRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{
        libraryConcepts: { conceptId: string; title: string }[];
      }>(`/api/companies/${props.companyId}/libraries/${props.libraryId}/concepts`);
      setConcepts(
        data.libraryConcepts.map((row) => ({
          conceptId: row.conceptId,
          title: row.title,
        })),
      );
    } catch {
      setConcepts([]);
    } finally {
      setLoading(false);
    }
  }, [props.companyId, props.libraryId]);

  useEffect(() => {
    if (!props.open || concepts !== null) return;
    void load();
  }, [props.open, concepts, load]);

  if (!props.open) return null;

  if (loading || concepts === null) {
    return <p className="py-0.5 pl-5 text-[9px] text-[var(--color-ink-faint)]">Loading…</p>;
  }

  if (concepts.length === 0) {
    return <p className="py-0.5 pl-5 text-[9px] text-[var(--color-ink-faint)]">No concepts.</p>;
  }

  return (
    <ul className="pl-5">
      {concepts.map((c) => (
        <li key={c.conceptId}>
          <button
            type="button"
            onClick={() => props.onSelectConcept(c.conceptId)}
            className="w-full truncate rounded py-0.5 text-left text-[10px] text-[var(--color-ink)] hover:text-[var(--color-accent)]"
          >
            {c.title}
          </button>
        </li>
      ))}
    </ul>
  );
}

function LibraryRow(props: {
  companyId: string;
  library: Library;
  onSelectConcept: (conceptId: string) => void;
  onSelectLibrary?: (libraryId: string, libraryName: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="group/library">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? `Collapse ${props.library.name}` : `Expand ${props.library.name}`}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded p-0.5 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          <ChevronRight
            size={12}
            aria-hidden
            className={`transition-transform ${open ? 'rotate-90' : ''}`}
          />
        </button>
        <button
          type="button"
          onClick={() => props.onSelectLibrary?.(props.library.id, props.library.name)}
          className="min-w-0 flex-1 truncate rounded py-0.5 text-left text-[10px] text-[var(--color-ink)] hover:text-[var(--color-accent)]"
        >
          {props.library.name}
        </button>
      </div>
      <LibraryConceptLeaves
        companyId={props.companyId}
        libraryId={props.library.id}
        open={open}
        onSelectConcept={props.onSelectConcept}
      />
    </div>
  );
}

function ShelfSection(props: {
  kind: LibraryShelfKind;
  libraries: Library[];
  companyId: string;
  onSelectConcept: (conceptId: string) => void;
  onSelectLibrary?: (libraryId: string, libraryName: string) => void;
}) {
  return (
    <details className="rounded border border-[var(--color-line)] px-2 py-1">
      <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)] marker:content-none [&::-webkit-details-marker]:hidden">
        {LIBRARY_SHELF_LABELS[props.kind]}
      </summary>
      <div className="mt-1 space-y-0.5">
        {props.libraries.length === 0 ? (
          <p className="text-[10px] text-[var(--color-ink-faint)]">None yet.</p>
        ) : (
          props.libraries.map((lib) => (
            <LibraryRow
              key={lib.id}
              companyId={props.companyId}
              library={lib}
              onSelectConcept={props.onSelectConcept}
              {...(props.onSelectLibrary ? { onSelectLibrary: props.onSelectLibrary } : {})}
            />
          ))
        )}
      </div>
    </details>
  );
}

function ResearchLibraryShelvesInner(props: ResearchLibraryShelvesProps) {
  const shelves = useMemo(() => {
    const grouped: Record<LibraryShelfKind, Library[]> = {
      system_curated: [],
      runtime: [],
      baseline_seeded: [],
    };
    for (const lib of props.libraries) {
      if (lib.status !== 'active') continue;
      grouped[classifyLibraryShelf(lib)].push(lib);
    }
    for (const kind of LIBRARY_SHELF_ORDER) {
      grouped[kind].sort((a, b) => a.name.localeCompare(b.name));
    }
    return grouped;
  }, [props.libraries]);

  return (
    <div
      data-testid="research-library-shelves"
      className="rounded-lg border border-[var(--color-line)] p-2.5"
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
        Library shelves
      </p>
      <div className="mt-1.5 space-y-1.5">
        {LIBRARY_SHELF_ORDER.map((kind) => (
          <ShelfSection
            key={kind}
            kind={kind}
            libraries={shelves[kind]}
            companyId={props.companyId}
            onSelectConcept={props.onSelectConcept}
            {...(props.onSelectLibrary ? { onSelectLibrary: props.onSelectLibrary } : {})}
          />
        ))}
      </div>
    </div>
  );
}

export const ResearchLibraryShelves = memo(ResearchLibraryShelvesInner);
