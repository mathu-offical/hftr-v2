import Link from 'next/link';
import { getDb, scoping } from '@hftr/db';
import { CreateCompanyForm } from '@/components/CreateCompanyForm';
import { UserMenu } from '@/components/UserMenu';
import { ensureProfile, getAuthUserId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Company directory — the signed-in home. Server component; data flows
 * through the same ownership-scoped helpers as the API.
 */
export default async function CompaniesPage() {
  const userId = await getAuthUserId();
  if (!userId) return null; // middleware guarantees auth; defensive only

  let companies: Awaited<ReturnType<typeof scoping.listCompanies>> = [];
  let dbError = false;
  try {
    await ensureProfile(userId);
    companies = await scoping.listCompanies(getDb(), userId);
  } catch {
    dbError = true;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-baseline gap-4">
          <Link href="/" className="font-mono text-sm tracking-widest text-[var(--color-ink-dim)]">
            hftr
          </Link>
          <h1 className="text-xl font-semibold">Companies</h1>
        </div>
        <UserMenu />
      </header>

      {dbError ? (
        <p className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-6 text-sm text-[var(--color-warn)]">
          Database unreachable. Check DATABASE_URL and run migrations (see README).
        </p>
      ) : (
        <div className="space-y-8">
          <CreateCompanyForm />

          {companies.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--color-line)] p-10 text-center">
              <p className="mb-2 text-[var(--color-ink-dim)]">No companies yet.</p>
              <p className="text-sm text-[var(--color-ink-faint)]">
                Create one above — it starts in paper mode with a Math module already on the canvas.
              </p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {companies.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/companies/${c.id}`}
                    className="block rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-5 transition-colors hover:border-[var(--color-accent)]"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium">{c.name}</span>
                      <span className="status-chip">{c.mode}</span>
                    </div>
                    <p className="line-clamp-2 text-sm text-[var(--color-ink-dim)]">
                      {c.philosophyPrompt}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
