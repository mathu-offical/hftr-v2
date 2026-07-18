'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileText, FolderOpen, RefreshCw } from 'lucide-react';
import type { Library } from '@hftr/contracts';
import { api } from '@/lib/client';
import {
  BASELINE_SEEDED_LIBRARY_NAME,
  classifyLibraryShelf,
  findCatalogDirectiveTopic,
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
import { fetchLibraryConceptPages } from '@/lib/research-resource-api';
import {
  peekResearchResource,
  readResearchShelfUiState,
  writeResearchShelfUiState,
  type ResearchShelfUiState,
} from '@/lib/research-resource-cache';

export interface ResearchLibraryShelvesProps {
  companyId: string;
  libraries: Library[];
  /** Company topics — used to attach an overview page to a library folder by title. */
  topics?: Array<{ id: string; title: string }>;
  /** Soft background refresh of libraries/topics/concepts in progress. */
  shellRefreshing?: boolean;
  /** Force refresh of library shell lists. */
  onRefreshShell?: () => void;
  onSelectConcept: (conceptId: string) => void;
  /** Primary click when no matching overview topic — library inspector + nest. */
  onSelectLibrary?: (libraryId: string, libraryName: string) => void;
  /** Open overview / index topic for a library folder (e.g. Seeded trading mechanisms). */
  onSelectTopic?: (topicId: string) => void;
  /** Research module for librarian Curate on custom (runtime) libraries (D-127). */
  researchModuleId?: string | null;
  onLibraryActionComplete?: () => void;
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
            open ? `Collapse folder ${props.folder.label}` : `Expand folder ${props.folder.label}`
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
  open: boolean;
  directiveTopicId: string | null;
  onOpenChange: (open: boolean) => void;
  onSelectConcept: (conceptId: string) => void;
  onSelectTopic?: (topicId: string) => void;
}) {
  const open = props.open;
  const count = catalogPageCount(props.group);
  const hasPages = count > 0;
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(open) : next;
    props.onOpenChange(value);
  };

  return (
    <div data-testid={`seeded-catalog-folder-${props.group.shelfId}`}>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-expanded={open}
          aria-label={
            open ? `Collapse folder ${props.group.label}` : `Expand folder ${props.group.label}`
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
          {props.directiveTopicId && props.onSelectTopic ? (
            <button
              type="button"
              data-testid={`seeded-catalog-directive-${props.group.shelfId}`}
              onClick={() => props.onSelectTopic?.(props.directiveTopicId!)}
              className="flex w-full items-center gap-1 truncate rounded py-0.5 text-left text-[10px] text-[var(--color-ink)] hover:text-[var(--color-accent)]"
            >
              <FileText size={11} aria-hidden className="shrink-0 text-[var(--color-ink-faint)]" />
              <span className="truncate">Directive · {props.group.label}</span>
            </button>
          ) : null}
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
  refreshing: boolean;
  openCatalogFolderIds: string[];
  onToggleCatalogFolder: (shelfId: string, open: boolean) => void;
  overviewTopicId: string | null;
  libraryId: string | null;
  topics: Array<{ id: string; title: string }>;
  onSelectConcept: (conceptId: string) => void;
  onSelectTopic?: (topicId: string) => void;
  onSelectLibrary?: (libraryId: string, libraryName: string) => void;
}) {
  const hasAnyPages = props.groups.some((g) => catalogPageCount(g) > 0);
  const openSet = useMemo(() => new Set(props.openCatalogFolderIds), [props.openCatalogFolderIds]);

  return (
    <details
      className="rounded border border-[var(--color-line)] px-2 py-1"
      open={hasAnyPages || props.loading ? true : undefined}
      data-testid="seeded-catalog-shelf-baseline"
    >
      <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)] marker:content-none [&::-webkit-details-marker]:hidden">
        {LIBRARY_SHELF_LABELS.baseline_seeded}
        {props.refreshing ? (
          <span className="ml-1 normal-case tracking-normal text-[9px]">updating…</span>
        ) : null}
      </summary>
      <div className="mt-1 max-h-72 space-y-0.5 overflow-y-auto overscroll-contain">
        {props.loading ? (
          <p
            className="text-[10px] text-[var(--color-ink-faint)]"
            data-testid="seeded-catalog-shelf-loading"
          >
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
              props.groups.map((group) => {
                const isOpen =
                  openSet.has(group.shelfId) ||
                  (props.openCatalogFolderIds.length === 0 && group.showOverview);
                const directive = findCatalogDirectiveTopic(group.catalog, props.topics);
                return (
                  <SeededCatalogFolderRow
                    key={group.shelfId}
                    group={group}
                    open={isOpen}
                    directiveTopicId={directive?.id ?? null}
                    onOpenChange={(next) => props.onToggleCatalogFolder(group.shelfId, next)}
                    onSelectConcept={props.onSelectConcept}
                    {...(props.onSelectTopic ? { onSelectTopic: props.onSelectTopic } : {})}
                  />
                );
              })
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
  const cached = peekResearchResource<SeededPageRow[]>({
    kind: 'libraryConcepts',
    companyId: props.companyId,
    libraryId: props.libraryId,
  });
  const [pages, setPages] = useState<SeededPageRow[] | null>(cached);
  const [loading, setLoading] = useState(cached === null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (force = false) => {
      const had = peekResearchResource<SeededPageRow[]>({
        kind: 'libraryConcepts',
        companyId: props.companyId,
        libraryId: props.libraryId,
      });
      if (had) setRefreshing(true);
      else setLoading(true);
      try {
        const next = await fetchLibraryConceptPages(props.companyId, props.libraryId, {
          force,
        });
        setPages(next);
      } catch {
        if (!had) setPages([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [props.companyId, props.libraryId],
  );

  useEffect(() => {
    if (!props.open) return;
    void load(false);
  }, [props.open, load]);

  if (!props.open) return null;

  if (loading && pages === null) {
    return <p className="py-0.5 pl-5 text-[9px] text-[var(--color-ink-faint)]">Loading pages…</p>;
  }

  return (
    <ul
      className="max-h-48 space-y-0.5 overflow-y-auto overscroll-contain pl-5"
      data-testid={`library-folder-pages-${props.libraryId}`}
    >
      {refreshing ? (
        <li>
          <p className="py-0.5 text-[9px] text-[var(--color-ink-faint)]">Updating pages…</p>
        </li>
      ) : null}
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
      {(pages ?? []).length === 0 ? (
        <li>
          <p className="py-0.5 text-[9px] text-[var(--color-ink-faint)]">
            No pages in this folder.
          </p>
        </li>
      ) : (
        (pages ?? []).map((p) => (
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectConcept: (conceptId: string) => void;
  onSelectLibrary?: (libraryId: string, libraryName: string) => void;
  onSelectTopic?: (topicId: string) => void;
  /** When set, show librarian Curate / Verify / Refresh on custom libraries (D-127). */
  librarianActions?: {
    researchModuleId: string | null;
    onAfterAction?: () => void;
  };
}) {
  const open = props.open;
  const [actionBusy, setActionBusy] = useState<'curate' | 'verify' | 'refresh' | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const openFolder = () => {
    if (props.overviewTopicId && props.onSelectTopic) {
      props.onSelectTopic(props.overviewTopicId);
      return;
    }
    props.onSelectLibrary?.(props.library.id, props.library.name);
  };

  const runLibrarianAction = async (action: 'curate' | 'verify' | 'refresh') => {
    setActionBusy(action);
    setActionMsg(null);
    try {
      const result = await api<{
        action: string;
        verifiedCount?: number;
        queued?: boolean;
      }>(`/api/companies/${props.companyId}/libraries/${props.library.id}/actions`, {
        method: 'POST',
        body: {
          action,
          ...(props.librarianActions?.researchModuleId
            ? { moduleId: props.librarianActions.researchModuleId }
            : {}),
        },
      });
      if (action === 'verify') {
        setActionMsg(
          typeof result.verifiedCount === 'number'
            ? `Verified ${result.verifiedCount}`
            : 'Verified',
        );
      } else if (action === 'curate') {
        setActionMsg(result.queued ? 'Curate queued' : 'Curate sent');
      } else {
        setActionMsg('Refreshed');
      }
      props.librarianActions?.onAfterAction?.();
    } catch {
      setActionMsg('Action failed');
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="group/library" data-testid={`library-folder-${props.library.id}`}>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-expanded={open}
          aria-label={
            open ? `Collapse folder ${props.library.name}` : `Expand folder ${props.library.name}`
          }
          onClick={() => props.onOpenChange(!open)}
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
      {props.librarianActions ? (
        <div
          className="mb-0.5 ml-5 flex flex-wrap items-center gap-1"
          data-testid={`library-librarian-actions-${props.library.id}`}
        >
          {(
            [
              ['curate', 'Curate'],
              ['verify', 'Verify'],
              ['refresh', 'Refresh'],
            ] as const
          ).map(([action, label]) => (
            <button
              key={action}
              type="button"
              disabled={actionBusy !== null}
              onClick={() => void runLibrarianAction(action)}
              aria-label={`${label} library ${props.library.name}`}
              className="rounded border border-[var(--color-line)] px-1 py-0 text-[8px] uppercase tracking-wide text-[var(--color-ink-faint)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
            >
              {actionBusy === action ? '…' : label}
            </button>
          ))}
          {actionMsg ? (
            <span className="text-[8px] text-[var(--color-ink-faint)]">{actionMsg}</span>
          ) : null}
        </div>
      ) : null}
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
  openLibraryIds: string[];
  onToggleLibrary: (libraryId: string, open: boolean) => void;
  onSelectConcept: (conceptId: string) => void;
  onSelectLibrary?: (libraryId: string, libraryName: string) => void;
  onSelectTopic?: (topicId: string) => void;
  librarianActions?: {
    researchModuleId: string | null;
    onAfterAction?: () => void;
  };
}) {
  const openSet = useMemo(() => new Set(props.openLibraryIds), [props.openLibraryIds]);

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
                open={openSet.has(lib.id)}
                onOpenChange={(next) => props.onToggleLibrary(lib.id, next)}
                onSelectConcept={props.onSelectConcept}
                {...(props.onSelectLibrary ? { onSelectLibrary: props.onSelectLibrary } : {})}
                {...(props.onSelectTopic ? { onSelectTopic: props.onSelectTopic } : {})}
                {...(props.kind === 'runtime' && props.librarianActions
                  ? { librarianActions: props.librarianActions }
                  : {})}
              />
            );
          })
        )}
      </div>
    </details>
  );
}

function useBaselineSeededPages(companyId: string, libraryId: string | null, refreshKey = 0) {
  const cached =
    libraryId != null
      ? peekResearchResource<SeededPageRow[]>({
          kind: 'libraryConcepts',
          companyId,
          libraryId,
        })
      : [];
  const [pages, setPages] = useState<SeededPageRow[] | null>(libraryId == null ? [] : cached);
  const [loading, setLoading] = useState(libraryId != null && cached === null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!libraryId) {
      setPages([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const force = refreshKey > 0;
    const had = peekResearchResource<SeededPageRow[]>({
      kind: 'libraryConcepts',
      companyId,
      libraryId,
    });
    if (had && !force) {
      setPages(had);
      setLoading(false);
      setRefreshing(true);
    } else if (!had) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    void fetchLibraryConceptPages(companyId, libraryId, { force })
      .then((next) => {
        if (!cancelled) setPages(next);
      })
      .catch(() => {
        if (!cancelled && !had) setPages([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, libraryId, refreshKey]);

  return { pages, loading, refreshing };
}

function toggleIdInList(ids: string[], id: string, open: boolean): string[] {
  if (open) return ids.includes(id) ? ids : [...ids, id];
  return ids.filter((x) => x !== id);
}

function ResearchLibraryShelvesInner(props: ResearchLibraryShelvesProps) {
  const topics = props.topics ?? [];
  const [shelfUi, setShelfUi] = useState<ResearchShelfUiState>(() =>
    readResearchShelfUiState(props.companyId),
  );
  const [baselineRefreshKey, setBaselineRefreshKey] = useState(0);

  useEffect(() => {
    setShelfUi(readResearchShelfUiState(props.companyId));
  }, [props.companyId]);

  const persistShelfUi = useCallback(
    (next: ResearchShelfUiState) => {
      setShelfUi(next);
      writeResearchShelfUiState(props.companyId, next);
    },
    [props.companyId],
  );

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

  const {
    pages: seededPages,
    loading: seededLoading,
    refreshing: seededRefreshing,
  } = useBaselineSeededPages(props.companyId, primaryBaseline?.id ?? null, baselineRefreshKey);

  const seededGroups = useMemo(
    () => groupSeededPagesIntoCatalogShelves(seededPages ?? []),
    [seededPages],
  );

  // First visit: open the overview catalog folder by default and persist it.
  useEffect(() => {
    if (shelfUi.openCatalogFolderIds.length > 0) return;
    const first = seededGroups.find((g) => g.showOverview);
    if (!first) return;
    const current = readResearchShelfUiState(props.companyId);
    if (current.openCatalogFolderIds.length > 0) {
      setShelfUi(current);
      return;
    }
    persistShelfUi({
      ...current,
      openCatalogFolderIds: [first.shelfId],
    });
  }, [seededGroups, shelfUi.openCatalogFolderIds.length, persistShelfUi, props.companyId]);

  return (
    <div
      data-testid="research-library-shelves"
      className="rounded-lg border border-[var(--color-line)] p-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Library shelves
        </p>
        {props.onRefreshShell ? (
          <button
            type="button"
            data-testid="research-library-shelves-refresh"
            aria-label="Refresh library shelves"
            title="Refresh library lists"
            onClick={() => {
              setBaselineRefreshKey((k) => k + 1);
              props.onRefreshShell?.();
            }}
            className="rounded p-0.5 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          >
            <RefreshCw
              size={11}
              aria-hidden
              className={props.shellRefreshing ? 'animate-spin' : undefined}
            />
          </button>
        ) : null}
      </div>
      <div className="mt-1.5 space-y-1.5">
        <RuntimeShelfSection
          kind="system_curated"
          libraries={systemLibraries}
          companyId={props.companyId}
          topics={topics}
          openLibraryIds={shelfUi.openSystemLibraryIds}
          onToggleLibrary={(libraryId, open) =>
            persistShelfUi({
              ...shelfUi,
              openSystemLibraryIds: toggleIdInList(shelfUi.openSystemLibraryIds, libraryId, open),
            })
          }
          onSelectConcept={props.onSelectConcept}
          {...(props.onSelectLibrary ? { onSelectLibrary: props.onSelectLibrary } : {})}
          {...(props.onSelectTopic ? { onSelectTopic: props.onSelectTopic } : {})}
        />
        <RuntimeShelfSection
          kind="runtime"
          libraries={runtimeLibraries}
          companyId={props.companyId}
          topics={topics}
          openLibraryIds={shelfUi.openRuntimeLibraryIds}
          onToggleLibrary={(libraryId, open) =>
            persistShelfUi({
              ...shelfUi,
              openRuntimeLibraryIds: toggleIdInList(shelfUi.openRuntimeLibraryIds, libraryId, open),
            })
          }
          onSelectConcept={props.onSelectConcept}
          {...(props.onSelectLibrary ? { onSelectLibrary: props.onSelectLibrary } : {})}
          {...(props.onSelectTopic ? { onSelectTopic: props.onSelectTopic } : {})}
          librarianActions={{
            researchModuleId: props.researchModuleId ?? null,
            ...(props.onLibraryActionComplete
              ? { onAfterAction: props.onLibraryActionComplete }
              : {}),
          }}
        />

        <BaselineSeededShelfSection
          groups={seededGroups}
          loading={seededLoading && seededPages === null}
          refreshing={seededRefreshing || Boolean(props.shellRefreshing)}
          openCatalogFolderIds={shelfUi.openCatalogFolderIds}
          onToggleCatalogFolder={(shelfId, open) =>
            persistShelfUi({
              ...shelfUi,
              openCatalogFolderIds: toggleIdInList(shelfUi.openCatalogFolderIds, shelfId, open),
            })
          }
          overviewTopicId={overview?.id ?? null}
          libraryId={primaryBaseline?.id ?? null}
          topics={topics}
          onSelectConcept={props.onSelectConcept}
          {...(props.onSelectTopic ? { onSelectTopic: props.onSelectTopic } : {})}
          {...(props.onSelectLibrary ? { onSelectLibrary: props.onSelectLibrary } : {})}
        />
      </div>
    </div>
  );
}

export const ResearchLibraryShelves = memo(ResearchLibraryShelvesInner);
