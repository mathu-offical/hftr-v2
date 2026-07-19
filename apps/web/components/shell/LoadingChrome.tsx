/**
 * Shared loading chrome (D-198): indeterminate bars, status lines, shimmer.
 * Text remains the primary signal; motion/color reinforce only.
 */

export function IndeterminateProgressBar(props: {
  className?: string;
  size?: 'sm' | 'lg';
  label?: string;
}) {
  const sizeClass = props.size === 'lg' ? 'hftr-load-track-lg' : '';
  return (
    <div
      className={`hftr-load-track ${sizeClass} ${props.className ?? ''}`.trim()}
      role="progressbar"
      aria-valuetext={props.label ?? 'Loading'}
      aria-busy="true"
    />
  );
}

export function LoadingStatus(props: {
  label: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${props.className ?? ''}`.trim()}>
      <span className="hftr-load-dot shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="truncate font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-dim)]">
          {props.label}
        </p>
        {props.detail ? (
          <p className="truncate text-[11px] text-[var(--color-ink-faint)]">{props.detail}</p>
        ) : null}
      </div>
    </div>
  );
}

export function ShimmerBlock(props: {
  className?: string;
  'aria-hidden'?: boolean;
}) {
  return (
    <div
      className={`hftr-shimmer rounded-md ${props.className ?? ''}`.trim()}
      aria-hidden={props['aria-hidden'] ?? true}
    />
  );
}

/** Compact strip: status + progress bar (ticker, panel headers). */
export function InlineLoadingStrip(props: {
  label: string;
  detail?: string;
  className?: string;
  'data-testid'?: string;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-1.5 ${props.className ?? ''}`.trim()}
      aria-busy="true"
      data-testid={props['data-testid']}
    >
      <LoadingStatus label={props.label} {...(props.detail ? { detail: props.detail } : {})} />
      <IndeterminateProgressBar label={props.label} />
    </div>
  );
}

/** Centered region loader for canvas / workspace Suspense. */
export function RegionLoadingCard(props: {
  title: string;
  detail?: string;
  phases?: string[];
  className?: string;
}) {
  return (
    <div
      className={`flex w-full max-w-md flex-col gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_24px_rgba(0,0,0,0.35)] ${props.className ?? ''}`.trim()}
      role="status"
      aria-live="polite"
    >
      <LoadingStatus
        label={props.title}
        {...(props.detail ? { detail: props.detail } : {})}
      />
      <IndeterminateProgressBar size="lg" label={props.title} />
      {props.phases && props.phases.length > 0 ? (
        <ul className="space-y-1.5 border-t border-[var(--color-line)] pt-3">
          {props.phases.map((phase) => (
            <li
              key={phase}
              className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]"
            >
              <span className="hftr-load-dot shrink-0 opacity-70" aria-hidden />
              {phase}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function RailSkeletonSlots(props: { count?: number }) {
  const n = props.count ?? 3;
  return (
    <div className="flex flex-col gap-2 p-1.5">
      {Array.from({ length: n }).map((_, i) => (
        <ShimmerBlock key={i} className="h-9" />
      ))}
    </div>
  );
}
