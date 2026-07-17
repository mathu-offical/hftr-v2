'use client';

import { useState } from 'react';

/**
 * Master paper/live switch (ui-ux spec: top app shell). Live trading is gated
 * behind broker connection + explicit arming (master-build-plan M5) and fails
 * closed: the control is visible so the operator learns the model, but live
 * cannot be enabled until the gate criteria exist.
 */
export function ModeSwitch(props: { mode: string }) {
  const [showGate, setShowGate] = useState(false);

  return (
    <div className="relative flex items-center rounded-md border border-[var(--color-line)] p-0.5 text-[11px]">
      <span
        className={`rounded px-2 py-0.5 uppercase tracking-wide ${
          props.mode === 'paper'
            ? 'bg-[var(--color-surface-2)] text-[var(--color-ok)]'
            : 'text-[var(--color-ink-faint)]'
        }`}
      >
        paper
      </span>
      <button
        onClick={() => setShowGate((v) => !v)}
        className="rounded px-2 py-0.5 uppercase tracking-wide text-[var(--color-ink-faint)] hover:text-[var(--color-ink-dim)]"
        aria-label="Live trading (gated)"
      >
        live
      </button>
      {showGate && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3 text-xs text-[var(--color-ink-dim)] shadow-xl">
          <p className="mb-1 font-medium text-[var(--color-ink)]">Live trading is gated.</p>
          <p>
            Requires a connected broker, funded account, and explicit arming with guardrails
            reviewed. Paper and live share the same engine — only the adapter changes.
          </p>
        </div>
      )}
    </div>
  );
}
