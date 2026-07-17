'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ResearchTopicDetail } from '@hftr/contracts';
import { api } from '@/lib/client';

export type ResearchOverlayTab = 'galaxy' | 'article';

export interface ResearchViewContextValue {
  companyId: string;
  overlayOpen: boolean;
  activeTab: ResearchOverlayTab;
  selectedTopicId: string | null;
  selectedTopic: ResearchTopicDetail | null;
  focusConceptIds: string[] | null;
  openOverlay: (opts?: { tab?: ResearchOverlayTab }) => void;
  closeOverlay: () => void;
  setActiveTab: (tab: ResearchOverlayTab) => void;
  selectTopic: (topicId: string) => Promise<void>;
  clearTopicFocus: () => void;
}

const ResearchViewContext = createContext<ResearchViewContextValue | null>(null);

export function ResearchViewProvider(props: { companyId: string; children: ReactNode }) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ResearchOverlayTab>('galaxy');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<ResearchTopicDetail | null>(null);
  const [focusConceptIds, setFocusConceptIds] = useState<string[] | null>(null);

  const loadTopicDetail = useCallback(
    async (topicId: string) => {
      const data = await api<{ topic: ResearchTopicDetail }>(
        `/api/companies/${props.companyId}/research/topics/${topicId}`,
      );
      setSelectedTopic(data.topic);
      setFocusConceptIds(data.topic.memberships.map((m) => m.conceptId));
      return data.topic;
    },
    [props.companyId],
  );

  const openOverlay = useCallback((opts?: { tab?: ResearchOverlayTab }) => {
    setOverlayOpen(true);
    if (opts?.tab) setActiveTab(opts.tab);
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlayOpen(false);
  }, []);

  const clearTopicFocus = useCallback(() => {
    setSelectedTopicId(null);
    setSelectedTopic(null);
    setFocusConceptIds(null);
  }, []);

  const selectTopic = useCallback(
    async (topicId: string) => {
      setSelectedTopicId(topicId);
      setOverlayOpen(true);
      setActiveTab('galaxy');
      try {
        await loadTopicDetail(topicId);
      } catch {
        setSelectedTopic(null);
        setFocusConceptIds(null);
      }
    },
    [loadTopicDetail],
  );

  const value = useMemo<ResearchViewContextValue>(
    () => ({
      companyId: props.companyId,
      overlayOpen,
      activeTab,
      selectedTopicId,
      selectedTopic,
      focusConceptIds,
      openOverlay,
      closeOverlay,
      setActiveTab,
      selectTopic,
      clearTopicFocus,
    }),
    [
      props.companyId,
      overlayOpen,
      activeTab,
      selectedTopicId,
      selectedTopic,
      focusConceptIds,
      openOverlay,
      closeOverlay,
      selectTopic,
      clearTopicFocus,
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
