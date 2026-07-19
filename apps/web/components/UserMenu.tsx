import { UserButton } from '@clerk/nextjs';

/**
 * Clerk user button when the root layout mounts `<ClerkProvider />`
 * (both publishable + secret keys). Matches `app/layout.tsx` — never render
 * `<UserButton />` when only `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set, or
 * the page crashes and chrome (including Settings) becomes unreachable.
 *
 * Server Component: branch runs only on the server so `CLERK_SECRET_KEY` is
 * visible for the check.
 */
export function UserMenu() {
  const clerkProviderMounted = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
      process.env.CLERK_SECRET_KEY?.trim(),
  );
  if (clerkProviderMounted) return <UserButton />;
  if (process.env.NODE_ENV !== 'production') {
    return <span className="status-chip">dev user</span>;
  }
  return null;
}
