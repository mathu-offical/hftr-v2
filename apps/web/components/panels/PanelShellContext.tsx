'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Coordinates left ↔ right panel open/close and layering (D-185).
 *
 * Rules:
 * - Opening the left panel collapses the right panel (docked).
 * - Explicitly opening the right while left is open layers right on top of left.
 * - Any left-panel click interaction hides the right panel again.
 * - Assistant overlay (AST) stays independent (D-150).
 */
export type PanelShellContextValue = {
  leftOpen: boolean;
  setLeftOpenShared: (open: boolean) => void;
  /** True when right body should overlay the left (left stays open underneath). */
  rightLayered: boolean;
  /** Left transitioned to open — collapse docked/layered right. */
  notifyLeftOpened: () => void;
  /** Pointer interaction inside left rail/body — hide right. */
  notifyLeftInteract: () => void;
  /** Right opened explicitly (tab, chevron, lineage) — layer if left is open. */
  notifyRightOpenedExplicit: () => void;
  /** Bumps when right should collapse; RightPanel observes and sets open=false. */
  rightCollapseGeneration: number;
};

const PanelShellContext = createContext<PanelShellContextValue | null>(null);

const FALLBACK: PanelShellContextValue = {
  leftOpen: false,
  setLeftOpenShared: () => undefined,
  rightLayered: false,
  notifyLeftOpened: () => undefined,
  notifyLeftInteract: () => undefined,
  notifyRightOpenedExplicit: () => undefined,
  rightCollapseGeneration: 0,
};

export function PanelShellProvider(props: { children: ReactNode }) {
  const [leftOpen, setLeftOpenState] = useState(false);
  const [rightLayered, setRightLayered] = useState(false);
  const [rightCollapseGeneration, setRightCollapseGeneration] = useState(0);

  const setLeftOpenShared = useCallback((open: boolean) => {
    setLeftOpenState(open);
    // Left collapsed: drop overlay mode so an open right returns to docked in-flow.
    if (!open) setRightLayered(false);
  }, []);

  const collapseRight = useCallback(() => {
    setRightLayered(false);
    setRightCollapseGeneration((n) => n + 1);
  }, []);

  const notifyLeftOpened = useCallback(() => {
    collapseRight();
  }, [collapseRight]);

  const notifyLeftInteract = useCallback(() => {
    collapseRight();
  }, [collapseRight]);

  const notifyRightOpenedExplicit = useCallback(() => {
    setRightLayered(leftOpen);
  }, [leftOpen]);

  const value = useMemo(
    (): PanelShellContextValue => ({
      leftOpen,
      setLeftOpenShared,
      rightLayered,
      notifyLeftOpened,
      notifyLeftInteract,
      notifyRightOpenedExplicit,
      rightCollapseGeneration,
    }),
    [
      leftOpen,
      setLeftOpenShared,
      rightLayered,
      notifyLeftOpened,
      notifyLeftInteract,
      notifyRightOpenedExplicit,
      rightCollapseGeneration,
    ],
  );

  return (
    <PanelShellContext.Provider value={value}>{props.children}</PanelShellContext.Provider>
  );
}

export function usePanelShell(): PanelShellContextValue {
  return useContext(PanelShellContext) ?? FALLBACK;
}
