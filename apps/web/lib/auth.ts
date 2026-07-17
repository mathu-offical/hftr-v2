import { auth, currentUser } from '@clerk/nextjs/server';
import { getDb } from '@hftr/db';
import { usersProfile } from '@hftr/db/schema';

/**
 * Auth resolution. Clerk is the real path; a dev bypass exists ONLY when all
 * three hold: Clerk is unconfigured, DEV_AUTH_BYPASS=1, and NODE_ENV is not
 * production. Production with missing Clerk keys fails closed (no session).
 */

export function clerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

export function devBypassActive(): boolean {
  return (
    !clerkConfigured() &&
    process.env.DEV_AUTH_BYPASS === '1' &&
    process.env.NODE_ENV !== 'production'
  );
}

const DEV_USER_ID = 'dev_local_user';

export async function getAuthUserId(): Promise<string | null> {
  if (devBypassActive()) return DEV_USER_ID;
  if (!clerkConfigured()) return null;
  const { userId } = await auth();
  return userId;
}

/**
 * Upsert the users_profile row for the current session (T0.2). Called from
 * authenticated layouts; idempotent.
 */
export async function ensureProfile(clerkUserId: string): Promise<void> {
  const db = getDb();
  let displayName = clerkUserId;
  if (clerkConfigured()) {
    try {
      const user = await currentUser();
      displayName = user?.firstName ?? user?.username ?? clerkUserId;
    } catch {
      // Profile display name is cosmetic; never block on it.
    }
  }
  await db
    .insert(usersProfile)
    .values({ clerkUserId, displayPrefs: { displayName } })
    .onConflictDoNothing({ target: usersProfile.clerkUserId });
}
