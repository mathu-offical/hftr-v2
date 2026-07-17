'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Top-right canvas controls: settings menu hosts Reflow and Clear canvas
 * (destructive clear confirms via parent modal).
 */
export function CanvasSettingsMenu(props: {
  onReflow: () => void;
  onRequestClear: () => void;
  disabled?: boolean;
  /** When false, Clear canvas is shown but disabled (empty graph). */
  canClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const canClear = props.canClear !== false;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={props.disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Canvas settings"
        onClick={() => setOpen((value) => !value)}
        className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs text-[var(--color-ink-dim)] shadow-sm hover:border-[var(--color-accent)] hover:text-[var(--color-ink)] disabled:opacity-50"
      >
        Canvas settings
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Canvas settings menu"
          className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-xs text-[var(--color-ink-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            onClick={() => {
              setOpen(false);
              props.onReflow();
            }}
          >
            Reflow canvas
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canClear}
            title={canClear ? undefined : 'Canvas is already empty'}
            className="block w-full border-t border-[var(--color-line)]/60 px-3 py-2 text-left text-xs text-[var(--color-block)] hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            onClick={() => {
              if (!canClear) return;
              setOpen(false);
              props.onRequestClear();
            }}
          >
            Clear canvas…
          </button>
        </div>
      )}
    </div>
  );
}
