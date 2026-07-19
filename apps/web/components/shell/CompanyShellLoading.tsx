import {
  IndeterminateProgressBar,
  InlineLoadingStrip,
  RailSkeletonSlots,
  RegionLoadingCard,
  ShimmerBlock,
} from '@/components/shell/LoadingChrome';

/**
 * Shared company-workspace loading chrome (D-196 / D-198 / D-201).
 * Shell geometry matches the live company page so navigation paints immediately.
 */

export function CompanyShellLoadingFrame(props: {
  /** Shown in the company switcher slot while identity loads. */
  companyLabel?: string;
}) {
  const label = props.companyLabel ?? 'Resolving company…';
  return (
    <div className="flex h-screen flex-col" aria-busy="true" data-testid="company-shell-loading">
      <IndeterminateProgressBar size="lg" label="Loading company shell" />
      <header className="relative flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs tracking-widest text-[var(--color-ink-dim)]">hftr</span>
          <span className="border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            {label}
          </span>
          <ShimmerBlock className="h-6 w-14" />
        </div>
        <div className="hidden min-w-0 flex-1 items-center overflow-hidden px-4 md:flex">
          <InlineLoadingStrip label="Executions" detail="awaiting identity" />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ShimmerBlock className="h-6 w-12" />
          <ShimmerBlock className="h-6 w-14" />
          <ShimmerBlock className="h-6 w-24" />
          <ShimmerBlock className="h-6 w-12" />
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
              title="Workspace"
              detail="preparing canvas"
              phases={['Identity', 'Module graph', 'Panels']}
            />
          </div>
          <div className="flex h-9 shrink-0 items-center border-t border-[var(--color-line)] bg-[var(--color-surface-1)] px-3">
            <InlineLoadingStrip label="Bottom" detail="deferred" bar={false} />
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
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center bg-[var(--color-surface-0)] px-4">
          <div className="absolute inset-x-0 top-0">
            <IndeterminateProgressBar size="lg" label="Loading canvas" />
          </div>
          <RegionLoadingCard
            title={props.companyName ? props.companyName : 'Canvas'}
            detail="streaming graph"
            phases={['Engines', 'Links', 'Buses']}
          />
        </div>
        <div className="flex h-9 shrink-0 items-center border-t border-[var(--color-line)] bg-[var(--color-surface-1)] px-3">
          <InlineLoadingStrip label="Bottom" detail="pending" bar={false} />
        </div>
      </div>
      <aside className="flex h-full w-12 shrink-0 flex-col border-l border-[var(--color-line)] bg-[var(--color-surface-2)]">
        <RailSkeletonSlots />
      </aside>
    </div>
  );
}
