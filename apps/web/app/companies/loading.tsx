import Link from 'next/link';
import {
  IndeterminateProgressBar,
  InlineLoadingStrip,
  ShimmerBlock,
} from '@/components/shell/LoadingChrome';

/**
 * Instant directory chrome while company cards load (D-196 / D-201).
 */
export default function CompaniesDirectoryLoading() {
  return (
    <main
      className="mx-auto max-w-6xl px-6 py-10"
      aria-busy="true"
      data-testid="companies-directory-loading"
    >
      <IndeterminateProgressBar size="lg" label="Loading companies directory" className="mb-4" />
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-4">
          <Link href="/" className="font-mono text-sm tracking-widest text-[var(--color-ink-dim)]">
            hftr
          </Link>
          <h1 className="text-xl font-semibold">Companies</h1>
        </div>
        <InlineLoadingStrip className="w-40" label="Directory" detail="fetching" />
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <ShimmerBlock className="h-3 w-2/3" />
                <ShimmerBlock className="h-3 w-10" />
              </div>
              <ShimmerBlock className="h-2.5 w-full" />
              <ShimmerBlock className="h-2.5 w-4/5" />
              <div className="flex gap-2 pt-1">
                <ShimmerBlock className="h-2.5 w-16" />
                <ShimmerBlock className="h-2.5 w-20" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
