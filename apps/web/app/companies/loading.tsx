import Link from 'next/link';
import {
  IndeterminateProgressBar,
  InlineLoadingStrip,
  ShimmerBlock,
} from '@/components/shell/LoadingChrome';

/**
 * Instant directory chrome while company cards load (D-196 / D-198).
 */
export default function CompaniesDirectoryLoading() {
  return (
    <main
      className="mx-auto max-w-6xl px-6 py-10"
      aria-busy="true"
      data-testid="companies-directory-loading"
    >
      <div className="mb-6">
        <IndeterminateProgressBar size="lg" label="Loading companies directory" />
      </div>
      <header className="mb-10 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-4">
          <Link href="/" className="font-mono text-sm tracking-widest text-[var(--color-ink-dim)]">
            hftr
          </Link>
          <h1 className="text-xl font-semibold">Companies</h1>
        </div>
        <InlineLoadingStrip
          className="w-44"
          label="Directory"
          detail="Fetching owned companies"
        />
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <ShimmerBlock className="h-4 w-2/3" />
                <ShimmerBlock className="h-5 w-12 rounded-full" />
              </div>
              <ShimmerBlock className="h-3 w-full" />
              <ShimmerBlock className="h-3 w-4/5" />
              <div className="flex gap-2 pt-2">
                <ShimmerBlock className="h-3 w-20" />
                <ShimmerBlock className="h-3 w-24" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
