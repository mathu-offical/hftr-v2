'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import type { CurationStatus, Library, ResearchTopic } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import { useResearchView } from '@/components/research/ResearchViewContext';
import { ResearchArchiveSection } from '@/components/research/ResearchArchiveSection';
import { ResearchEntitySearch } from '@/components/research/ResearchEntitySearch';
import { ResearchLibraryShelves } from '@/components/research/ResearchLibraryShelves';
import { ResearchNewTopicButton } from '@/components/research/ResearchNewTopicButton';
import { ResearchSubmitArticle } from '@/components/research/ResearchSubmitArticle';
import { ResearchPagesList } from '@/components/research/ResearchPagesList';
import { ResearchRunStatus, type ResearchRunSnapshot } from '@/components/panels/ResearchRunStatus';
import { provenanceChip, snippet, toneFor } from './format';
import { LlmAvailabilityChips } from '@/components/shell/LlmConnectionStatus';
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
import { PanelTabs } from '@/components/panels/PanelTabs';

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
 * Left panel (ui-ux spec): Research + Libraries, Market posture, and Data sources.
 * Research tab (D-040 / D-049 / D-094 / D-095): topics + agent activity in the scroll
 * column; library shelves live in a bottom-anchored show/hide Libraries dock.
 * Market posture (D-081): movers / watchlists / positions hub. Data sources: live APIs.
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
  const [shellRefreshing, setShellRefreshing] = useState(false);
  const researchView = useResearchView();
  const marketPostureView = useMarketPostureView();

  useEffect(() => {
    if (!storageKey) {
      setPersistReady(true);
      return;
    }
    const stored = readPanelState<{
      open?: unknown;
      tab?: unknown;
      librariesDockOpen?: unknown;
    }>(storageKey);
    if (stored) {
      if (typeof stored.open === 'boolean') setOpen(stored.open);
      if (isLeftTab(stored.tab)) setTab(stored.tab);
      if (typeof stored.librariesDockOpen === 'boolean') {
        setLibrariesDockOpen(stored.librariesDockOpen);
      }
    }
    setPersistReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !persistReady) return;
    writePanelState(storageKey, { open, tab, librariesDockOpen });
  }, [storageKey, open, tab, librariesDockOpen, persistReady]);

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
      } catch {
        // Route may not be deployed yet; keep whatever we have.
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
    [companyId],
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
    if (cachedConcepts) setConcepts(cachedConcepts);
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
        setOpen(true);
        setTab('research');
      },
      collapse: () => setOpen(false),
    });
    return () => researchView.registerLeftPanelBridge(null);
  }, [researchView.registerLeftPanelBridge]);

  useEffect(() => {
    marketPostureView.registerLeftPanelBridge({
      ensurePostureOpen: () => {
        setOpen(true);
        setTab('market_posture');
      },
      collapse: () => setOpen(false),
    });
    return () => marketPostureView.registerLeftPanelBridge(null);
  }, [marketPostureView.registerLeftPanelBridge]);

  useEffect(() => {
    if (open && tab === 'research') {
      researchView.openOverlay();
      marketPostureView.closeOverlay();
    } else if (open && tab === 'market_posture') {
      marketPostureView.openOverlay();
      researchView.closeOverlay();
    } else {
      researchView.closeOverlay();
      marketPostureView.closeOverlay();
    }
  }, [
    open,
    tab,
    researchView.openOverlay,
    researchView.closeOverlay,
    marketPostureView.openOverlay,
    marketPostureView.closeOverlay,
  ]);

  const research = props.modules.filter(
    (m) => m.type === 'research' || m.type === 'librarian' || m.type === 'trend',
  );
  const researchModules = props.modules.filter(
    (m) => m.type === 'research' || m.type === 'librarian',
  );
  const topicOwnerModules = props.modules.filter((m) => m.type === 'research');
  const [admissionOverrides, setAdmissionOverrides] = useState<
    Record<string, 'auto_admit_validated' | 'require_operator_approval'>
  >({});
  const requiresOperatorApproval = researchModules.some((m) => {
    const mode =
      admissionOverrides[m.id] ??
      (m.config.admissionMode === 'require_operator_approval'
        ? 'require_operator_approval'
        : 'auto_admit_validated');
    return mode === 'require_operator_approval';
  });
  const sources = props.modules.filter((m) => m.type === 'live_api' || m.type === 'library');
  const nameOf = (id: string) => props.modules.find((m) => m.id === id)?.name ?? 'unknown';

  // D-118: edge expand/collapse rail stays at the left window edge in both states.
  return (
    <div className="flex h-full min-h-0 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={
          open
            ? 'Collapse left panel (keyboard shortcut [ or Escape)'
            : 'Expand left panel (keyboard shortcut [)'
        }
        title={open ? 'Collapse ([ or Esc)' : 'Expand left panel ([)'}
        className="shrink-0 border-r border-[var(--color-line)] bg-[var(--color-surface-1)] px-1.5 text-[10px] tracking-widest text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        style={{ writingMode: 'vertical-rl' }}
      >
        RESEARCH · POSTURE · DATA · [
      </button>

      {open ? (
        <aside className="flex h-full min-h-0 w-80 shrink-0 flex-col overflow-hidden border-r border-[var(--color-line)] bg-[var(--color-surface-1)]">
          <div className="flex shrink-0 items-stretch border-b border-[var(--color-line)]">
            <PanelTabs
              aria-label="Left panel sections"
              className="min-w-0 flex-1"
              value={tab}
              onChange={setTab}
              tabs={[
                {
                  id: 'research',
                  label: 'Research',
                  title: 'Research + Libraries',
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
                  title: 'Data sources',
                  meta: sources.length > 0 ? String(sources.length) : undefined,
                },
              ]}
            />
          </div>

      {tab === 'research' ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 text-sm">
            {topicOwnerModules.length > 0 ? (
              <>
                <ResearchNewTopicButton
                  companyId={companyId}
                  modules={topicOwnerModules.map((m) => ({ id: m.id, name: m.name }))}
                  onCreated={() => {
                    invalidateAfterResearchMutation(companyId, 'topics');
                    void loadTopics(true);
                  }}
                />
                <ResearchSubmitArticle
                  companyId={companyId}
                  modules={topicOwnerModules.map((m) => ({ id: m.id, name: m.name }))}
                  libraries={libraries.map((l) => ({ id: l.id, name: l.name }))}
                  onCreated={(conceptId) => {
                    invalidateAfterResearchMutation(companyId, 'concepts');
                    invalidateAfterResearchMutation(companyId, 'libraryPages');
                    void loadConcepts(true);
                    void loadLibraries(true);
                    researchView.inspectConcept(conceptId);
                  }}
                />
              </>
            ) : (
              <p className="px-1 text-xs text-[var(--color-ink-faint)]">
                No research modules yet. Add one below or from the canvas palette to create topics.
              </p>
            )}

            <div className="mt-3">
              <ResearchEntitySearch
                companyId={companyId}
                concepts={concepts.map((c) => ({
                  id: c.id,
                  title: c.title,
                  tags: c.tags,
                  body: c.body,
                  sourceClass: c.sourceClass,
                }))}
                topics={topics.map((t) => ({ id: t.id, title: t.title }))}
                libraries={libraries.map((l) => ({ id: l.id, name: l.name }))}
                highlightedTopicIds={researchView.linkedTopicIds}
                onSelectConcept={(conceptId) => researchView.inspectConcept(conceptId)}
                onSelectTopic={(topicId) => void researchView.selectTopic(topicId)}
                onSelectTag={(tag) => {
                  const ids = concepts.filter((c) => c.tags.includes(tag)).map((c) => c.id);
                  researchView.inspectTag(tag, ids);
                }}
                onSelectLibrary={(libraryId) => {
                  const lib = libraries.find((l) => l.id === libraryId);
                  researchView.inspectLibrary(libraryId, lib?.name ?? 'Library');
                }}
              />
            </div>

            <div className="mt-3">
              {!topicsLoaded ? (
                <p className="text-[10px] text-[var(--color-ink-faint)]">
                  Loading research topics…
                </p>
              ) : (
                <ResearchPagesList
                  companyId={companyId}
                  topics={topics.map((t) => ({
                    id: t.id,
                    title: t.title,
                    moduleId: t.moduleId,
                    parentTopicId: t.parentTopicId ?? null,
                    ...(typeof t.conceptCount === 'number' ? { conceptCount: t.conceptCount } : {}),
                    status: t.status,
                    priority: t.priority,
                    provenance: t.provenance ?? null,
                  }))}
                  selectedTopicId={researchView.selectedTopicId}
                  linkedTopicIds={researchView.linkedTopicIds}
                  linkedTopicTitles={researchView.linkedTopicTitles}
                  onSelectTopic={(topicId) => void researchView.selectTopic(topicId)}
                />
              )}
            </div>

            <div
              data-testid="research-agent-activity"
              className="mt-3 rounded-lg border border-[var(--color-line)] p-2.5"
            >
              <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-faint)]">
                Agent activity
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--color-ink-faint)]">
                Research module runs · evidence · admission
              </p>
              {topicOwnerModules.length === 0 ? (
                <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">
                  No research modules yet. Add one under Modules & tools.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {topicOwnerModules.map((m) => (
                    <li key={m.id} className="rounded-md border border-[var(--color-line)] p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium">{m.name}</span>
                        <span className="shrink-0 text-[10px] text-[var(--color-ink-faint)]">
                          {m.status}
                        </span>
                      </div>
                      <ResearchActions
                        companyId={companyId}
                        moduleId={m.id}
                        topicScope={String(m.config.topicScope ?? m.config.focus ?? '')}
                        moduleConfig={m.config}
                        admissionMode={
                          admissionOverrides[m.id] ??
                          (m.config.admissionMode === 'require_operator_approval'
                            ? 'require_operator_approval'
                            : 'auto_admit_validated')
                        }
                        onAdmissionChange={(mode) =>
                          setAdmissionOverrides((prev) => ({ ...prev, [m.id]: mode }))
                        }
                        onDone={() => {
                          invalidateAfterResearchMutation(companyId, 'all');
                          void refreshShell(true);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <ResearchArchiveSection
              companyId={companyId}
              onChanged={() => {
                invalidateAfterResearchMutation(companyId, 'all');
                void refreshShell(true);
              }}
            />

            <details className="mt-3 rounded-lg border border-[var(--color-line)] p-2.5">
              <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                Modules & tools
              </summary>
              <div className="mt-2">
                <NewResearchModuleForm companyId={companyId} />
              </div>
              {researchModules.length > 0 && (
                <CompanySweepAction
                  companyId={companyId}
                  onDone={() => {
                    invalidateAfterResearchMutation(companyId, 'concepts');
                    void loadConcepts(true);
                  }}
                />
              )}
              {research.length === 0 ? (
                <p className="mt-3 px-1 text-xs text-[var(--color-ink-faint)]">
                  No research or trend modules yet. Create one above or add from the canvas palette.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {research.map((m) => (
                    <li key={m.id} className="rounded-lg border border-[var(--color-line)] p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{m.name}</span>
                        <span className="text-[10px] uppercase text-[var(--color-ink-faint)]">
                          {m.type}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--color-ink-dim)]">
                        {String(
                          m.config.topicScope ?? m.config.focus ?? 'scope not configured yet',
                        )}
                      </div>
                      <div className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
                        {m.status}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </div>

          {librariesDockOpen ? (
            <div
              data-testid="research-libraries-dock"
              className="flex max-h-[42vh] shrink-0 flex-col border-t border-[var(--color-line)] bg-[var(--color-surface-1)]"
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-line)] px-3 py-1.5">
                <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-faint)]">
                  Libraries
                </p>
                <button
                  type="button"
                  data-testid="research-libraries-dock-hide"
                  onClick={() => setLibrariesDockOpen(false)}
                  className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
                >
                  Hide
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 text-sm">
                <ResearchLibraryShelves
                  companyId={companyId}
                  libraries={libraries}
                  topics={topics.map((t) => ({ id: t.id, title: t.title }))}
                  shellRefreshing={shellRefreshing}
                  onRefreshShell={() => void refreshShell(true)}
                  onSelectConcept={(conceptId) => researchView.inspectConcept(conceptId)}
                  onSelectLibrary={(libraryId, libraryName) =>
                    researchView.inspectLibrary(libraryId, libraryName)
                  }
                  onSelectTopic={(topicId) => void researchView.selectTopic(topicId)}
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
            <div className="shrink-0 border-t border-[var(--color-line)] px-3 py-2">
              <button
                type="button"
                data-testid="research-libraries-dock-card"
                onClick={() => setLibrariesDockOpen(true)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-2 text-left hover:border-[var(--color-accent)]"
              >
                <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-faint)]">
                  Libraries
                </span>
                <span className="text-[10px] text-[var(--color-ink-dim)]">
                  {librariesLoaded
                    ? `${libraries.length} librar${libraries.length === 1 ? 'y' : 'ies'} · Show`
                    : 'Show'}
                </span>
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 text-sm">
          {tab === 'market_posture' && <MarketPosturePanel companyId={companyId} />}

          {tab === 'data' && (
            <>
              <NewDataSourceForm companyId={companyId} />
              {sources.length === 0 ? (
                <p className="mt-3 px-1 text-xs text-[var(--color-ink-faint)]">
                  No data sources yet. Add one above or from the canvas palette.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {sources.map((m) => {
                    const hydrates = props.links
                      .filter((l) => l.fromModuleId === m.id && l.linkKind === 'data_feed')
                      .map((l) => nameOf(l.toModuleId));
                    return (
                      <li key={m.id} className="rounded-lg border border-[var(--color-line)] p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">{m.name}</span>
                          <span className="text-[10px] uppercase text-[var(--color-ink-faint)]">
                            {m.type === 'live_api' ? 'live api' : 'library'}
                          </span>
                        </div>
                        {m.type === 'live_api' && (
                          <div className="mt-1 text-[11px] text-[var(--color-ink-dim)]">
                            venue {String(m.config.venue ?? '—')} ·{' '}
                            {Array.isArray(m.config.instruments)
                              ? `${m.config.instruments.length} instruments`
                              : 'no instruments'}
                          </div>
                        )}
                        <div className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
                          {hydrates.length > 0
                            ? `hydrates: ${hydrates.join(', ')}`
                            : 'not feeding any node yet'}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
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

/** Compact form to create a research module from the left panel. */
function NewResearchModuleForm(props: { companyId: string }) {
  const [name, setName] = useState('');
  const [topicScope, setTopicScope] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function create() {
    const trimmedName = name.trim();
    const trimmedScope = topicScope.trim();
    if (!trimmedName || !trimmedScope || !props.companyId) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/modules`, {
        method: 'POST',
        body: {
          type: 'research',
          name: trimmedName,
          config: { topicScope: trimmedScope, curiosity: 'balanced' },
          canvasPosition: { x: 80, y: 200 + Math.random() * 40 },
        },
      });
      setMessage('Created — reloading canvas…');
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setMessage(err instanceof RequestError ? `Create failed (${err.status}).` : 'Create failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
      className="rounded-lg border border-[var(--color-line)] p-2.5"
      aria-label="Create new research module"
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
        New research module
      </p>
      <div className="mt-2 space-y-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Module name"
          aria-label="Research module name"
          className={compactInput}
        />
        <input
          value={topicScope}
          onChange={(e) => setTopicScope(e.target.value)}
          placeholder="Topic scope"
          aria-label="Research topic scope"
          className={compactInput}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || !name.trim() || !topicScope.trim()}
          aria-label="Create research module"
          className="rounded-md border border-[var(--color-accent)] px-2 py-0.5 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create'}
        </button>
        {message && <span className="text-[10px] text-[var(--color-ink-faint)]">{message}</span>}
      </div>
    </form>
  );
}

/** Compact form to add a live API or library data source module. */
function NewDataSourceForm(props: { companyId: string }) {
  const [kind, setKind] = useState<'live_api' | 'library'>('live_api');
  const [name, setName] = useState('');
  const [instruments, setInstruments] = useState('SPY');
  const [topicScope, setTopicScope] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function create() {
    const trimmedName = name.trim();
    if (!trimmedName || !props.companyId) return;
    if (kind === 'library' && !topicScope.trim()) return;
    if (kind === 'live_api' && !instruments.trim()) return;

    const config =
      kind === 'live_api'
        ? {
            venue: 'paper_sim' as const,
            instruments: instruments
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : { topicScope: topicScope.trim() };

    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/modules`, {
        method: 'POST',
        body: {
          type: kind,
          name: trimmedName,
          config,
          canvasPosition: {
            x: kind === 'live_api' ? 80 : 200,
            y: 120 + Math.random() * 40,
          },
        },
      });
      setMessage('Created — reloading canvas…');
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setMessage(err instanceof RequestError ? `Create failed (${err.status}).` : 'Create failed.');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = name.trim() && (kind === 'live_api' ? instruments.trim() : topicScope.trim());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
      className="rounded-lg border border-[var(--color-line)] p-2.5"
      aria-label="Add data source module"
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
        Add data source
      </p>
      <div className="mt-2 space-y-1.5">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as 'live_api' | 'library')}
          aria-label="Data source kind"
          className={compactInput}
        >
          <option value="live_api">Live API</option>
          <option value="library">Library</option>
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Module name"
          aria-label="Data source module name"
          className={compactInput}
        />
        {kind === 'live_api' ? (
          <input
            value={instruments}
            onChange={(e) => setInstruments(e.target.value)}
            placeholder="Instruments (comma-separated)"
            aria-label="Live API instruments"
            className={compactInput}
          />
        ) : (
          <input
            value={topicScope}
            onChange={(e) => setTopicScope(e.target.value)}
            placeholder="Topic scope"
            aria-label="Library topic scope"
            className={compactInput}
          />
        )}
        {kind === 'live_api' && (
          <p className="text-[10px] text-[var(--color-ink-faint)]">venue: paper_sim</p>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || !canSubmit}
          aria-label="Create data source module"
          className="rounded-md border border-[var(--color-accent)] px-2 py-0.5 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create'}
        </button>
        {message && <span className="text-[10px] text-[var(--color-ink-faint)]">{message}</span>}
      </div>
    </form>
  );
}

/** Company-wide research sweep across all research modules. */
function CompanySweepAction(props: { companyId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pollToken, setPollToken] = useState(0);

  async function sweep() {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/research/sweep`, { method: 'POST', body: {} });
      setMessage('Company sweep queued.');
      setPollToken((n) => n + 1);
      props.onDone();
    } catch (err) {
      setMessage(
        err instanceof RequestError && err.status === 404
          ? 'Sweep API not available yet.'
          : 'Company sweep failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-[var(--color-line)] px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Company research
        </span>
        <button
          type="button"
          onClick={() => void sweep()}
          disabled={busy}
          aria-label="Run company-wide research sweep"
          className="rounded-md border border-[var(--color-accent)] px-2 py-0.5 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
        >
          {busy ? 'Sweeping…' : 'Company sweep'}
        </button>
      </div>
      {message && <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">{message}</p>}
      <ResearchRunStatus companyId={props.companyId} pollToken={pollToken} />
    </div>
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

interface EvidenceRow {
  id: string;
  title: string;
  sourceKind: string;
  feedClass: string;
  summary: string;
}

interface ValidationGateRow {
  gateId: string;
  passed: boolean;
  scoreBand: string;
  reason: string;
}

/** Manual query, opportunistic curate, evidence, admission, and run status for research modules. */
function ResearchActions(props: {
  companyId: string;
  moduleId: string;
  topicScope: string;
  moduleConfig: Record<string, unknown>;
  admissionMode: 'auto_admit_validated' | 'require_operator_approval';
  onAdmissionChange: (mode: 'auto_admit_validated' | 'require_operator_approval') => void;
  onDone: () => void;
}) {
  const [queryText, setQueryText] = useState('');
  const [busy, setBusy] = useState<'research' | 'curate' | 'admission' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pollToken, setPollToken] = useState(0);
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);
  const [evidenceLoaded, setEvidenceLoaded] = useState(false);
  const [gates, setGates] = useState<ValidationGateRow[]>([]);
  const lastTerminalRequestId = useRef<string | null>(null);

  const loadEvidence = useCallback(async () => {
    if (!props.companyId || !props.moduleId) return;
    try {
      const data = await api<{ evidence: EvidenceRow[] }>(
        `/api/companies/${props.companyId}/modules/${props.moduleId}/research/evidence`,
      );
      setEvidence(data.evidence);
    } catch {
      setEvidence([]);
    } finally {
      setEvidenceLoaded(true);
    }
  }, [props.companyId, props.moduleId]);

  useEffect(() => {
    void loadEvidence();
  }, [loadEvidence]);

  async function loadRequestDetail(requestId: string) {
    if (!requestId) return;
    try {
      const data = await api<{ validation?: { gates?: ValidationGateRow[] } }>(
        `/api/companies/${props.companyId}/research/requests/${requestId}`,
      );
      setGates(data.validation?.gates ?? []);
    } catch {
      setGates([]);
    }
  }

  async function setAdmissionMode(next: 'auto_admit_validated' | 'require_operator_approval') {
    if (next === props.admissionMode) return;
    setBusy('admission');
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/modules/${props.moduleId}`, {
        method: 'PATCH',
        body: {
          config: {
            ...props.moduleConfig,
            admissionMode: next,
          },
        },
      });
      props.onAdmissionChange(next);
      setMessage(
        next === 'require_operator_approval'
          ? 'Admission: operator approval required.'
          : 'Admission: auto-admit after validation.',
      );
    } catch {
      setMessage('Could not update admission mode.');
    } finally {
      setBusy(null);
    }
  }

  async function runManualResearch() {
    const trimmed = queryText.trim();
    if (!trimmed) {
      setMessage('Enter a research query.');
      return;
    }
    setBusy('research');
    setMessage(null);
    lastTerminalRequestId.current = null;
    try {
      await api(`/api/companies/${props.companyId}/modules/${props.moduleId}/curate`, {
        method: 'POST',
        body: { queryText: trimmed, mode: 'manual' },
      });
      setMessage('Research queued.');
      setPollToken((n) => n + 1);
    } catch (err) {
      setMessage(
        err instanceof RequestError && err.status === 404
          ? 'Research API not available yet.'
          : 'Research request failed.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function curateNow() {
    setBusy('curate');
    setMessage(null);
    lastTerminalRequestId.current = null;
    try {
      await api(`/api/companies/${props.companyId}/modules/${props.moduleId}/curate`, {
        method: 'POST',
        body: {
          mode: 'opportunistic',
          topicScope: props.topicScope || undefined,
        },
      });
      setMessage('Curation queued.');
      setPollToken((n) => n + 1);
    } catch (err) {
      setMessage(
        err instanceof RequestError && err.status === 404
          ? 'Curation not available yet.'
          : 'Curation request failed.',
      );
    } finally {
      setBusy(null);
    }
  }

  function handleRunSnapshot(run: ResearchRunSnapshot) {
    void loadRequestDetail(run.requestId);
    if (run.phase !== 'done' && run.phase !== 'failed') return;
    if (lastTerminalRequestId.current === run.requestId) return;
    lastTerminalRequestId.current = run.requestId;
    void loadEvidence();
    props.onDone();
  }

  return (
    <div className="mt-1.5 space-y-1.5 border-t border-[var(--color-line)] pt-1.5">
      <label className="block space-y-1">
        <span className="text-[10px] text-[var(--color-ink-faint)]">Admission mode</span>
        <select
          value={props.admissionMode}
          disabled={busy !== null}
          onChange={(e) =>
            void setAdmissionMode(
              e.target.value as 'auto_admit_validated' | 'require_operator_approval',
            )
          }
          aria-label="Research admission mode"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        >
          <option value="auto_admit_validated">Auto-admit after validation</option>
          <option value="require_operator_approval">Require operator approval</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-[10px] text-[var(--color-ink-faint)]">Research query</span>
        <textarea
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          rows={2}
          placeholder="What should this module investigate?"
          aria-label="Manual research query"
          className="w-full resize-none rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void runManualResearch()}
          disabled={busy !== null}
          aria-label="Run manual research query"
          className="rounded-md border border-[var(--color-accent)] px-2 py-0.5 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
        >
          {busy === 'research' ? 'Researching…' : 'Research'}
        </button>
        <button
          type="button"
          onClick={() => void curateNow()}
          disabled={busy !== null}
          aria-label="Curate this research module now"
          className="rounded-md border border-[var(--color-line)] px-2 py-0.5 text-[11px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
        >
          {busy === 'curate' ? 'Curating…' : 'Curate now'}
        </button>
        <LlmAvailabilityChips tiers={['strategic', 'tactical']} />
      </div>
      {message && <span className="text-[10px] text-[var(--color-ink-faint)]">{message}</span>}
      <ResearchRunStatus
        companyId={props.companyId}
        moduleId={props.moduleId}
        pollToken={pollToken}
        onRun={handleRunSnapshot}
      />
      {gates.length > 0 && (
        <ul
          className="space-y-1 rounded-md border border-[var(--color-line)] px-2 py-1.5"
          aria-label="Validation gate scores"
        >
          {gates.map((g) => (
            <li key={g.gateId} className="flex flex-wrap items-baseline gap-x-2 text-[10px]">
              <span className="text-[var(--color-ink)]">{g.gateId}</span>
              <span style={{ color: toneFor(g.passed ? 'pass' : 'fail') }}>
                {g.passed ? 'passed' : 'failed'}
              </span>
              <span className="text-[var(--color-ink-faint)]">{g.scoreBand}</span>
              {g.reason && <span className="text-[var(--color-ink-dim)]">{g.reason}</span>}
            </li>
          ))}
        </ul>
      )}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Evidence
        </p>
        {!evidenceLoaded ? (
          <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">Loading evidence…</p>
        ) : evidence.length === 0 ? (
          <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">No evidence yet.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {evidence.map((e) => (
              <li
                key={e.id}
                className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px]"
              >
                <div className="font-medium text-[var(--color-ink)]">{e.title}</div>
                <div className="text-[var(--color-ink-faint)]">
                  {e.sourceKind.replace(/_/g, ' ')} · {e.feedClass}
                </div>
                <p className="mt-0.5 text-[var(--color-ink-dim)]">{snippet(e.summary, 120)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
