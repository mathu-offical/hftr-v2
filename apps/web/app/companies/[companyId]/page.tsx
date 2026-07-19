import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { missingModuleSetupFields, EngineUtilityBus } from '@hftr/contracts';
import { getDb, NotFoundError, scoping } from '@hftr/db';
import { engineUtilityLinks } from '@hftr/db/schema';
import { eq } from 'drizzle-orm';
import { CanvasFamilyLayoutSync } from '@/components/canvas/CanvasFamilyLayoutSync';
import { CompanyCanvas } from '@/components/canvas/CompanyCanvas';
import { BottomPanel } from '@/components/panels/BottomPanel';
import { LeftPanel } from '@/components/panels/LeftPanel';
import { RightPanel } from '@/components/panels/RightPanel';
import { CompanyResearchShell } from '@/components/research/CompanyResearchShell';
import { ResearchOverlay } from '@/components/research/ResearchOverlay';
import { ShellInspectorLayer } from '@/components/research/ShellInspectorLayer';
import { DataExplorerOverlay } from '@/components/panels/DataExplorerOverlay';
import { MarketPostureOverlay } from '@/components/panels/MarketPostureOverlay';
import { ProcessingQueueChip } from '@/components/ProcessingQueueChip';
import { CompanySwitcher } from '@/components/shell/CompanySwitcher';
import { ExecutionTicker } from '@/components/shell/ExecutionTicker';
import {
  LlmConnectionStatusProvider,
  LlmRibbonStatusChip,
} from '@/components/shell/LlmConnectionStatus';
import { ModeSwitch } from '@/components/shell/ModeSwitch';
import { TopDrawer } from '@/components/shell/TopDrawer';
import { UserSettingsLauncher } from '@/components/shell/UserSettingsModal';
import { UserMenu } from '@/components/UserMenu';
import { getAuthUserId } from '@/lib/auth';
import { RegionLoadingCard, IndeterminateProgressBar } from '@/components/shell/LoadingChrome';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });

type OwnedCompany = Awaited<ReturnType<typeof scoping.getOwnedCompany>>;

/** Slim company fields needed by workspace chrome (panels / drawer already have SSR header). */
type OwnedCompanyShellFields = Pick<
  OwnedCompany,
  | 'name'
  | 'mode'
  | 'philosophyPrompt'
  | 'philosophyProfile'
  | 'seedCreditsCents'
  | 'createdAt'
  | 'sectorFocuses'
  | 'universeExcludes'
>;

type ModuleRow = Awaited<ReturnType<typeof scoping.listModules>>[number];
type LinkRow = Awaited<ReturnType<typeof scoping.listLinks>>[number];
type EngineRow = Awaited<ReturnType<typeof scoping.listEngineInstances>>[number];
type UtilityLinkRow = typeof engineUtilityLinks.$inferSelect;

/**
 * Company workspace (D-196 / D-200):
 * - Header paints after fast `getOwnedCompany`.
 * - Suspense fallback mounts real panel rails/buttons with empty graph props.
 * - Workspace body does read-only module/link/engine loads (no layout mutations).
 * - Family layout heal runs client-side after paint (`CanvasFamilyLayoutSync`).
 */
export default async function CompanyPage(props: { params: Promise<{ companyId: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return null;

  const parsed = Params.safeParse(await props.params);
  if (!parsed.success) notFound();
  const { companyId } = parsed.data;

  const db = getDb();
  let company: OwnedCompany;
  try {
    company = await scoping.getOwnedCompany(db, userId, companyId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const shellCompany: OwnedCompanyShellFields = {
    name: company.name,
    mode: company.mode,
    philosophyPrompt: company.philosophyPrompt,
    philosophyProfile: company.philosophyProfile,
    seedCreditsCents: company.seedCreditsCents,
    createdAt: company.createdAt,
    sectorFocuses: company.sectorFocuses,
    universeExcludes: company.universeExcludes,
  };

  return (
    <LlmConnectionStatusProvider companyId={companyId}>
      <div className="flex h-screen flex-col">
        <header className="relative flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-2">
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/companies"
              className="font-mono text-xs tracking-widest text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
            >
              hftr
            </Link>
            <CompanySwitcher
              companyId={companyId}
              companyName={company.name}
              companyMode={company.mode}
            />
            <TopDrawer
              companyId={companyId}
              companyName={company.name}
              companyMode={company.mode}
              philosophy={company.philosophyPrompt}
              philosophyProfile={company.philosophyProfile}
              seedCreditsCents={company.seedCreditsCents.toString()}
              createdAt={company.createdAt.toISOString()}
              sectorFocuses={company.sectorFocuses ?? []}
              universeExcludes={company.universeExcludes ?? []}
            />
          </div>
          <ExecutionTicker companyId={companyId} />
          <div className="flex shrink-0 items-center gap-3">
            <ModeSwitch companyId={companyId} mode={company.mode} />
            <LlmRibbonStatusChip />
            <ProcessingQueueChip companyId={companyId} />
            <UserSettingsLauncher />
            <UserMenu />
          </div>
        </header>

        <Suspense
          fallback={
            <CompanyWorkspaceChrome
              companyId={companyId}
              company={shellCompany}
              moduleRows={[]}
              linkRows={[]}
              engineRows={[]}
              utilityLinkRows={[]}
              canvas={
                <div className="relative flex h-full min-h-0 flex-1 flex-col items-center justify-center bg-[var(--color-surface-0)] px-4">
                  <div className="absolute inset-x-0 top-0">
                    <IndeterminateProgressBar
                      size="lg"
                      label="Loading canvas"
                      className="rounded-none"
                    />
                  </div>
                  <RegionLoadingCard
                    title={`Loading ${company.name}`}
                    detail="Streaming modules, engines, and family layout"
                    phases={['Module graph', 'Engine envelopes', 'Utility buses']}
                  />
                </div>
              }
            />
          }
        >
          <CompanyWorkspaceBody userId={userId} companyId={companyId} company={company} />
        </Suspense>
      </div>
    </LlmConnectionStatusProvider>
  );
}

async function CompanyWorkspaceBody(props: {
  userId: string;
  companyId: string;
  company: OwnedCompany;
}) {
  const { userId, companyId, company } = props;
  const db = getDb();

  let moduleRows: ModuleRow[];
  let linkRows: LinkRow[];
  let engineRows: EngineRow[];
  let utilityLinkRows: UtilityLinkRow[];
  try {
    // D-200: read-only path for first paint — layout heal is client POST after mount.
    const [modules, links, engines, utilities] = await Promise.all([
      scoping.listModules(db, userId, companyId),
      scoping.listLinks(db, userId, companyId),
      scoping.listEngineInstances(db, userId, companyId),
      db.select().from(engineUtilityLinks).where(eq(engineUtilityLinks.companyId, companyId)),
    ]);
    moduleRows = modules;
    linkRows = links;
    engineRows = engines;
    utilityLinkRows = utilities;
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const shellCompany: OwnedCompanyShellFields = {
    name: company.name,
    mode: company.mode,
    philosophyPrompt: company.philosophyPrompt,
    philosophyProfile: company.philosophyProfile,
    seedCreditsCents: company.seedCreditsCents,
    createdAt: company.createdAt,
    sectorFocuses: company.sectorFocuses,
    universeExcludes: company.universeExcludes,
  };

  return (
    <CompanyWorkspaceChrome
      companyId={companyId}
      company={shellCompany}
      moduleRows={moduleRows}
      linkRows={linkRows}
      engineRows={engineRows}
      utilityLinkRows={utilityLinkRows}
      canvas={
        <CompanyCanvas
          companyId={companyId}
          initialModules={moduleRows.map((m) => {
            const config = (m.config ?? {}) as Record<string, unknown>;
            return {
              id: m.id,
              type: m.type,
              name: m.name,
              generatedNameBase: m.generatedNameBase,
              nameCustomized: m.nameCustomized,
              status: m.status,
              position: (m.canvasPosition ?? { x: 0, y: 0 }) as { x: number; y: number },
              topicSectors: m.topicSectors,
              capitalAllocationRef: m.capitalAllocationRef,
              targetExitRef: m.targetExitRef,
              missingSetupFields: missingModuleSetupFields(m.type, {
                topicSectors: m.topicSectors,
                capitalAllocationRef: m.capitalAllocationRef,
                targetExitRef: m.targetExitRef,
              }),
              engineInstanceId: m.engineInstanceId,
              toolOwnerModuleId: m.toolOwnerModuleId,
              topicSectorsOverridden: m.topicSectorsOverridden,
              config,
            };
          })}
          initialEngines={engineRows.map((e) => ({
            id: e.id,
            templateId: e.templateId,
            label: e.label,
            masterTopicSectors: e.masterTopicSectors,
            capitalAllocationRef: e.capitalAllocationRef,
            targetExitRef: e.targetExitRef,
            setupSnapshot: (e.setupSnapshot ?? null) as {
              topicSectors: string[];
              allocationMode: 'amount' | 'percentage';
              allocationValue: string;
              targetExitLocal: string;
            } | null,
            templateInputs: (e.templateInputs ?? {}) as Record<string, string>,
            canvasBounds: e.canvasBounds as {
              x: number;
              y: number;
              width: number;
              height: number;
            } | null,
            memberModuleIds: moduleRows
              .filter((m) => m.engineInstanceId === e.id)
              .map((m) => m.id),
            utilityLinks: utilityLinkRows
              .filter((link) => link.toEngineId === e.id)
              .map((link) => ({
                id: link.id,
                bus: EngineUtilityBus.parse(link.bus),
                fromEngineId: link.fromEngineId,
                fromModuleId: link.fromModuleId,
                streamId: link.streamId,
                streamDescriptor: link.streamDescriptor,
              })),
          }))}
          initialLinks={linkRows.map((l) => ({
            id: l.id,
            fromModuleId: l.fromModuleId,
            toModuleId: l.toModuleId,
            linkKind: l.linkKind,
          }))}
          companyDefaults={{
            sectorFocuses: company.sectorFocuses ?? [],
            seedCreditsCents: Number(company.seedCreditsCents),
          }}
        />
      }
    />
  );
}

function CompanyWorkspaceChrome(props: {
  companyId: string;
  company: OwnedCompanyShellFields;
  moduleRows: ModuleRow[];
  linkRows: LinkRow[];
  engineRows: EngineRow[];
  utilityLinkRows: UtilityLinkRow[];
  canvas: ReactNode;
}) {
  const { companyId, company, moduleRows, linkRows, engineRows, canvas } = props;

  return (
    <CompanyResearchShell companyId={companyId} companyMode={company.mode}>
      <CanvasFamilyLayoutSync companyId={companyId} />
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
          <div className="relative min-h-0 flex-1">
            {canvas}
            <ResearchOverlay />
            <MarketPostureOverlay />
            <DataExplorerOverlay />
            <ShellInspectorLayer />
          </div>
          <BottomPanel
            companyId={companyId}
            companyMode={company.mode}
            modules={moduleRows.map((m) => {
              const config = (m.config ?? {}) as Record<string, unknown>;
              const maxActive =
                m.type === 'trend' && typeof config.maxActiveTrends === 'number'
                  ? config.maxActiveTrends
                  : undefined;
              const policyEnvelopeRef =
                m.type === 'policy' && typeof config.policyEnvelopeRef === 'string'
                  ? config.policyEnvelopeRef
                  : undefined;
              const policyNotes =
                m.type === 'policy' && typeof config.notes === 'string' ? config.notes : undefined;
              return {
                id: m.id,
                name: m.name,
                type: m.type,
                status: m.status,
                engineInstanceId: m.engineInstanceId,
                ...(maxActive !== undefined ? { maxActiveTrends: maxActive } : {}),
                ...(policyEnvelopeRef !== undefined ? { policyEnvelopeRef } : {}),
                ...(policyNotes !== undefined ? { policyNotes } : {}),
              };
            })}
            engines={engineRows.map((e) => ({
              id: e.id,
              label: e.label,
              templateId: e.templateId,
            }))}
          />
        </div>

        <RightPanel companyId={companyId} companyMode={company.mode} />
      </div>
    </CompanyResearchShell>
  );
}
