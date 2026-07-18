'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileText, FolderOpen } from 'lucide-react';
import type { Library } from '@hftr/contracts';
import { api } from '@/lib/client';
import {
  classifyLibraryShelf,
  findLibraryOverviewTopic,
  LIBRARY_SHELF_LABELS,
  LIBRARY_SHELF_ORDER,
  type LibraryShelfKind,
} from '@/lib/research-library-shelves';

type LibraryPageRow = {
  conceptId: string;
  title: string;
};

export interface ResearchLibraryShelvesProps {
  companyId: string;
  libraries: Library[];
  /** Company topics — used to attach an overview page to a library folder by title. */
  topics?: Array<{ id: string; title: string }>;
  onSelectConcept: (conceptId: string) => void;
  /** Primary click when no matching overview topic — library inspector + nest. */
  onSelectLibrary?: (libraryId: string, libraryName: string) => void;
  /** Open overview / index topic for a library folder (e.g. Seeded trading mechanisms). */
  onSelectTopic?: (topicId: string) => void;
}

function displayPageTitle(title: string): string {
  return title.replace(/_/g, ' ');
}

function LibraryPageLeaves(props: {
  companyId: string;
  libraryId: string;
  open: boolean;
  overviewTopicId: string | null;
  onSelectConcept: (conceptId: string) => void;
  onSelectTopic?: (topicId: string) => void;
}) {
  const [pages, setPages] = useState<LibraryPageRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{
        libraryConcepts: { conceptId: string; title: string }[];
      }>(`/api/companies/${props.companyId}/libraries/${props.libraryId}/concepts`);
      setPages(
        data.libraryConcepts
          .map((row) => ({
            conceptId: row.conceptId,
            title: row.title,
          }))
          .sort((a, b) => a.title.localeCompare(b.title)),
      );
    } catch {
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, [props.companyId, props.libraryId]);

  useEffect(() => {
    if (!props.open || pages !== null) return;
    void load();
  }, [props.open, pages, load]);

  if (!props.open) return null;

  if (loading || pages === null) {
    return <p className="py-0.5 pl-5 text-[9px] text-[var(--color-ink-faint)]">Loading pages…</p>;
  }

  return (
    <ul
      className="max-h-48 space-y-0.5 overflow-y-auto overscroll-contain pl-5"
      data-testid={`library-folder-pages-${props.libraryId}`}
    >
      {props.overviewTopicId && props.onSelectTopic && (
        <li>
          <button
            type="button"
            data-testid={`library-folder-overview-${props.libraryId}`}
            onClick={() => props.onSelectTopic?.(props.overviewTopicId!)}
            className="flex w-full items-center gap-1 truncate rounded py-0.5 text-left text-[10px] text-[var(--color-ink)] hover:text-[var(--color-accent)]"
          >
            <FileText size={11} aria-hidden className="shrink-0 text-[var(--color-ink-faint)]" />
            <span className="truncate">Overview</span>
          </button>
        </li>
      )}
      {pages.length === 0 ? (
        <li>
          <p className="py-0.5 text-[9px] text-[var(--color-ink-faint)]">No pages in this folder.</p>
        </li>
      ) : (
        pages.map((p) => (
          <li key={p.conceptId}>
            <button
              type="button"
              data-testid={`library-folder-page-${p.conceptId}`}
              aria-label={`Open page ${displayPageTitle(p.title)}`}
              onClick={() => props.onSelectConcept(p.conceptId)}
              className="flex w-full items-center gap-1 truncate rounded py-0.5 text-left text-[10px] text-[var(--color-ink)] hover:text-[var(--color-accent)]"
            >
              <FileText size={11} aria-hidden className="shrink-0 text-[var(--color-ink-faint)]" />
              <span className="truncate">{displayPageTitle(p.title)}</span>
            </button>
          </li>
        ))
      )}
    </ul>
  );
}

function LibraryFolderRow(props: {
  companyId: string;
  library: Library;
  overviewTopicId: string | null;
  onSelectConcept: (conceptId: string) => void;
  onSelectLibrary?: (libraryId: string, libraryName: string) => void;
  onSelectTopic?: (topicId: string) => void;
  /** Baseline seeded folders start expanded so referenced pages are visible. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);

  const openFolder = () => {
    if (props.overviewTopicId && props.onSelectTopic) {
      props.onSelectTopic(props.overviewTopicId);
      return;
    }
    props.onSelectLibrary?.(props.library.id, props.library.name);
  };

  return (
    <div className="group/library" data-testid={`library-folder-${props.library.id}`}>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-expanded={open}
          aria-label={
            open
              ? `Collapse folder ${props.library.name}`
              : `Expand folder ${props.library.name}`
          }
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
          onClick={openFolder}
          aria-label={`Open folder ${props.library.name}`}
          className="flex min-w-0 flex-1 items-center gap-1 truncate rounded py-0.5 text-left text-[10px] text-[var(--color-ink)] hover:text-[var(--color-accent)]"
        >
          <FolderOpen size={11} aria-hidden className="shrink-0 text-[var(--color-ink-faint)]" />
          <span className="truncate">{props.library.name}</span>
        </button>
      </div>
      <LibraryPageLeaves
        companyId={props.companyId}
        libraryId={props.library.id}
        open={open}
        overviewTopicId={props.overviewTopicId}
        onSelectConcept={props.onSelectConcept}
        {...(props.onSelectTopic ? { onSelectTopic: props.onSelectTopic } : {})}
      />
    </div>
  );
}

function ShelfSection(props: {
  kind: LibraryShelfKind;
  libraries: Library[];
  companyId: string;
  topics: Array<{ id: string; title: string }>;
  onSelectConcept: (conceptId: string) => void;
  onSelectLibrary?: (libraryId: string, libraryName: string) => void;
  onSelectTopic?: (topicId: string) => void;
}) {
  const defaultOpen = props.kind === 'baseline_seeded';

  return (
    <details
      className="rounded border border-[var(--color-line)] px-2 py-1"
      open={defaultOpen ? true : undefined}
    >
      <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)] marker:content-none [&::-webkit-details-marker]:hidden">
        {LIBRARY_SHELF_LABELS[props.kind]}
      </summary>
      <div className="mt-1 space-y-0.5">
        {props.libraries.length === 0 ? (
          <p className="text-[10px] text-[var(--color-ink-faint)]">None yet.</p>
        ) : (
          props.libraries.map((lib) => {
            const overview = findLibraryOverviewTopic(lib.name, props.topics);
            return (
              <LibraryFolderRow
                key={lib.id}
                companyId={props.companyId}
                library={lib}
                overviewTopicId={overview?.id ?? null}
                onSelectConcept={props.onSelectConcept}
                defaultOpen={defaultOpen}
                {...(props.onSelectLibrary ? { onSelectLibrary: props.onSelectLibrary } : {})}
                {...(props.onSelectTopic ? { onSelectTopic: props.onSelectTopic } : {})}
              />
            );
          })
        )}
      </div>
    </details>
  );
}

function ResearchLibraryShelvesInner(props: ResearchLibraryShelvesProps) {
  const topics = props.topics ?? [];

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
            topics={topics}
            onSelectConcept={props.onSelectConcept}
            {...(props.onSelectLibrary ? { onSelectLibrary: props.onSelectLibrary } : {})}
            {...(props.onSelectTopic ? { onSelectTopic: props.onSelectTopic } : {})}
          />
        ))}
      </div>
    </div>
  );
}

export const ResearchLibraryShelves = memo(ResearchLibraryShelvesInner);
