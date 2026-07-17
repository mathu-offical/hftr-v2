import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getDb, NotFoundError, scoping } from '@hftr/db';
import { CompanyCanvas } from '@/components/canvas/CompanyCanvas';
import { BottomPanel } from '@/components/panels/BottomPanel';
import { LeftPanel } from '@/components/panels/LeftPanel';
import { RightPanel } from '@/components/panels/RightPanel';
import { QueueStatsChip } from '@/components/QueueStatsChip';
import { CompanySwitcher } from '@/components/shell/CompanySwitcher';
import { ExecutionTicker } from '@/components/shell/ExecutionTicker';
import { ModeSwitch } from '@/components/shell/ModeSwitch';
import { TopDrawer } from '@/components/shell/TopDrawer';
import { UserSettingsLauncher } from '@/components/shell/UserSettingsModal';
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
      <header className="relative flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/companies"
            className="font-mono text-xs tracking-widest text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
          >
            hftr
          </Link>
          <CompanySwitcher companyId={companyId} companyName={company.name} />
          <TopDrawer
            companyId={companyId}
            companyName={company.name}
            philosophy={company.philosophyPrompt}
            seedCreditsCents={company.seedCreditsCents.toString()}
            createdAt={company.createdAt.toISOString()}
          />
        </div>
        <ExecutionTicker companyId={companyId} />
        <div className="flex shrink-0 items-center gap-3">
          <ModeSwitch mode={company.mode} />
          <QueueStatsChip />
          <UserSettingsLauncher />
          <UserMenu />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <LeftPanel
          modules={moduleRows.map((m) => ({
            id: m.id,
            name: m.name,
            type: m.type,
            status: m.status,
            config: (m.config ?? {}) as Record<string, unknown>,
          }))}
          links={linkRows.map((l) => ({
            fromModuleId: l.fromModuleId,
            toModuleId: l.toModuleId,
            linkKind: l.linkKind,
          }))}
        />

        <div className="flex min-w-0 flex-1 flex-col">
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
          <BottomPanel
            companyId={companyId}
            modules={moduleRows.map((m) => ({ id: m.id, name: m.name, type: m.type }))}
          />
        </div>

        <RightPanel companyId={companyId} />
      </div>
    </div>
  );
}
