'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/** Overlay recommendation focus (D-131). Left rail is holdings-only inventory. */
export type MarketPostureCategory =
  | 'positions'
  | 'watchlists'
  | 'trends'
  | 'pipeline'
  | 'model';

export interface MarketPostureFocusOpts {
  symbol?: string | null;
  positionId?: string | null;
  category?: MarketPostureCategory;
  /** Open day overlay when focusing. Default true. */
  openOverlay?: boolean;
}

export interface MarketPostureViewContextValue {
  companyId: string;
  overlayOpen: boolean;
  selectedPositionId: string | null;
  selectedSymbol: string | null;
  category: MarketPostureCategory;
  openOverlay: () => void;
  closeOverlay: () => void;
  /** Collapse left panel + hide overlay (edge rail / Esc). */
  closeWorkspace: () => void;
  registerLeftPanelBridge: (
    bridge: { ensurePostureOpen: () => void; collapse: () => void } | null,
  ) => void;
  selectPosition: (positionId: string | null, symbol?: string | null) => void;
  /** Focus overlay on a symbol / category (rail → overlay parity). */
  focusEntity: (opts: MarketPostureFocusOpts) => void;
  setCategory: (c: MarketPostureCategory) => void;
}

const MarketPostureViewContext = createContext<MarketPostureViewContextValue | null>(null);

export function MarketPostureViewProvider(props: { companyId: string; children: ReactNode }) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [category, setCategory] = useState<MarketPostureCategory>('watchlists');
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

  const focusEntity = useCallback(
    (opts: MarketPostureFocusOpts) => {
      if (opts.category) setCategory(opts.category);
      if (opts.positionId !== undefined) {
        setSelectedPositionId(opts.positionId);
      }
      if (opts.symbol !== undefined) {
        setSelectedSymbol(opts.symbol);
        if (opts.positionId === undefined && opts.symbol === null) {
          setSelectedPositionId(null);
        }
      }
      if (opts.openOverlay !== false) {
        setOverlayOpen(true);
      }
    },
    [],
  );

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
      focusEntity,
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
      focusEntity,
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
