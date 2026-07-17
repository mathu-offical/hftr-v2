import Link from 'next/link';
import { clerkConfigured, devBypassActive, getAuthUserId } from '@/lib/auth';

/**
 * Public landing page. Deliberately quiet: one claim, one proof point,
 * one action (ui-spec: avoid visual bloat).
 */
export default async function LandingPage() {
  const userId = await getAuthUserId();
  const signedIn = Boolean(userId);
  const authReady = clerkConfigured() || devBypassActive();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6">
      <header className="flex items-baseline justify-between">
        <span className="font-mono text-sm tracking-widest text-[var(--color-ink-dim)]">hftr</span>
        <nav className="flex gap-4 text-sm">
          {signedIn ? (
            <Link href="/companies" className="text-[var(--color-accent)] hover:underline">
              Your companies
            </Link>
          ) : authReady ? (
            <Link
              href="/sign-in"
              className="text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
            >
              Sign in
            </Link>
          ) : null}
        </nav>
      </header>

      <section className="space-y-6">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">
          Build trading companies out of modules.
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-[var(--color-ink-dim)]">
          Research, trends, and strategy are steered by AI through bounded choices. Every number,
          timestamp, and order is handled by a deterministic engine the AI cannot touch — and you
          can audit all of it, down to the source.
        </p>
        <div className="flex items-center gap-4">
          {signedIn ? (
            <Link
              href="/companies"
              className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              Open dashboard
            </Link>
          ) : authReady ? (
            <Link
              href="/sign-up"
              className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              Start in paper mode
            </Link>
          ) : (
            <span className="rounded-lg border border-[var(--color-line)] px-5 py-2.5 text-sm text-[var(--color-ink-faint)]">
              Auth not configured — add Clerk keys to .env.local
            </span>
          )}
          <span className="text-xs text-[var(--color-ink-faint)]">
            Paper first. Live trading is gated and fail-closed.
          </span>
        </div>
      </section>

      <footer className="text-xs text-[var(--color-ink-faint)]">
        Simulated results do not guarantee future returns.
      </footer>
    </main>
  );
}
