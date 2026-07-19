/**
 * Shared loading chrome (D-198 / D-201): slim retro terminal indicators.
 * Text-first; hard edges; no glass. Bars are 1–2px flat tracks.
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
  /** Single-line compact (default). */
  compact?: boolean;
}) {
  const compact = props.compact !== false;
  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 ${props.className ?? ''}`.trim()}
    >
      <span className="hftr-load-dot shrink-0" aria-hidden />
      <p className="min-w-0 truncate font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        <span className="text-[var(--color-ink-dim)]">{props.label}</span>
        {props.detail ? (
          <>
            <span className="mx-1 text-[var(--color-line)]" aria-hidden>
              ·
            </span>
            <span className={compact ? 'normal-case tracking-normal' : ''}>{props.detail}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

export function ShimmerBlock(props: {
  className?: string;
  'aria-hidden'?: boolean;
}) {
  return (
    <div
      className={`hftr-shimmer ${props.className ?? ''}`.trim()}
      aria-hidden={props['aria-hidden'] ?? true}
    />
  );
}

/**
 * Slim inline strip: one line of status + optional thin bar under (or beside).
 * Prefer this over cards for panel/ticker waits.
 */
export function InlineLoadingStrip(props: {
  label: string;
  detail?: string;
  className?: string;
  /** Hide the bar (status text only). Default false. */
  bar?: boolean;
  'data-testid'?: string;
}) {
  const showBar = props.bar !== false;
  return (
    <div
      className={`flex min-w-0 flex-col gap-1 ${props.className ?? ''}`.trim()}
      aria-busy="true"
      data-testid={props['data-testid']}
    >
      <LoadingStatus label={props.label} {...(props.detail ? { detail: props.detail } : {})} />
      {showBar ? <IndeterminateProgressBar label={props.label} className="max-w-[12rem]" /> : null}
    </div>
  );
}

/** Quiet region loader — no glass card; mono block on the canvas. */
export function RegionLoadingCard(props: {
  title: string;
  detail?: string;
  phases?: string[];
  className?: string;
}) {
  return (
    <div
      className={`flex w-full max-w-sm flex-col gap-2 border border-[var(--color-line)] bg-[var(--color-surface-0)] px-3 py-2.5 ${props.className ?? ''}`.trim()}
      role="status"
      aria-live="polite"
    >
      <LoadingStatus
        label={props.title}
        {...(props.detail ? { detail: props.detail } : {})}
      />
      <IndeterminateProgressBar size="lg" label={props.title} />
      {props.phases && props.phases.length > 0 ? (
        <ul className="space-y-0.5 pt-1">
          {props.phases.map((phase) => (
            <li
              key={phase}
              className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]"
            >
              <span className="text-[var(--color-line)]" aria-hidden>
                ›{' '}
              </span>
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
    <div className="flex flex-col gap-1.5 p-1.5">
      {Array.from({ length: n }).map((_, i) => (
        <ShimmerBlock key={i} className="h-8" />
      ))}
    </div>
  );
}
