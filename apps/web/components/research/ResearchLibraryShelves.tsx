'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileText, FolderOpen } from 'lucide-react';
import type { Library } from '@hftr/contracts';
import { api } from '@/lib/client';
import {
  BASELINE_SEEDED_LIBRARY_NAME,
  classifyLibraryShelf,
  findLibraryOverviewTopic,
  groupSeededPagesIntoCatalogShelves,
  humanizeConceptTitle,
  isBaselineSeededLibrary,
  LIBRARY_SHELF_LABELS,
  type LibraryShelfKind,
  type SeededCatalogGroup,
  type SeededPageRow,
  type SeededSubfolder,
} from '@/lib/research-library-shelves';

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

function PageLeafButton(props: {
  conceptId: string;
  title: string;
  onSelectConcept: (conceptId: string) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`library-folder-page-${props.conceptId}`}
      aria-label={`Open page ${humanizeConceptTitle(props.title)}`}
      onClick={() => props.onSelectConcept(props.conceptId)}
      className="flex w-full items-center gap-1 truncate rounded py-0.5 text-left text-[10px] text-[var(--color-ink)] hover:text-[var(--color-accent)]"
    >
      <FileText size={11} aria-hidden className="shrink-0 text-[var(--color-ink-faint)]" />
      <span className="truncate">{humanizeConceptTitle(props.title)}</span>
    </button>
  );
}

function SeededSubfolderRow(props: {
  folder: SeededSubfolder;
  defaultOpen?: boolean;
  onSelectConcept: (conceptId: string) => void;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);

  return (
    <div data-testid={`seeded-subfolder-${props.folder.id}`}>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-expanded={open}
          aria-label={
            open
              ? `Collapse folder ${props.folder.label}`
              : `Expand folder ${props.folder.label}`
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
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1 truncate rounded py-0.5 text-left text-[10px] text-[var(--color-ink)] hover:text-[var(--color-accent)]"
        >
          <FolderOpen size={11} aria-hidden className="shrink-0 text-[var(--color-ink-faint)]" />
          <span className="truncate">
            {props.folder.label}
            <span className="ml-1 text-[9px] text-[var(--color-ink-faint)]">
              {props.folder.pages.length}
            </span>
          </span>
        </button>
      </div>
      {open && (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto overscroll-contain pl-5">
          {props.folder.pages.map((p) => (
            <li key={p.conceptId}>
              <PageLeafButton
                conceptId={p.conceptId}
                title={p.title}
                onSelectConcept={props.onSelectConcept}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function catalogPageCount(group: SeededCatalogGroup): number {
  if (group.flatPages) return group.flatPages.length;
  return group.subfolders.reduce((n, s) => n + s.pages.length, 0);
}

/** Inline catalog folder under Baseline seeded (same chrome as runtime library folders). */
function SeededCatalogFolderRow(props: {
  group: SeededCatalogGroup;
  defaultOpen?: boolean;
  onSelectConcept: (conceptId: string) => void;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const count = catalogPageCount(props.group);
  const hasPages = count > 0;

  return (
    <div data-testid={`seeded-catalog-folder-${props.group.shelfId}`}>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-expanded={open}
          aria-label={
            open
              ? `Collapse folder ${props.group.label}`
              : `Expand folder ${props.group.label}`
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
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1 truncate rounded py-0.5 text-left text-[10px] text-[var(--color-ink)] hover:text-[var(--color-accent)]"
        >
          <FolderOpen size={11} aria-hidden className="shrink-0 text-[var(--color-ink-faint)]" />
          <span className="truncate">
            {props.group.label}
            <span className="ml-1 text-[9px] text-[var(--color-ink-faint)]">{count}</span>
          </span>
        </button>
      </div>
      {open && (
        <div className="max-h-40 space-y-0.5 overflow-y-auto overscroll-contain pl-5">
          {!hasPages ? (
            <p className="text-[10px] text-[var(--color-ink-faint)]">No pages in this folder.</p>
          ) : props.group.flatPages ? (
            <ul className="space-y-0.5">
              {props.group.flatPages.map((p) => (
                <li key={p.conceptId}>
                  <PageLeafButton
                    conceptId={p.conceptId}
                    title={p.title}
                    onSelectConcept={props.onSelectConcept}
                  />
                </li>
              ))}
            </ul>
          ) : (
            props.group.subfolders.map((folder) => (
              <SeededSubfolderRow
                key={folder.id}
                folder={folder}
                defaultOpen={folder.id === 'tier_a' || folder.id === props.group.subfolders[0]?.id}
                onSelectConcept={props.onSelectConcept}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BaselineSeededShelfSection(props: {
  groups: SeededCatalogGroup[];
  loading: boolean;
  overviewTopicId: string | null;
  libraryId: string | null;
  onSelectConcept: (conceptId: string) => void;
  onSelectTopic?: (topicId: string) => void;
  onSelectLibrary?: (libraryId: string, libraryName: string) => void;
}) {
  const hasAnyPages = props.groups.some((g) => catalogPageCount(g) > 0);

  return (
    <details
      className="rounded border border-[var(--color-line)] px-2 py-1"
      open={hasAnyPages || props.loading ? true : undefined}
      data-testid="seeded-catalog-shelf-baseline"
    >
      <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)] marker:content-none [&::-webkit-details-marker]:hidden">
        {LIBRARY_SHELF_LABELS.baseline_seeded}
      </summary>
      <div className="mt-1 max-h-72 space-y-0.5 overflow-y-auto overscroll-contain">
        {props.loading ? (
          <p className="text-[10px] text-[var(--color-ink-faint)]" data-testid="seeded-catalog-shelf-loading">
            Loading folders…
          </p>
        ) : (
          <>
            {props.overviewTopicId && props.onSelectTopic && (
              <button
                type="button"
                data-testid={`library-folder-overview-${props.libraryId ?? 'seeded'}`}
                onClick={() => props.onSelectTopic?.(props.overviewTopicId!)}
                className="flex w-full items-center gap-1 truncate rounded py-0.5 text-left text-[10px] text-[var(--color-ink)] hover:text-[var(--color-accent)]"
              >
                <FileText
                  size={11}
                  aria-hidden
                  className="shrink-0 text-[var(--color-ink-faint)]"
                />
                <span className="truncate">Overview · {BASELINE_SEEDED_LIBRARY_NAME}</span>
              </button>
            )}
            {!props.overviewTopicId && props.libraryId && props.onSelectLibrary && (
              <button
                type="button"
                onClick={() =>
                  props.onSelectLibrary?.(props.libraryId!, BASELINE_SEEDED_LIBRARY_NAME)
                }
                className="flex w-full items-center gap-1 truncate rounded py-0.5 text-left text-[10px] text-[var(--color-ink)] hover:text-[var(--color-accent)]"
              >
                <FolderOpen
                  size={11}
                  aria-hidden
                  className="shrink-0 text-[var(--color-ink-faint)]"
                />
                <span className="truncate">{BASELINE_SEEDED_LIBRARY_NAME}</span>
              </button>
            )}
            {props.groups.length === 0 ? (
              <p className="text-[10px] text-[var(--color-ink-faint)]">None yet.</p>
            ) : (
              props.groups.map((group) => (
                <SeededCatalogFolderRow
                  key={group.shelfId}
                  group={group}
                  defaultOpen={group.showOverview}
                  onSelectConcept={props.onSelectConcept}
                />
              ))
            )}
          </>
        )}
      </div>
    </details>
  );
}

function LibraryPageLeaves(props: {
  companyId: string;
  libraryId: string;
  open: boolean;
  overviewTopicId: string | null;
  onSelectConcept: (conceptId: string) => void;
  onSelectTopic?: (topicId: string) => void;
}) {
  const [pages, setPages] = useState<SeededPageRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{
        libraryConcepts: { conceptId: string; title: string; tags?: string[] }[];
      }>(`/api/companies/${props.companyId}/libraries/${props.libraryId}/concepts`);
      setPages(
        data.libraryConcepts
          .map((row) => ({
            conceptId: row.conceptId,
            title: row.title,
            tags: Array.isArray(row.tags) ? row.tags : [],
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
            <PageLeafButton
              conceptId={p.conceptId}
              title={p.title}
              onSelectConcept={props.onSelectConcept}
            />
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

function RuntimeShelfSection(props: {
  kind: Exclude<LibraryShelfKind, 'baseline_seeded'>;
  libraries: Library[];
  companyId: string;
  topics: Array<{ id: string; title: string }>;
  onSelectConcept: (conceptId: string) => void;
  onSelectLibrary?: (libraryId: string, libraryName: string) => void;
  onSelectTopic?: (topicId: string) => void;
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
          props.libraries.map((lib) => {
            const overview = findLibraryOverviewTopic(lib.name, props.topics);
            return (
              <LibraryFolderRow
                key={lib.id}
                companyId={props.companyId}
                library={lib}
                overviewTopicId={overview?.id ?? null}
                onSelectConcept={props.onSelectConcept}
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

function useBaselineSeededPages(companyId: string, libraryId: string | null) {
  const [pages, setPages] = useState<SeededPageRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!libraryId) {
      setPages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void api<{
      libraryConcepts: { conceptId: string; title: string; tags?: string[] }[];
    }>(`/api/companies/${companyId}/libraries/${libraryId}/concepts`)
      .then((data) => {
        if (cancelled) return;
        setPages(
          data.libraryConcepts.map((row) => ({
            conceptId: row.conceptId,
            title: row.title,
            tags: Array.isArray(row.tags) ? row.tags : [],
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setPages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, libraryId]);

  return { pages, loading };
}

function ResearchLibraryShelvesInner(props: ResearchLibraryShelvesProps) {
  const topics = props.topics ?? [];

  const { runtimeLibraries, systemLibraries, baselineLibraries } = useMemo(() => {
    const runtime: Library[] = [];
    const system: Library[] = [];
    const baseline: Library[] = [];
    for (const lib of props.libraries) {
      if (lib.status !== 'active') continue;
      const kind = classifyLibraryShelf(lib);
      if (kind === 'baseline_seeded') baseline.push(lib);
      else if (kind === 'system_curated') system.push(lib);
      else runtime.push(lib);
    }
    runtime.sort((a, b) => a.name.localeCompare(b.name));
    system.sort((a, b) => a.name.localeCompare(b.name));
    baseline.sort((a, b) => a.name.localeCompare(b.name));
    return {
      runtimeLibraries: runtime,
      systemLibraries: system,
      baselineLibraries: baseline,
    };
  }, [props.libraries]);

  const primaryBaseline =
    baselineLibraries.find((l) => isBaselineSeededLibrary(l)) ?? baselineLibraries[0] ?? null;
  const overview = primaryBaseline
    ? findLibraryOverviewTopic(primaryBaseline.name, topics)
    : findLibraryOverviewTopic(BASELINE_SEEDED_LIBRARY_NAME, topics);

  const { pages: seededPages, loading: seededLoading } = useBaselineSeededPages(
    props.companyId,
    primaryBaseline?.id ?? null,
  );

  const seededGroups = useMemo(
    () => groupSeededPagesIntoCatalogShelves(seededPages ?? []),
    [seededPages],
  );

  return (
    <div
      data-testid="research-library-shelves"
      className="rounded-lg border border-[var(--color-line)] p-2.5"
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
        Library shelves
      </p>
      <div className="mt-1.5 space-y-1.5">
        <RuntimeShelfSection
          kind="system_curated"
          libraries={systemLibraries}
          companyId={props.companyId}
          topics={topics}
          onSelectConcept={props.onSelectConcept}
          {...(props.onSelectLibrary ? { onSelectLibrary: props.onSelectLibrary } : {})}
          {...(props.onSelectTopic ? { onSelectTopic: props.onSelectTopic } : {})}
        />
        <RuntimeShelfSection
          kind="runtime"
          libraries={runtimeLibraries}
          companyId={props.companyId}
          topics={topics}
          onSelectConcept={props.onSelectConcept}
          {...(props.onSelectLibrary ? { onSelectLibrary: props.onSelectLibrary } : {})}
          {...(props.onSelectTopic ? { onSelectTopic: props.onSelectTopic } : {})}
        />

        <BaselineSeededShelfSection
          groups={seededGroups}
          loading={seededLoading || seededPages === null}
          overviewTopicId={overview?.id ?? null}
          libraryId={primaryBaseline?.id ?? null}
          onSelectConcept={props.onSelectConcept}
          {...(props.onSelectTopic ? { onSelectTopic: props.onSelectTopic } : {})}
          {...(props.onSelectLibrary ? { onSelectLibrary: props.onSelectLibrary } : {})}
        />
      </div>
    </div>
  );
}

export const ResearchLibraryShelves = memo(ResearchLibraryShelvesInner);
