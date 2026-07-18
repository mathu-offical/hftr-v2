'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ResearchTopicDetail } from '@hftr/contracts';
import { api } from '@/lib/client';
import { parseSynopsisWikilinks } from '@/lib/research-synopsis-links';

export type ResearchOverlayTab = 'galaxy' | 'article';

/** What the floating right inspector is showing (D-049 refine). */
export type InspectorTarget =
  | { kind: 'topic'; topicId: string }
  | { kind: 'concept'; conceptId: string }
  | { kind: 'library'; libraryId: string; libraryName: string }
  | { kind: 'tag'; tag: string };

export interface ResearchViewContextValue {
  companyId: string;
  overlayOpen: boolean;
  pageInspectorOpen: boolean;
  inspectorTarget: InspectorTarget | null;
  activeTab: ResearchOverlayTab;
  selectedTopicId: string | null;
  selectedTopic: ResearchTopicDetail | null;
  selectedConceptId: string | null;
  selectedLibraryId: string | null;
  selectedTag: string | null;
  /** Topic IDs from synopsis typed links ([[topic:uuid]] or [[uuid]]). */
  linkedTopicIds: string[];
  /** Normalized lowercase titles from plain [[wikilink]]s in synopsis. */
  linkedTopicTitles: string[];
  focusConceptIds: string[] | null;
  /** Transient highlight when navigating from article wikilinks / inspect. */
  highlightConceptId: string | null;
  /** When true and a topic is focused, galaxy focus includes 1-hop graph neighbors. */
  includeNeighbors: boolean;
  openOverlay: (opts?: { tab?: ResearchOverlayTab }) => void;
  /** Hide galaxy only (left panel may stay open, e.g. Data tab). */
  closeOverlay: () => void;
  /**
   * Galaxy is owned by the left Research panel: collapse left + hide overlay.
   * Used by the overlay close control.
   */
  closeResearchWorkspace: () => void;
  /** LeftPanel registers open/collapse so galaxy stays coupled to the panel. */
  registerLeftPanelBridge: (
    bridge: { ensureResearchOpen: () => void; collapse: () => void } | null,
  ) => void;
  openPageInspector: () => void;
  closePageInspector: () => void;
  setActiveTab: (tab: ResearchOverlayTab) => void;
  selectTopic: (topicId: string) => Promise<void>;
  /** Open concept in floating inspector + galaxy trace (no left-panel expand). */
  inspectConcept: (conceptId: string) => void;
  /** Open library in inspector + filter galaxy nest. */
  inspectLibrary: (libraryId: string, libraryName: string) => void;
  /** Clear library inspector + nest filter selection. */
  clearLibrarySelection: () => void;
  /** Open tag in inspector + focus tagged concepts. */
  inspectTag: (tag: string, conceptIds: string[]) => void;
  clearTopicFocus: () => void;
  /** Galaxy-only highlight without changing inspector (e.g. internal graph hop). */
  focusConcept: (conceptId: string) => void;
  setIncludeNeighbors: (on: boolean) => void;
  /** Merge fields onto the currently selected topic (e.g. after PATCH synopsis). */
  patchSelectedTopic: (partial: Partial<ResearchTopicDetail>) => void;
}

const ResearchViewContext = createContext<ResearchViewContextValue | null>(null);

export function ResearchViewProvider(props: { companyId: string; children: ReactNode }) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [pageInspectorOpen, setPageInspectorOpen] = useState(false);
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget | null>(null);
  const [activeTab, setActiveTab] = useState<ResearchOverlayTab>('galaxy');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<ResearchTopicDetail | null>(null);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [linkedTopicIds, setLinkedTopicIds] = useState<string[]>([]);
  const [linkedTopicTitles, setLinkedTopicTitles] = useState<string[]>([]);
  const [focusConceptIds, setFocusConceptIds] = useState<string[] | null>(null);
  const [highlightConceptId, setHighlightConceptId] = useState<string | null>(null);
  const [includeNeighbors, setIncludeNeighbors] = useState(false);
  const leftBridgeRef = useRef<{
    ensureResearchOpen: () => void;
    collapse: () => void;
  } | null>(null);

  const applySynopsisLinks = useCallback((synopsisMd: string) => {
    const parsed = parseSynopsisWikilinks(synopsisMd);
    setLinkedTopicIds(parsed.linkedTopicIds);
    setLinkedTopicTitles(parsed.linkedTopicTitles);
  }, []);

  const loadTopicDetail = useCallback(
    async (topicId: string) => {
      const data = await api<{ topic: ResearchTopicDetail }>(
        `/api/companies/${props.companyId}/research/topics/${topicId}`,
      );
      setSelectedTopic(data.topic);
      setFocusConceptIds(data.topic.memberships.map((m) => m.conceptId));
      applySynopsisLinks(data.topic.synopsisMd ?? '');
      return data.topic;
    },
    [props.companyId, applySynopsisLinks],
  );

  const registerLeftPanelBridge = useCallback(
    (bridge: { ensureResearchOpen: () => void; collapse: () => void } | null) => {
      leftBridgeRef.current = bridge;
    },
    [],
  );

  const openOverlay = useCallback((opts?: { tab?: ResearchOverlayTab }) => {
    leftBridgeRef.current?.ensureResearchOpen();
    setOverlayOpen(true);
    if (opts?.tab) setActiveTab(opts.tab);
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlayOpen(false);
  }, []);

  const closeResearchWorkspace = useCallback(() => {
    setOverlayOpen(false);
    leftBridgeRef.current?.collapse();
  }, []);

  const openPageInspector = useCallback(() => {
    setPageInspectorOpen(true);
  }, []);

  const closePageInspector = useCallback(() => {
    setPageInspectorOpen(false);
    setInspectorTarget(null);
  }, []);

  const clearTopicFocus = useCallback(() => {
    setSelectedTopicId(null);
    setSelectedTopic(null);
    setSelectedConceptId(null);
    setSelectedLibraryId(null);
    setSelectedTag(null);
    setInspectorTarget(null);
    setFocusConceptIds(null);
    setHighlightConceptId(null);
    setLinkedTopicIds([]);
    setLinkedTopicTitles([]);
    setPageInspectorOpen(false);
  }, []);

  const focusConcept = useCallback((conceptId: string) => {
    setOverlayOpen(true);
    setActiveTab('galaxy');
    setHighlightConceptId(conceptId);
    setFocusConceptIds([conceptId]);
  }, []);

  const inspectConcept = useCallback((conceptId: string) => {
    setOverlayOpen(true);
    setActiveTab('galaxy');
    setPageInspectorOpen(true);
    setInspectorTarget({ kind: 'concept', conceptId });
    setSelectedConceptId(conceptId);
    setSelectedLibraryId(null);
    setSelectedTag(null);
    setSelectedTopicId(null);
    setSelectedTopic(null);
    setLinkedTopicIds([]);
    setLinkedTopicTitles([]);
    setHighlightConceptId(conceptId);
    setFocusConceptIds([conceptId]);
  }, []);

  const inspectLibrary = useCallback((libraryId: string, libraryName: string) => {
    setOverlayOpen(true);
    setActiveTab('galaxy');
    setPageInspectorOpen(true);
    setInspectorTarget({ kind: 'library', libraryId, libraryName });
    setSelectedLibraryId(libraryId);
    setSelectedConceptId(null);
    setSelectedTag(null);
    setSelectedTopicId(null);
    setSelectedTopic(null);
    setLinkedTopicIds([]);
    setLinkedTopicTitles([]);
    setHighlightConceptId(null);
    // Galaxy nest filter is applied by overlay via selectedLibraryId.
    setFocusConceptIds(null);
  }, []);

  const clearLibrarySelection = useCallback(() => {
    setSelectedLibraryId(null);
    setInspectorTarget((prev) => (prev?.kind === 'library' ? null : prev));
  }, []);

  const inspectTag = useCallback((tag: string, conceptIds: string[]) => {
    setOverlayOpen(true);
    setActiveTab('galaxy');
    setPageInspectorOpen(true);
    setInspectorTarget({ kind: 'tag', tag });
    setSelectedTag(tag);
    setSelectedConceptId(null);
    setSelectedLibraryId(null);
    setSelectedTopicId(null);
    setSelectedTopic(null);
    setLinkedTopicIds([]);
    setLinkedTopicTitles([]);
    setHighlightConceptId(conceptIds[0] ?? null);
    setFocusConceptIds(conceptIds.length > 0 ? conceptIds : null);
  }, []);

  const selectTopic = useCallback(
    async (topicId: string) => {
      setSelectedTopicId(topicId);
      setOverlayOpen(true);
      setActiveTab('galaxy');
      setPageInspectorOpen(true);
      setInspectorTarget({ kind: 'topic', topicId });
      setSelectedConceptId(null);
      setSelectedLibraryId(null);
      setSelectedTag(null);
      setHighlightConceptId(null);
      try {
        await loadTopicDetail(topicId);
      } catch {
        setSelectedTopic(null);
        setFocusConceptIds(null);
        setLinkedTopicIds([]);
        setLinkedTopicTitles([]);
      }
    },
    [loadTopicDetail],
  );

  const patchSelectedTopic = useCallback((partial: Partial<ResearchTopicDetail>) => {
    setSelectedTopic((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      if (partial.synopsisMd !== undefined) {
        const parsed = parseSynopsisWikilinks(partial.synopsisMd);
        setLinkedTopicIds(parsed.linkedTopicIds);
        setLinkedTopicTitles(parsed.linkedTopicTitles);
      }
      return next;
    });
    if (partial.memberships) {
      setFocusConceptIds(partial.memberships.map((m) => m.conceptId));
    }
  }, []);

  const value = useMemo<ResearchViewContextValue>(
    () => ({
      companyId: props.companyId,
      overlayOpen,
      pageInspectorOpen,
      inspectorTarget,
      activeTab,
      selectedTopicId,
      selectedTopic,
      selectedConceptId,
      selectedLibraryId,
      selectedTag,
      linkedTopicIds,
      linkedTopicTitles,
      focusConceptIds,
      highlightConceptId,
      includeNeighbors,
      openOverlay,
      closeOverlay,
      closeResearchWorkspace,
      registerLeftPanelBridge,
      openPageInspector,
      closePageInspector,
      setActiveTab,
      selectTopic,
      inspectConcept,
      inspectLibrary,
      clearLibrarySelection,
      inspectTag,
      clearTopicFocus,
      focusConcept,
      setIncludeNeighbors,
      patchSelectedTopic,
    }),
    [
      props.companyId,
      overlayOpen,
      pageInspectorOpen,
      inspectorTarget,
      activeTab,
      selectedTopicId,
      selectedTopic,
      selectedConceptId,
      selectedLibraryId,
      selectedTag,
      linkedTopicIds,
      linkedTopicTitles,
      focusConceptIds,
      highlightConceptId,
      includeNeighbors,
      openOverlay,
      closeOverlay,
      closeResearchWorkspace,
      registerLeftPanelBridge,
      openPageInspector,
      closePageInspector,
      selectTopic,
      inspectConcept,
      inspectLibrary,
      clearLibrarySelection,
      inspectTag,
      clearTopicFocus,
      focusConcept,
      patchSelectedTopic,
    ],
  );

  return (
    <ResearchViewContext.Provider value={value}>{props.children}</ResearchViewContext.Provider>
  );
}

export function useResearchView(): ResearchViewContextValue {
  const ctx = useContext(ResearchViewContext);
  if (!ctx) {
    throw new Error('useResearchView must be used within ResearchViewProvider');
  }
  return ctx;
}
