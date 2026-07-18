import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { missingModuleSetupFields } from '@hftr/contracts';
import { getDb, NotFoundError, scoping } from '@hftr/db';
import { engineUtilityLinks } from '@hftr/db/schema';
import { eq } from 'drizzle-orm';
import { EngineUtilityBus } from '@hftr/contracts';
import { ensureAllInterEngineDataStreamLinks } from '@hftr/engine';
import { repositionAllEngineTimeHubs } from '@/lib/time-provision';
import { AssistantDock } from '@/components/assistant/AssistantDock';
import { CompanyCanvas } from '@/components/canvas/CompanyCanvas';
import { BottomPanel } from '@/components/panels/BottomPanel';
import { LeftPanel } from '@/components/panels/LeftPanel';
import { RightPanel } from '@/components/panels/RightPanel';
import { CompanyResearchShell } from '@/components/research/CompanyResearchShell';
import { ResearchOverlay } from '@/components/research/ResearchOverlay';
import { MarketPostureOverlay } from '@/components/panels/MarketPostureOverlay';
import { QueueStatsChip } from '@/components/QueueStatsChip';
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
  let company, moduleRows, linkRows, engineRows, utilityLinkRows;
  try {
    company = await scoping.getOwnedCompany(db, userId, companyId);
    moduleRows = await scoping.listModules(db, userId, companyId);
    linkRows = await scoping.listLinks(db, userId, companyId);
    engineRows = await scoping.listEngineInstances(db, userId, companyId);
    // D-091: heal missing engine↔engine data_out→data_in so chrome edges render.
    try {
      await ensureAllInterEngineDataStreamLinks(db, companyId);
    } catch (err) {
      console.error('ensureAllInterEngineDataStreamLinks failed', err);
    }
    // Pin engine Time hubs to bottom-left of each ENGINE envelope.
    try {
      await repositionAllEngineTimeHubs(db, companyId);
      moduleRows = await scoping.listModules(db, userId, companyId);
    } catch (err) {
      console.error('repositionAllEngineTimeHubs failed', err);
    }
    utilityLinkRows = await db
      .select()
      .from(engineUtilityLinks)
      .where(eq(engineUtilityLinks.companyId, companyId));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const utilityByEngine = new Map<string, typeof utilityLinkRows>();
  for (const link of utilityLinkRows) {
    const list = utilityByEngine.get(link.toEngineId) ?? [];
    list.push(link);
    utilityByEngine.set(link.toEngineId, list);
  }

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
            <CompanySwitcher companyId={companyId} companyName={company.name} />
            <TopDrawer
              companyId={companyId}
              companyName={company.name}
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
            <QueueStatsChip />
            <UserSettingsLauncher />
            <UserMenu />
          </div>
        </header>

        <CompanyResearchShell companyId={companyId}>
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
                    utilityLinks: (utilityByEngine.get(e.id) ?? []).map((link) => ({
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
                />
                <ResearchOverlay />
                <MarketPostureOverlay />
              </div>
              <BottomPanel
                companyId={companyId}
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
                    m.type === 'policy' && typeof config.notes === 'string'
                      ? config.notes
                      : undefined;
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

            <RightPanel companyId={companyId} />
          </div>
        </CompanyResearchShell>
        <AssistantDock companyId={companyId} />
      </div>
    </LlmConnectionStatusProvider>
  );
}
