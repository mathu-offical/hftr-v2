/**
 * Client-safe auth flags for UI chrome.
 *
 * Do NOT import `@/lib/auth` from Client Components — that module pulls
 * `@clerk/nextjs/server` (`server-only`) and breaks the webpack graph for the
 * whole page (cascading API 500s in Next.js dev).
 */
export function clerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

/** Show the local "dev user" chip when Clerk is unset outside production. */
export function showDevUserChip(): boolean {
  return !clerkConfigured() && process.env.NODE_ENV !== 'production';
}
