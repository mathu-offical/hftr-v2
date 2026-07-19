/**
 * Shared company-workspace loading chrome (D-196).
 * Shell geometry matches the live company page so navigation paints immediately.
 */

export function CompanyShellLoadingFrame(props: {
  /** Shown in the company switcher slot while identity loads. */
  companyLabel?: string;
}) {
  const label = props.companyLabel ?? 'Loading company…';
  return (
    <div className="flex h-screen flex-col" aria-busy="true" data-testid="company-shell-loading">
      <header className="relative flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs tracking-widest text-[var(--color-ink-dim)]">hftr</span>
          <span className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[11px] text-[var(--color-ink-faint)]">
            {label}
          </span>
          <span className="rounded-md border border-dashed border-[var(--color-line)] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Profile
          </span>
        </div>
        <div className="hidden min-w-0 flex-1 items-center overflow-hidden px-4 md:flex">
          <span className="text-[11px] text-[var(--color-ink-faint)]">Loading executions…</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="rounded-md border border-[var(--color-line)] px-2 py-0.5 text-[11px] uppercase tracking-wide text-[var(--color-ink-faint)]">
            Mode
          </span>
          <span className="status-chip font-mono text-[var(--color-ink-faint)]">llm: …</span>
          <span className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Processing queue
          </span>
          <span className="rounded-md border border-[var(--color-line)] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Settings
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className="flex h-full w-12 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface-2)]"
          aria-label="Left panel loading"
        >
          <div className="flex flex-col gap-2 p-1.5">
            <div className="h-9 rounded-md bg-[var(--color-surface-1)]" />
            <div className="h-9 rounded-md bg-[var(--color-surface-1)]" />
            <div className="h-9 rounded-md bg-[var(--color-surface-1)]" />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[var(--color-surface-0)]">
            <p className="text-xs text-[var(--color-ink-faint)]">Loading workspace…</p>
          </div>
          <div className="flex h-10 shrink-0 items-center border-t border-[var(--color-line)] bg-[var(--color-surface-1)] px-3">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              Bottom panel
            </span>
          </div>
        </div>

        <aside
          className="flex h-full w-12 shrink-0 flex-col border-l border-[var(--color-line)] bg-[var(--color-surface-2)]"
          aria-label="Right panel loading"
        >
          <div className="flex flex-col gap-2 p-1.5">
            <div className="h-9 rounded-md bg-[var(--color-surface-1)]" />
            <div className="h-9 rounded-md bg-[var(--color-surface-1)]" />
            <div className="h-9 rounded-md bg-[var(--color-surface-1)]" />
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Workspace region under a painted header (Suspense fallback). */
export function CompanyWorkspaceLoading(props: { companyName?: string }) {
  return (
    <div
      className="flex min-h-0 flex-1"
      aria-busy="true"
      data-testid="company-workspace-loading"
    >
      <aside className="flex h-full w-12 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface-2)]">
        <div className="flex flex-col gap-2 p-1.5">
          <div className="h-9 animate-pulse rounded-md bg-[var(--color-surface-1)]" />
          <div className="h-9 animate-pulse rounded-md bg-[var(--color-surface-1)]" />
          <div className="h-9 animate-pulse rounded-md bg-[var(--color-surface-1)]" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[var(--color-surface-0)]">
          <p className="text-xs text-[var(--color-ink-faint)]">
            {props.companyName
              ? `Loading ${props.companyName} canvas…`
              : 'Loading canvas…'}
          </p>
        </div>
        <div className="flex h-10 shrink-0 items-center border-t border-[var(--color-line)] bg-[var(--color-surface-1)] px-3">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Loading bottom panel…
          </span>
        </div>
      </div>
      <aside className="flex h-full w-12 shrink-0 flex-col border-l border-[var(--color-line)] bg-[var(--color-surface-2)]">
        <div className="flex flex-col gap-2 p-1.5">
          <div className="h-9 animate-pulse rounded-md bg-[var(--color-surface-1)]" />
          <div className="h-9 animate-pulse rounded-md bg-[var(--color-surface-1)]" />
          <div className="h-9 animate-pulse rounded-md bg-[var(--color-surface-1)]" />
        </div>
      </aside>
    </div>
  );
}
