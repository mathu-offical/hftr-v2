import { UserButton } from '@clerk/nextjs';
import { clerkConfigured, showDevUserChip } from '@/lib/auth-client';

/** Clerk user button when configured; a labeled chip under the dev bypass. */
export function UserMenu() {
  if (clerkConfigured()) return <UserButton />;
  if (showDevUserChip()) return <span className="status-chip">dev user</span>;
  return null;
}
