/**
 * Shared loading chrome (D-198 / D-201 / D-202):
 * - Interface screens / panels / regions → flat loading bars
 * - Buttons / chips / rail slots / shaped controls → spinning wheels
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

/** Stepped retro spinner for buttons and shaped objects. */
export function LoadingWheel(props: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  const size =
    props.size === 'sm'
      ? 'hftr-load-wheel-sm'
      : props.size === 'lg'
        ? 'hftr-load-wheel-lg'
        : '';
  return (
    <span
      className={`hftr-load-wheel ${size} ${props.className ?? ''}`.trim()}
      role="status"
      aria-label={props.label ?? 'Loading'}
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
    <div className={`flex min-w-0 items-center gap-1.5 ${props.className ?? ''}`.trim()}>
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
 * Screen/panel strip: status + thin bar (never a wheel).
 * Use for interface regions; use LoadingWheel on buttons instead.
 */
export function InlineLoadingStrip(props: {
  label: string;
  detail?: string;
  className?: string;
  /** Show slim bar under status. Default true (screens use bars). */
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

/** Quiet region loader for canvas / workspace screens — bar, not wheel. */
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

/** Rail / shaped control placeholders — wheels, not rectangular shimmer. */
export function RailSkeletonSlots(props: { count?: number }) {
  const n = props.count ?? 3;
  return (
    <div className="flex flex-col items-center gap-2 p-1.5" aria-busy="true">
      {Array.from({ length: n }).map((_, i) => (
        <span
          key={i}
          className="flex h-9 w-9 items-center justify-center border border-[var(--color-line)] bg-[var(--color-surface-1)]"
        >
          <LoadingWheel size="sm" label="Loading control" />
        </span>
      ))}
    </div>
  );
}

/** Button-sized placeholder while a shaped control hydrates. */
export function ButtonLoadingSlot(props: {
  className?: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span
      className={`inline-flex h-7 min-w-[2.5rem] items-center justify-center border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2 ${props.className ?? ''}`.trim()}
      aria-busy="true"
    >
      <LoadingWheel size={props.size ?? 'sm'} label={props.label ?? 'Loading'} />
    </span>
  );
}
