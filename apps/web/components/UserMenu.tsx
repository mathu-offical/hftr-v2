import { UserButton } from '@clerk/nextjs';
import { clerkConfigured, devBypassActive } from '@/lib/auth';

/** Clerk user button when configured; a labeled chip under the dev bypass. */
export function UserMenu() {
  if (clerkConfigured()) return <UserButton />;
  if (devBypassActive()) return <span className="status-chip">dev user</span>;
  return null;
}
