import Link from 'next/link';

/**
 * Instant directory chrome while company cards load (D-196).
 */
export default function CompaniesDirectoryLoading() {
  return (
    <main
      className="mx-auto max-w-6xl px-6 py-10"
      aria-busy="true"
      data-testid="companies-directory-loading"
    >
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-baseline gap-4">
          <Link href="/" className="font-mono text-sm tracking-widest text-[var(--color-ink-dim)]">
            hftr
          </Link>
          <h1 className="text-xl font-semibold">Companies</h1>
        </div>
        <span className="text-[11px] text-[var(--color-ink-faint)]">Loading…</span>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="h-36 animate-pulse rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)]"
          />
        ))}
      </ul>
    </main>
  );
}
