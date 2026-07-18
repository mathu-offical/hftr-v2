'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type MarketPostureCategory = 'positions' | 'watchlists' | 'trends' | 'pipeline';

export interface MarketPostureViewContextValue {
  companyId: string;
  overlayOpen: boolean;
  selectedPositionId: string | null;
  selectedSymbol: string | null;
  category: MarketPostureCategory;
  openOverlay: () => void;
  closeOverlay: () => void;
  /** Collapse left panel + hide overlay (× control). */
  closeWorkspace: () => void;
  registerLeftPanelBridge: (
    bridge: { ensurePostureOpen: () => void; collapse: () => void } | null,
  ) => void;
  selectPosition: (positionId: string | null, symbol?: string | null) => void;
  setCategory: (c: MarketPostureCategory) => void;
}

const MarketPostureViewContext = createContext<MarketPostureViewContextValue | null>(null);

export function MarketPostureViewProvider(props: { companyId: string; children: ReactNode }) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [category, setCategory] = useState<MarketPostureCategory>('positions');
  const [bridge, setBridge] = useState<{
    ensurePostureOpen: () => void;
    collapse: () => void;
  } | null>(null);

  const openOverlay = useCallback(() => setOverlayOpen(true), []);
  const closeOverlay = useCallback(() => setOverlayOpen(false), []);
  const closeWorkspace = useCallback(() => {
    setOverlayOpen(false);
    bridge?.collapse();
  }, [bridge]);

  const registerLeftPanelBridge = useCallback(
    (b: { ensurePostureOpen: () => void; collapse: () => void } | null) => {
      setBridge(b);
    },
    [],
  );

  const selectPosition = useCallback((positionId: string | null, symbol?: string | null) => {
    setSelectedPositionId(positionId);
    setSelectedSymbol(symbol ?? null);
  }, []);

  const value = useMemo<MarketPostureViewContextValue>(
    () => ({
      companyId: props.companyId,
      overlayOpen,
      selectedPositionId,
      selectedSymbol,
      category,
      openOverlay,
      closeOverlay,
      closeWorkspace,
      registerLeftPanelBridge,
      selectPosition,
      setCategory,
    }),
    [
      props.companyId,
      overlayOpen,
      selectedPositionId,
      selectedSymbol,
      category,
      openOverlay,
      closeOverlay,
      closeWorkspace,
      registerLeftPanelBridge,
      selectPosition,
    ],
  );

  return (
    <MarketPostureViewContext.Provider value={value}>
      {props.children}
    </MarketPostureViewContext.Provider>
  );
}

export function useMarketPostureView(): MarketPostureViewContextValue {
  const ctx = useContext(MarketPostureViewContext);
  if (!ctx) {
    throw new Error('useMarketPostureView requires MarketPostureViewProvider');
  }
  return ctx;
}
