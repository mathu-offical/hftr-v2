/**
 * Client-safe auth flags for UI chrome.
 *
 * Do NOT import `@/lib/auth` from Client Components — that module pulls
 * `@clerk/nextjs/server` (`server-only`) and breaks the webpack graph for the
 * whole page (cascading API 500s in Next.js dev).
 *
 * `clerkConfigured()` here only sees the publishable key (secret is
 * server-only). That is NOT enough to mount `<UserButton />` — root layout
 * wraps `<ClerkProvider />` only when both keys are non-empty. Prefer the
 * server `UserMenu` component for Clerk UI chrome.
 */
export function clerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim());
}

/** Show the local "dev user" chip when Clerk publishable key is unset outside production. */
export function showDevUserChip(): boolean {
  return !clerkConfigured() && process.env.NODE_ENV !== 'production';
}
