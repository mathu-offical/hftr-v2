import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getDb, NotFoundError, scoping } from '@hftr/db';
import { ActivityPanel } from '@/components/ActivityPanel';
import { CompanyCanvas } from '@/components/canvas/CompanyCanvas';
import { QueueStatsChip } from '@/components/QueueStatsChip';
import { UserMenu } from '@/components/UserMenu';
import { getAuthUserId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });

/**
 * Company workspace: top bar (identity, mode, queue status) over the module
 * canvas (ui-spec §2-3). Panels evolve with M1; the canvas is live now.
 */
export default async function CompanyPage(props: { params: Promise<{ companyId: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return null;

  const parsed = Params.safeParse(await props.params);
  if (!parsed.success) notFound();
  const { companyId } = parsed.data;

  const db = getDb();
  let company, moduleRows, linkRows;
  try {
    company = await scoping.getOwnedCompany(db, userId, companyId);
    moduleRows = await scoping.listModules(db, userId, companyId);
    linkRows = await scoping.listLinks(db, userId, companyId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-2.5">
        <div className="flex items-center gap-4">
          <Link
            href="/companies"
            className="font-mono text-xs tracking-widest text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
          >
            hftr
          </Link>
          <span className="text-sm font-medium">{company.name}</span>
          <span className="status-chip">{company.mode}</span>
        </div>
        <div className="flex items-center gap-3">
          <QueueStatsChip />
          <UserMenu />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <CompanyCanvas
          companyId={companyId}
          initialModules={moduleRows.map((m) => ({
            id: m.id,
            type: m.type,
            name: m.name,
            status: m.status,
            position: (m.canvasPosition ?? { x: 0, y: 0 }) as { x: number; y: number },
          }))}
          initialLinks={linkRows.map((l) => ({
            id: l.id,
            fromModuleId: l.fromModuleId,
            toModuleId: l.toModuleId,
            linkKind: l.linkKind,
          }))}
        />
        <ActivityPanel companyId={companyId} />
      </div>
    </div>
  );
}
