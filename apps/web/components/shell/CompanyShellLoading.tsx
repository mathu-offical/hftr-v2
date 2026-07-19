import {
  IndeterminateProgressBar,
  InlineLoadingStrip,
  RailSkeletonSlots,
  RegionLoadingCard,
  ShimmerBlock,
} from '@/components/shell/LoadingChrome';

/**
 * Shared company-workspace loading chrome (D-196 / D-198).
 * Shell geometry matches the live company page so navigation paints immediately.
 */

export function CompanyShellLoadingFrame(props: {
  /** Shown in the company switcher slot while identity loads. */
  companyLabel?: string;
}) {
  const label = props.companyLabel ?? 'Resolving company…';
  return (
    <div className="flex h-screen flex-col" aria-busy="true" data-testid="company-shell-loading">
      <div className="shrink-0">
        <IndeterminateProgressBar size="lg" label="Loading company shell" className="rounded-none" />
      </div>
      <header className="relative flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs tracking-widest text-[var(--color-ink-dim)]">hftr</span>
          <span className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[11px] text-[var(--color-ink-faint)]">
            {label}
          </span>
          <ShimmerBlock className="h-7 w-16" />
        </div>
        <div className="hidden min-w-0 flex-1 items-center overflow-hidden px-4 md:flex">
          <InlineLoadingStrip
            className="w-full max-w-sm"
            label="Executions"
            detail="Waiting for shell identity"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ShimmerBlock className="h-7 w-14" />
          <ShimmerBlock className="h-7 w-16" />
          <ShimmerBlock className="h-7 w-28" />
          <ShimmerBlock className="h-7 w-16" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className="flex h-full w-12 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface-2)]"
          aria-label="Left panel loading"
        >
          <RailSkeletonSlots />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[var(--color-surface-0)] px-4">
            <RegionLoadingCard
              title="Loading workspace"
              detail="Preparing canvas layout and panel graph"
              phases={['Identity', 'Module graph', 'Panel projections']}
            />
          </div>
          <div className="flex h-10 shrink-0 flex-col justify-center gap-1 border-t border-[var(--color-line)] bg-[var(--color-surface-1)] px-3">
            <InlineLoadingStrip label="Bottom panel" detail="Deferred until workspace ready" />
          </div>
        </div>

        <aside
          className="flex h-full w-12 shrink-0 flex-col border-l border-[var(--color-line)] bg-[var(--color-surface-2)]"
          aria-label="Right panel loading"
        >
          <RailSkeletonSlots />
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
        <RailSkeletonSlots />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-0 bg-[var(--color-surface-0)] px-4">
          <div className="absolute inset-x-0 top-0">
            <IndeterminateProgressBar size="lg" label="Loading canvas" className="rounded-none" />
          </div>
          <RegionLoadingCard
            title={props.companyName ? `Loading ${props.companyName}` : 'Loading canvas'}
            detail="Streaming modules, engines, and family layout"
            phases={['Engine envelopes', 'Module links', 'Utility buses']}
          />
        </div>
        <div className="flex h-11 shrink-0 flex-col justify-center border-t border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-1.5">
          <InlineLoadingStrip label="Bottom panel" detail="Will hydrate after canvas stream" />
        </div>
      </div>
      <aside className="flex h-full w-12 shrink-0 flex-col border-l border-[var(--color-line)] bg-[var(--color-surface-2)]">
        <RailSkeletonSlots />
      </aside>
    </div>
  );
}
