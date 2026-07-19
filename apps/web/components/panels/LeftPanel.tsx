'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import type { CurationStatus, Library, ResearchTopic } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import { useResearchView } from '@/components/research/ResearchViewContext';
import { ResearchLibraryShelves } from '@/components/research/ResearchLibraryShelves';
import { ResearchNewTopicButton } from '@/components/research/ResearchNewTopicButton';
import { ResearchArticlesList } from '@/components/research/ResearchArticlesList';
import { ResearchPagesList } from '@/components/research/ResearchPagesList';
import { snippet, toneFor } from './format';
import {
  fetchCompanyConcepts,
  fetchCompanyLibraries,
  fetchCompanyTopics,
  invalidateAfterResearchMutation,
  type ResearchConceptRow,
  warmLibraryConceptPages,
} from '@/lib/research-resource-api';
import { peekResearchResource } from '@/lib/research-resource-cache';
import { isBaselineSeededLibrary } from '@/lib/research-library-shelves';
import { MarketPosturePanel } from '@/components/panels/MarketPosturePanel';
import { useMarketPostureView } from '@/components/panels/MarketPostureViewContext';
import { useDataView } from '@/components/panels/DataViewContext';
import { LiveDataSourcesList } from '@/components/panels/LiveDataSourcesList';
import { CompanyLibrarySourcesList } from '@/components/panels/CompanyLibrarySourcesList';
import { PanelTabs } from '@/components/panels/PanelTabs';
import { PanelEdgeRail } from '@/components/panels/PanelEdgeRail';
import { usePanelShell } from '@/components/panels/PanelShellContext';
import { Activity, Database, Library as LibraryIcon, Orbit } from 'lucide-react';

type Tab = 'research' | 'market_posture' | 'data';
const LEFT_TABS: Tab[] = ['research', 'market_posture', 'data'];

function isEditableTarget(e: KeyboardEvent): boolean {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable;
}

function readPanelState<T extends Record<string, unknown>>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

function writePanelState(key: string, value: Record<string, unknown>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota or private mode — ignore
  }
}

function isLeftTab(v: unknown): v is Tab {
  return typeof v === 'string' && LEFT_TABS.includes(v as Tab);
}

interface ModuleOption {
  id: string;
  name: string;
  type: string;
  status: string;
  config: Record<string, unknown>;
}

interface LinkRow {
  fromModuleId: string;
  toModuleId: string;
  linkKind: string;
}

type ConceptRow = ResearchConceptRow;

/**
 * Left panel (ui-ux spec / D-120): Research, Market posture, Data sources.
 * Libraries dock is first-class left-panel chrome (all tabs). DATA lists live hydrators;
 * company library modules live under the dock Company section. Galaxy stays Research-owned.
 */
export function LeftPanel(props: { modules: ModuleOption[]; links: LinkRow[] }) {
  // page.tsx does not pass companyId; the panel only renders under
  // /companies/[companyId], so the route param is the reliable source.
  const params = useParams<{ companyId: string }>();
  const companyId = params?.companyId ?? '';

  const storageKey = companyId ? `hftr:${companyId}:panel:left` : null;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('research');
  /** Bottom Libraries dock (D-095); default open, operator-hideable to a card. */
  const [librariesDockOpen, setLibrariesDockOpen] = useState(true);
  /** D-128: rail Libraries button expands dock to full left-panel height. */
  const [librariesFull, setLibrariesFull] = useState(false);
  const [persistReady, setPersistReady] = useState(false);
  const [concepts, setConcepts] = useState<ConceptRow[]>(() =>
    companyId ? (peekResearchResource<ConceptRow[]>({ kind: 'concepts', companyId }) ?? []) : [],
  );
  const [libraries, setLibraries] = useState<Library[]>(() =>
    companyId ? (peekResearchResource<Library[]>({ kind: 'libraries', companyId }) ?? []) : [],
  );
  const [librariesLoaded, setLibrariesLoaded] = useState(() =>
    companyId ? peekResearchResource<Library[]>({ kind: 'libraries', companyId }) !== null : false,
  );
  const [topics, setTopics] = useState<ResearchTopic[]>(() =>
    companyId ? (peekResearchResource<ResearchTopic[]>({ kind: 'topics', companyId }) ?? []) : [],
  );
  const [topicsLoaded, setTopicsLoaded] = useState(() =>
    companyId
      ? peekResearchResource<ResearchTopic[]>({ kind: 'topics', companyId }) !== null
      : false,
  );
  const [conceptsLoaded, setConceptsLoaded] = useState(() =>
    companyId ? peekResearchResource<ConceptRow[]>({ kind: 'concepts', companyId }) !== null : false,
  );
  const [shellRefreshing, setShellRefreshing] = useState(false);
  const researchView = useResearchView();
  const marketPostureView = useMarketPostureView();
  const dataView = useDataView();
  const panelShell = usePanelShell();
  const prevLeftOpenRef = useRef(false);

  useEffect(() => {
    if (!storageKey) {
      setPersistReady(true);
      return;
    }
    const stored = readPanelState<{
      open?: unknown;
      tab?: unknown;
      librariesDockOpen?: unknown;
      librariesFull?: unknown;
    }>(storageKey);
    if (stored) {
      if (typeof stored.open === 'boolean') setOpen(stored.open);
      if (isLeftTab(stored.tab)) setTab(stored.tab);
      if (typeof stored.librariesDockOpen === 'boolean') {
        setLibrariesDockOpen(stored.librariesDockOpen);
      }
      if (typeof stored.librariesFull === 'boolean') {
        setLibrariesFull(stored.librariesFull);
      }
    }
    setPersistReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !persistReady) return;
    writePanelState(storageKey, { open, tab, librariesDockOpen, librariesFull });
  }, [storageKey, open, tab, librariesDockOpen, librariesFull, persistReady]);

  // D-185: sync left open to shell; opening left collapses right.
  useEffect(() => {
    panelShell.setLeftOpenShared(open);
  }, [open, panelShell.setLeftOpenShared]);

  useEffect(() => {
    if (!persistReady) return;
    if (open && !prevLeftOpenRef.current) {
      panelShell.notifyLeftOpened();
    }
    prevLeftOpenRef.current = open;
  }, [open, persistReady, panelShell.notifyLeftOpened]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '[' && !isEditableTarget(e)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open && !isEditableTarget(e)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const loadConcepts = useCallback(
    async (force = false) => {
      if (!companyId) return;
      try {
        const next = await fetchCompanyConcepts(companyId, { force });
        setConcepts(next);
        setConceptsLoaded(true);
      } catch {
        // Route may not be deployed yet; keep whatever we have.
        if (peekResearchResource<ConceptRow[]>({ kind: 'concepts', companyId }) === null) {
          setConcepts([]);
        }
      } finally {
        setConceptsLoaded(true);
      }
    },
    [companyId],
  );

  const loadLibraries = useCallback(
    async (force = false) => {
      if (!companyId) return;
      try {
        const next = await fetchCompanyLibraries(companyId, { force });
        setLibraries(next);
        // Warm baseline folder indexes so catalog chrome paints without a second wait.
        for (const lib of next) {
          if (lib.status === 'active' && isBaselineSeededLibrary(lib)) {
            warmLibraryConceptPages(companyId, lib.id);
          }
        }
      } catch {
        if (peekResearchResource<Library[]>({ kind: 'libraries', companyId }) === null) {
          setLibraries([]);
        }
      } finally {
        setLibrariesLoaded(true);
      }
    },
    [companyId],
  );

  const loadTopics = useCallback(
    async (force = false) => {
      if (!companyId) return;
      // D-166: no research modules → topics stay blank (do not surface orphaned rows).
      const hasResearch = props.modules.some((m) => m.type === 'research');
      if (!hasResearch) {
        setTopics([]);
        setTopicsLoaded(true);
        return;
      }
      try {
        const next = await fetchCompanyTopics(companyId, { force });
        setTopics(next);
      } catch {
        if (peekResearchResource<ResearchTopic[]>({ kind: 'topics', companyId }) === null) {
          setTopics([]);
        }
      } finally {
        setTopicsLoaded(true);
      }
    },
    [companyId, props.modules],
  );

  const refreshShell = useCallback(
    async (force = false) => {
      if (!companyId) return;
      setShellRefreshing(true);
      try {
        if (force) {
          invalidateAfterResearchMutation(companyId, 'libraryPages');
        }
        await Promise.all([loadLibraries(force), loadTopics(force), loadConcepts(force)]);
      } finally {
        setShellRefreshing(false);
      }
    },
    [companyId, loadLibraries, loadTopics, loadConcepts],
  );

  // Hydrate / warm shell as soon as the company page mounts (panel may stay collapsed).
  useEffect(() => {
    if (!companyId) return;
    const cachedLibs = peekResearchResource<Library[]>({ kind: 'libraries', companyId });
    const cachedTopics = peekResearchResource<ResearchTopic[]>({ kind: 'topics', companyId });
    const cachedConcepts = peekResearchResource<ConceptRow[]>({ kind: 'concepts', companyId });
    if (cachedLibs) {
      setLibraries(cachedLibs);
      setLibrariesLoaded(true);
    }
    if (cachedTopics) {
      setTopics(cachedTopics);
      setTopicsLoaded(true);
    }
    if (cachedConcepts) {
      setConcepts(cachedConcepts);
      setConceptsLoaded(true);
    }
    void refreshShell(false);
  }, [companyId, refreshShell]);

  // While the Research panel is open, soft-revalidate on an interval (SWR, not hard wipe).
  useEffect(() => {
    if (!open) return;
    void refreshShell(false);
    const interval = setInterval(() => {
      void refreshShell(false);
    }, 30_000);
    return () => clearInterval(interval);
  }, [open, refreshShell]);

  // Galaxy overlay is owned by the left Research panel — open/close together.
  useEffect(() => {
    researchView.registerLeftPanelBridge({
      ensureResearchOpen: () => {
        panelShell.notifyLeftOpened();
        setOpen(true);
        setTab('research');
      },
      collapse: () => setOpen(false),
    });
    return () => researchView.registerLeftPanelBridge(null);
  }, [researchView.registerLeftPanelBridge, panelShell.notifyLeftOpened]);

  useEffect(() => {
    marketPostureView.registerLeftPanelBridge({
      ensurePostureOpen: () => {
        panelShell.notifyLeftOpened();
        setOpen(true);
        setTab('market_posture');
      },
      collapse: () => setOpen(false),
    });
    return () => marketPostureView.registerLeftPanelBridge(null);
  }, [marketPostureView.registerLeftPanelBridge, panelShell.notifyLeftOpened]);

  useEffect(() => {
    dataView.registerLeftPanelBridge({
      ensureDataOpen: () => {
        panelShell.notifyLeftOpened();
        setOpen(true);
        setTab('data');
      },
      collapse: () => setOpen(false),
    });
    return () => dataView.registerLeftPanelBridge(null);
  }, [dataView.registerLeftPanelBridge, panelShell.notifyLeftOpened]);

  // Mutual exclusion: Galaxy | Market posture | Data Explorer (D-120).
  useEffect(() => {
    if (open && tab === 'research') {
      researchView.openOverlay();
      marketPostureView.closeOverlay();
      dataView.closeOverlay();
    } else if (open && tab === 'market_posture') {
      marketPostureView.openOverlay();
      researchView.closeOverlay();
      dataView.closeOverlay();
    } else if (open && tab === 'data') {
      dataView.openOverlay();
      researchView.closeOverlay();
      marketPostureView.closeOverlay();
    } else {
      researchView.closeOverlay();
      marketPostureView.closeOverlay();
      dataView.closeOverlay();
    }
  }, [
    open,
    tab,
    researchView.openOverlay,
    researchView.closeOverlay,
    marketPostureView.openOverlay,
    marketPostureView.closeOverlay,
    dataView.openOverlay,
    dataView.closeOverlay,
  ]);

  const researchModules = props.modules.filter(
    (m) => m.type === 'research' || m.type === 'librarian',
  );
  const topicOwnerModules = props.modules.filter((m) => m.type === 'research');
  const requiresOperatorApproval = researchModules.some(
    (m) => m.config.admissionMode === 'require_operator_approval',
  );
  const companyLibraryModules = props.modules.filter((m) => m.type === 'library');
  const liveApiModules = props.modules.filter((m) => m.type === 'live_api');
  const nameOf = (id: string) => props.modules.find((m) => m.id === id)?.name ?? 'unknown';

  function browseLibrary(libraryId: string, libraryName: string) {
    setOpen(true);
    researchView.inspectLibrary(libraryId, libraryName);
  }

  function browseConcept(conceptId: string, _title?: string) {
    setOpen(true);
    researchView.inspectConcept(conceptId);
  }

  async function browseCompanyModule(moduleId: string, moduleName: string) {
    setOpen(true);
    const mod = companyLibraryModules.find((m) => m.id === moduleId);
    const topicScope =
      mod && typeof mod.config.topicScope === 'string' ? mod.config.topicScope : '';
    try {
      const libs = await fetchCompanyLibraries(companyId, { force: false });
      const match =
        (topicScope ? libs.find((l) => l.topicScope === topicScope) : undefined) ??
        libs.find((l) => l.name === moduleName) ??
        null;
      if (match) {
        researchView.inspectLibrary(match.id, match.name);
        return;
      }
    } catch {
      // fall through
    }
    setTab('data');
    dataView.selectCompanyModule(moduleId, moduleName);
  }

  function selectLeftTab(id: Tab) {
    // Header tabs: re-click active collapses (rail handled in PanelEdgeRail).
    if (open && tab === id && !librariesFull) {
      panelShell.notifyLeftInteract();
      setOpen(false);
      return;
    }
    panelShell.notifyLeftInteract();
    setLibrariesFull(false);
    setTab(id);
    setOpen(true);
  }

  function openLibrariesFull() {
    if (open && librariesFull) {
      panelShell.notifyLeftInteract();
      setLibrariesFull(false);
      setOpen(false);
      return;
    }
    panelShell.notifyLeftInteract();
    setLibrariesDockOpen(true);
    setLibrariesFull(true);
    setOpen(true);
  }

  // D-118 / D-123 / D-128 / D-185: wider edge rail with tab symbols + Libraries full-height action.
  return (
    <div
      className="flex h-full min-h-0 shrink-0"
      onClickCapture={() => panelShell.notifyLeftInteract()}
    >
      <PanelEdgeRail
        side="left"
        open={open}
        activeTab={tab}
        aria-label="Left panel sections"
        collapseLabel="Collapse left panel (keyboard shortcut [ or Escape)"
        expandLabel="Expand left panel (keyboard shortcut [)"
        onToggleOpen={() => setOpen((v) => !v)}
        onSelectTab={selectLeftTab}
        items={[
          {
            id: 'research',
            label: 'Research',
            abbrev: 'RSH',
            icon: Orbit,
            meta:
              concepts.length + topics.length > 0
                ? String(concepts.length + topics.length)
                : undefined,
          },
          {
            id: 'market_posture',
            label: 'Market posture',
            abbrev: 'PST',
            icon: Activity,
          },
          {
            id: 'data',
            label: 'Live data sources',
            abbrev: 'DAT',
            icon: Database,
            meta: liveApiModules.length > 0 ? String(liveApiModules.length) : undefined,
          },
        ]}
        railActions={[
          {
            id: 'libraries',
            label: 'Libraries (full height)',
            abbrev: 'LIB',
            icon: LibraryIcon,
            pressed: open && librariesFull,
            exclusive: true,
            meta: librariesLoaded && libraries.length > 0 ? String(libraries.length) : undefined,
            onClick: openLibrariesFull,
          },
        ]}
      />

      {open ? (
        <aside className="flex h-full min-h-0 w-80 shrink-0 flex-col overflow-hidden border-r border-[var(--color-line)] bg-[var(--color-surface-1)]">
          <div className="flex shrink-0 items-stretch border-b border-[var(--color-line)]">
            <PanelTabs
              aria-label="Left panel sections"
              className="min-w-0 flex-1"
              value={tab}
              onChange={selectLeftTab}
              tabs={[
                {
                  id: 'research',
                  label: 'Research',
                  title: 'Research',
                  meta:
                    concepts.length + topics.length > 0
                      ? String(concepts.length + topics.length)
                      : undefined,
                },
                {
                  id: 'market_posture',
                  label: 'Posture',
                  title: 'Market posture',
                },
                {
                  id: 'data',
                  label: 'Data',
                  title: 'Live data sources',
                  meta: liveApiModules.length > 0 ? String(liveApiModules.length) : undefined,
                },
              ]}
            />
          </div>

          <div
            className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-3 text-sm ${
              librariesFull ? 'hidden' : ''
            }`}
            aria-hidden={librariesFull}
          >
            {tab === 'research' && (
              <>
                {topicOwnerModules.length > 0 ? (
                  <ResearchNewTopicButton
                    companyId={companyId}
                    modules={topicOwnerModules.map((m) => ({ id: m.id, name: m.name }))}
                    onCreated={() => {
                      invalidateAfterResearchMutation(companyId, 'topics');
                      void loadTopics(true);
                    }}
                  />
                ) : (
                  <p className="px-1 text-xs text-[var(--color-ink-faint)]">
                    No research modules yet. Add one from the canvas palette to create topics.
                  </p>
                )}

                <div className="mt-3">
                  <ResearchPagesList
                    companyId={companyId}
                    hasResearchModules={topicOwnerModules.length > 0}
                    topics={
                      topicsLoaded && topicOwnerModules.length > 0
                        ? topics
                            .filter((t) => {
                              if (t.status !== 'active' && t.status !== 'deferred') return false;
                              return topicOwnerModules.some((m) => m.id === t.moduleId);
                            })
                            .map((t) => ({
                              id: t.id,
                              title: t.title,
                              moduleId: t.moduleId,
                              parentTopicId: t.parentTopicId ?? null,
                              ...(typeof t.conceptCount === 'number'
                                ? { conceptCount: t.conceptCount }
                                : {}),
                              status: t.status,
                              priority: t.priority,
                              provenance: t.provenance ?? null,
                              engineInstanceId: t.engineInstanceId ?? null,
                              engineLabel: t.engineLabel ?? null,
                              researchModuleName: t.researchModuleName ?? null,
                            }))
                        : []
                    }
                    selectedTopicId={researchView.selectedTopicId}
                    linkedTopicIds={researchView.linkedTopicIds}
                    linkedTopicTitles={researchView.linkedTopicTitles}
                    onSelectTopic={(topicId) => void researchView.selectTopic(topicId)}
                    loading={!topicsLoaded && topicOwnerModules.length > 0}
                  />
                </div>

                <div className="mt-3">
                  <ResearchArticlesList
                    articles={concepts.map((c) => ({
                      id: c.id,
                      title: c.title,
                      tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
                      primaryLibraryId: c.primaryLibraryId ?? null,
                      sourceClass: c.sourceClass ?? null,
                    }))}
                    libraries={libraries.map((l) => ({ id: l.id, name: l.name }))}
                    selectedConceptId={researchView.selectedConceptId}
                    onSelectArticle={(conceptId) => researchView.inspectConcept(conceptId)}
                    loading={!conceptsLoaded}
                  />
                </div>
              </>
            )}

            {tab === 'market_posture' && <MarketPosturePanel companyId={companyId} />}

            {tab === 'data' && (
              <>
                <LiveDataSourcesList companyId={companyId} liveApiModules={liveApiModules} />
                <CompanyLibrarySourcesList
                  companyId={companyId}
                  modules={companyLibraryModules.map((m) => ({
                    id: m.id,
                    name: m.name,
                    config: m.config,
                  }))}
                />
              </>
            )}
          </div>

          {/* D-121 / D-128: Libraries dock — elevated sheet; rail LIB expands to full height. */}
          {librariesDockOpen ? (
            <div
              data-testid="research-libraries-dock"
              data-libraries-layout={librariesFull ? 'full' : 'dock'}
              className={
                librariesFull
                  ? 'relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden border-t border-[var(--color-line)] bg-[var(--color-surface-0)]'
                  : 'relative z-10 mx-1.5 mb-1.5 mt-0 flex max-h-[min(42vh,20rem)] shrink-0 flex-col overflow-hidden rounded-t-xl border border-[var(--color-line)] border-b-[var(--color-line)] bg-[var(--color-surface-0)] shadow-[0_-8px_24px_rgba(0,0,0,0.45)] ring-1 ring-[var(--color-line)]'
              }
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink)]">
                    Libraries
                  </p>
                  <p className="text-[9px] text-[var(--color-ink-faint)]">
                    {librariesFull
                      ? 'Full height · other tabs restore dock size'
                      : 'Shared · all tabs · open in inspector'}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="research-libraries-dock-hide"
                  onClick={() => {
                    setLibrariesFull(false);
                    setLibrariesDockOpen(false);
                  }}
                  className="rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
                >
                  Hide
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 text-sm">
                <section
                  data-testid="company-libraries-section"
                  className="mb-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
                  aria-label="Company libraries"
                >
                  <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-faint)]">
                    Company
                  </p>
                  <p className="mt-0.5 text-[10px] text-[var(--color-ink-faint)]">
                    Canvas library modules for this company
                  </p>
                  {companyLibraryModules.length === 0 ? (
                    <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">
                      No company library modules yet. Create one below.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {companyLibraryModules.map((m) => {
                        const hydrates = props.links
                          .filter((l) => l.fromModuleId === m.id && l.linkKind === 'data_feed')
                          .map((l) => nameOf(l.toModuleId));
                        return (
                          <li key={m.id}>
                            <button
                              type="button"
                              data-testid={`company-library-module-${m.id}`}
                              onClick={() => browseCompanyModule(m.id, m.name)}
                              className="flex w-full flex-col rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-left hover:border-[var(--color-accent)]"
                            >
                              <span className="truncate text-xs font-medium">{m.name}</span>
                              <span className="text-[10px] text-[var(--color-ink-faint)]">
                                {String(m.config.topicScope ?? 'library')}
                                {hydrates.length > 0 ? ` · feeds ${hydrates.join(', ')}` : ''}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <ResearchLibraryShelves
                  companyId={companyId}
                  libraries={libraries}
                  topics={topics.map((t) => ({ id: t.id, title: t.title }))}
                  shellRefreshing={shellRefreshing}
                  onRefreshShell={() => void refreshShell(true)}
                  onSelectConcept={(conceptId) => browseConcept(conceptId)}
                  onSelectLibrary={(libraryId, libraryName) =>
                    browseLibrary(libraryId, libraryName)
                  }
                  onSelectTopic={(topicId) => {
                    selectLeftTab('research');
                    void researchView.selectTopic(topicId);
                  }}
                  researchModuleId={researchModules[0]?.id ?? null}
                  onLibraryActionComplete={() => {
                    invalidateAfterResearchMutation(companyId, 'concepts');
                    invalidateAfterResearchMutation(companyId, 'libraryPages');
                    invalidateAfterResearchMutation(companyId, 'libraries');
                    void refreshShell(true);
                  }}
                />
                <LibrariesSection
                  companyId={companyId}
                  libraries={libraries}
                  loaded={librariesLoaded}
                  requiresOperatorApproval={requiresOperatorApproval}
                  onChanged={() => {
                    invalidateAfterResearchMutation(companyId, 'libraries');
                    void loadLibraries(true);
                    void loadConcepts(true);
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="relative z-10 mx-1.5 mb-1.5 shrink-0">
              <button
                type="button"
                data-testid="research-libraries-dock-card"
                onClick={() => {
                  setLibrariesFull(false);
                  setLibrariesDockOpen(true);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-2.5 text-left shadow-[0_-4px_16px_rgba(0,0,0,0.35)] ring-1 ring-[var(--color-line)] hover:border-[var(--color-accent)]"
              >
                <span className="min-w-0">
                  <span className="block text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink)]">
                    Libraries
                  </span>
                  <span className="block text-[9px] text-[var(--color-ink-faint)]">
                    Shared across Research · Posture · Data
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-[var(--color-ink-dim)]">
                  {librariesLoaded
                    ? `${libraries.length} librar${libraries.length === 1 ? 'y' : 'ies'} · Show`
                    : 'Show'}
                </span>
              </button>
            </div>
          )}
        </aside>
      ) : null}
    </div>
  );
}

const compactInput =
  'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]';

async function downloadLibraryExport(companyId: string, libraryId: string, name: string) {
  const res = await fetch(`/api/companies/${companyId}/libraries/${libraryId}/export`);
  if (!res.ok) throw new Error('export_failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name.replace(/\s+/g, '-').toLowerCase()}-obsidian.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Libraries list with create form, curation browser, and Obsidian export. */
function LibrariesSection(props: {
  companyId: string;
  libraries: Library[];
  loaded: boolean;
  requiresOperatorApproval: boolean;
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [topicScope, setTopicScope] = useState('');
  const [busy, setBusy] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function createLibrary(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !props.companyId) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/libraries`, {
        method: 'POST',
        body: { name: trimmedName, topicScope: topicScope.trim() },
      });
      setName('');
      setTopicScope('');
      setMessage('Library created.');
      props.onChanged();
    } catch (err) {
      setMessage(
        err instanceof RequestError && err.status === 404
          ? 'Libraries API not available yet.'
          : 'Create failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function exportLibrary(library: Library) {
    setExportingId(library.id);
    setMessage(null);
    try {
      await downloadLibraryExport(props.companyId, library.id, library.name);
      setMessage(`Exported ${library.name}.`);
    } catch {
      setMessage('Export failed.');
    } finally {
      setExportingId(null);
    }
  }

  return (
    <section
      className="mt-3 rounded-lg border border-[var(--color-line)] p-2.5"
      aria-label="Libraries"
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
        Libraries
      </p>
      {!props.loaded ? (
        <p className="mt-2 text-[10px] text-[var(--color-ink-faint)]">Loading libraries…</p>
      ) : props.libraries.length === 0 ? (
        <p className="mt-2 text-[10px] text-[var(--color-ink-faint)]">No libraries yet.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {props.libraries.map((lib) => (
            <li key={lib.id}>
              <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-line)] px-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium text-[var(--color-ink)]">
                    {lib.name}
                  </p>
                  <p className="truncate text-[10px] text-[var(--color-ink-faint)]">
                    {lib.topicScope || 'no scope'} · {lib.status}
                    {lib.masterLibrary ? ' · master' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={exportingId === lib.id}
                  onClick={() => void exportLibrary(lib)}
                  aria-label={`Export ${lib.name} to Obsidian zip`}
                  className="shrink-0 rounded-md border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
                >
                  {exportingId === lib.id ? 'Exporting…' : 'Export'}
                </button>
              </div>
              <LibraryConceptsPanel
                companyId={props.companyId}
                libraryId={lib.id}
                libraryName={lib.name}
                requiresOperatorApproval={props.requiresOperatorApproval}
                onChanged={props.onChanged}
              />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void createLibrary(e)} className="mt-2 space-y-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Library name"
          aria-label="New library name"
          className={compactInput}
        />
        <input
          value={topicScope}
          onChange={(e) => setTopicScope(e.target.value)}
          placeholder="Topic scope (optional)"
          aria-label="New library topic scope"
          className={compactInput}
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-md border border-[var(--color-accent)] px-2 py-0.5 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create library'}
          </button>
          {message && <span className="text-[10px] text-[var(--color-ink-faint)]">{message}</span>}
        </div>
      </form>
    </section>
  );
}

type CurationFilter = 'all' | CurationStatus;

const CURATION_FILTERS: { id: CurationFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'proposed', label: 'Proposed' },
  { id: 'auto_admitted', label: 'Auto-admitted' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'rejected', label: 'Rejected' },
];

interface LibraryConceptRow {
  id: string;
  conceptId: string;
  curationStatus: CurationStatus;
  title?: string;
  body?: string;
}

function LibraryConceptsPanel(props: {
  companyId: string;
  libraryId: string;
  libraryName: string;
  requiresOperatorApproval: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(props.requiresOperatorApproval);
  const [loaded, setLoaded] = useState(false);
  const [concepts, setConcepts] = useState<LibraryConceptRow[]>([]);
  const [filter, setFilter] = useState<CurationFilter>(
    props.requiresOperatorApproval ? 'proposed' : 'all',
  );
  const [busyConceptId, setBusyConceptId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!props.companyId || !props.libraryId) return;
    try {
      const data = await api<{ libraryConcepts: LibraryConceptRow[] }>(
        `/api/companies/${props.companyId}/libraries/${props.libraryId}/concepts`,
      );
      setConcepts(data.libraryConcepts);
    } catch {
      setConcepts([]);
    } finally {
      setLoaded(true);
    }
  }, [props.companyId, props.libraryId]);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    void load();
  }, [open, load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return concepts;
    return concepts.filter((c) => c.curationStatus === filter);
  }, [concepts, filter]);

  async function curateConcept(conceptId: string, curationStatus: CurationStatus) {
    setBusyConceptId(conceptId);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/libraries/${props.libraryId}/curate`, {
        method: 'POST',
        body: { conceptId, curationStatus },
      });
      setMessage(curationStatus === 'accepted' ? 'Concept accepted.' : 'Concept rejected.');
      await load();
      props.onChanged();
    } catch {
      setMessage('Curation update failed.');
    } finally {
      setBusyConceptId(null);
    }
  }

  const proposedIds = useMemo(
    () => concepts.filter((c) => c.curationStatus === 'proposed').map((c) => c.conceptId),
    [concepts],
  );

  async function bulkCurate(curationStatus: 'accepted' | 'rejected') {
    if (proposedIds.length === 0) return;
    setBusyConceptId('__bulk__');
    setMessage(null);
    let ok = 0;
    let failed = 0;
    for (const conceptId of proposedIds) {
      try {
        await api(`/api/companies/${props.companyId}/libraries/${props.libraryId}/curate`, {
          method: 'POST',
          body: { conceptId, curationStatus },
        });
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setMessage(
      failed === 0
        ? `${ok} concept${ok === 1 ? '' : 's'} ${curationStatus === 'accepted' ? 'approved' : 'rejected'}.`
        : `${ok} updated, ${failed} failed.`,
    );
    await load();
    props.onChanged();
    setBusyConceptId(null);
  }

  return (
    <div className="mt-1 pl-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${open ? 'Hide' : 'Show'} concepts for ${props.libraryName}`}
        className="text-[10px] text-[var(--color-accent)] hover:underline"
      >
        {open ? 'Hide concepts' : 'Show concepts'}
        {props.requiresOperatorApproval ? ' · approval required' : ''}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5 border-l border-[var(--color-line)] pl-2">
          <div className="flex flex-wrap gap-1">
            {CURATION_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                aria-label={`Filter library concepts: ${f.label}`}
                className={`rounded-full border px-1.5 py-0.5 text-[9px] ${
                  filter === f.id
                    ? f.id === 'proposed' && props.requiresOperatorApproval
                      ? 'border-[var(--color-warn)] text-[var(--color-warn)]'
                      : 'border-[var(--color-accent)] text-[var(--color-accent)]'
                    : 'border-[var(--color-line)] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {proposedIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyConceptId !== null}
                onClick={() => void bulkCurate('accepted')}
                aria-label={`Approve all ${proposedIds.length} proposed concepts`}
                className="rounded border border-[var(--color-ok)] px-1.5 py-0.5 text-[9px] text-[var(--color-ok)] hover:bg-[var(--color-ok)]/10 disabled:opacity-50"
              >
                {busyConceptId === '__bulk__'
                  ? 'Updating…'
                  : `Approve all proposed (${proposedIds.length})`}
              </button>
              <button
                type="button"
                disabled={busyConceptId !== null}
                onClick={() => void bulkCurate('rejected')}
                aria-label={`Reject all ${proposedIds.length} proposed concepts`}
                className="rounded border border-[var(--color-block)] px-1.5 py-0.5 text-[9px] text-[var(--color-block)] hover:bg-[var(--color-block)]/10 disabled:opacity-50"
              >
                Reject all proposed
              </button>
            </div>
          )}
          {!loaded ? (
            <p className="text-[10px] text-[var(--color-ink-faint)]">Loading concepts…</p>
          ) : filtered.length === 0 ? (
            <p className="text-[10px] text-[var(--color-ink-faint)]">No concepts in this filter.</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((c) => (
                <li
                  key={c.id}
                  className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-[var(--color-ink)]">
                      {c.title ?? 'Untitled concept'}
                    </span>
                    <span
                      className="shrink-0 uppercase"
                      style={{
                        color: toneFor(c.curationStatus === 'rejected' ? 'rejected' : 'flat'),
                      }}
                    >
                      {c.curationStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {c.body && (
                    <p className="mt-0.5 text-[var(--color-ink-dim)]">{snippet(c.body, 100)}</p>
                  )}
                  {c.curationStatus === 'proposed' && (
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        disabled={busyConceptId === c.conceptId || busyConceptId === '__bulk__'}
                        onClick={() => void curateConcept(c.conceptId, 'accepted')}
                        aria-label={`Accept concept ${c.title ?? c.conceptId}`}
                        className="text-[var(--color-ok)] hover:underline disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyConceptId === c.conceptId || busyConceptId === '__bulk__'}
                        onClick={() => void curateConcept(c.conceptId, 'rejected')}
                        aria-label={`Reject concept ${c.title ?? c.conceptId}`}
                        className="text-[var(--color-block)] hover:underline disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {message && <p className="text-[10px] text-[var(--color-ink-faint)]">{message}</p>}
        </div>
      )}
    </div>
  );
}
