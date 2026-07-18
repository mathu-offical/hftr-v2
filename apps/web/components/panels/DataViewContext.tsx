'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type DataExplorerTarget =
  | { type: 'live_source'; kind: string; label: string }
  | { type: 'library'; libraryId: string; libraryName: string }
  | { type: 'concept'; conceptId: string; title?: string }
  | { type: 'company_module'; moduleId: string; moduleName: string };

export type DataViewMode = 'markdown' | 'json';

export interface DataViewContextValue {
  companyId: string;
  overlayOpen: boolean;
  target: DataExplorerTarget | null;
  searchQuery: string;
  filterAdmission: string | 'all';
  viewMode: DataViewMode;
  openOverlay: () => void;
  closeOverlay: () => void;
  /** Collapse left panel + hide overlay (edge rail / Esc). */
  closeWorkspace: () => void;
  registerLeftPanelBridge: (
    bridge: { ensureDataOpen: () => void; collapse: () => void } | null,
  ) => void;
  selectLiveSource: (kind: string, label: string) => void;
  selectLibrary: (libraryId: string, libraryName: string) => void;
  selectConcept: (conceptId: string, title?: string) => void;
  selectCompanyModule: (moduleId: string, moduleName: string) => void;
  setSearchQuery: (q: string) => void;
  setFilterAdmission: (f: string | 'all') => void;
  setViewMode: (mode: DataViewMode) => void;
}

const DataViewContext = createContext<DataViewContextValue | null>(null);

export function DataViewProvider(props: { companyId: string; children: ReactNode }) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [target, setTarget] = useState<DataExplorerTarget | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAdmission, setFilterAdmission] = useState<string | 'all'>('all');
  const [viewMode, setViewMode] = useState<DataViewMode>('markdown');
  const [bridge, setBridge] = useState<{
    ensureDataOpen: () => void;
    collapse: () => void;
  } | null>(null);

  const openOverlay = useCallback(() => setOverlayOpen(true), []);
  const closeOverlay = useCallback(() => setOverlayOpen(false), []);
  const closeWorkspace = useCallback(() => {
    setOverlayOpen(false);
    bridge?.collapse();
  }, [bridge]);

  const registerLeftPanelBridge = useCallback(
    (b: { ensureDataOpen: () => void; collapse: () => void } | null) => {
      setBridge(b);
    },
    [],
  );

  const selectLiveSource = useCallback((kind: string, label: string) => {
    setTarget({ type: 'live_source', kind, label });
    setOverlayOpen(true);
  }, []);

  const selectLibrary = useCallback((libraryId: string, libraryName: string) => {
    setTarget({ type: 'library', libraryId, libraryName });
    setOverlayOpen(true);
  }, []);

  const selectConcept = useCallback((conceptId: string, title?: string) => {
    setTarget(
      title !== undefined
        ? { type: 'concept', conceptId, title }
        : { type: 'concept', conceptId },
    );
    setOverlayOpen(true);
  }, []);

  const selectCompanyModule = useCallback((moduleId: string, moduleName: string) => {
    setTarget({ type: 'company_module', moduleId, moduleName });
    setOverlayOpen(true);
  }, []);

  const value = useMemo<DataViewContextValue>(
    () => ({
      companyId: props.companyId,
      overlayOpen,
      target,
      searchQuery,
      filterAdmission,
      viewMode,
      openOverlay,
      closeOverlay,
      closeWorkspace,
      registerLeftPanelBridge,
      selectLiveSource,
      selectLibrary,
      selectConcept,
      selectCompanyModule,
      setSearchQuery,
      setFilterAdmission,
      setViewMode,
    }),
    [
      props.companyId,
      overlayOpen,
      target,
      searchQuery,
      filterAdmission,
      viewMode,
      openOverlay,
      closeOverlay,
      closeWorkspace,
      registerLeftPanelBridge,
      selectLiveSource,
      selectLibrary,
      selectConcept,
      selectCompanyModule,
    ],
  );

  return <DataViewContext.Provider value={value}>{props.children}</DataViewContext.Provider>;
}

export function useDataView(): DataViewContextValue {
  const ctx = useContext(DataViewContext);
  if (!ctx) {
    throw new Error('useDataView requires DataViewProvider');
  }
  return ctx;
}
