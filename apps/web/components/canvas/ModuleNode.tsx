'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { type NodeProps, type Node } from '@xyflow/react';
import {
  missingModuleSetupFields,
  requiredModuleSetupFields,
  splitCompactModuleName,
  type ModuleSetupField,
  type ModuleStatus,
  type ModuleType,
} from '@hftr/contracts';
import { api } from '@/lib/client';
import {
  EMPTY_MODULE_SETUP_DRAFT,
  ModuleSetupFields,
  moduleSetupInputFromDraft,
  type ModuleSetupDraft,
} from './ModuleSetupFields';
import { ModuleContextPanel, moduleUsesTypeContext } from './ModuleContextPanel';
import { TrendListChrome } from './TrendListChrome';
import { FAMILY_LABELS, MODULE_VISUALS } from './canvas-visuals';
import { FamilyShapeChrome } from './FamilyShapeChrome';
import { MathPortBuses, NodePortBuses } from './NodePortBuses';
import { useModuleStreamPorts } from './use-module-stream-ports';
import type { ModuleTypeContextProjection } from './types';

export type ModuleNodeData = {
  name: string;
  generatedNameBase: string;
  nameCustomized: boolean;
  moduleType: ModuleType;
  status: ModuleStatus;
  /** Server-composed text-first status projection line (T1.4). */
  statusText?: string;
  activeJobs?: number;
  /** Pending jobs deferred by LLM budget admission (REQ-LLM-007). */
  budgetQueuedJobs?: number;
  /** Optional config summary for inline status (e.g. display kind). */
  configSnippet?: string;
  /** Subtype chip (library class, venue, trading subtype, …). */
  subtypeChip?: string | null;
  companyId: string;
  topicSectors: string[];
  capitalAllocationRef: string | null;
  targetExitRef: string | null;
  missingSetupFields: ModuleSetupField[];
  engineInstanceId: string | null;
  toolOwnerModuleId?: string | null;
  topicSectorsOverridden: boolean;
  attachedMathTools?: { id: string; name: string }[];
  /** Operator config blob (hydrated for type-context cards). */
  config?: Record<string, unknown> | undefined;
  /** D-077 type-relevant projection. */
  typeContext?: ModuleTypeContextProjection | undefined;
};

export type ModuleFlowNode = Node<ModuleNodeData, 'module'>;

const CARD_WIDTH_PX = 220;

/**
 * Fixed dashboard canvas node: labeled link-kind ports, always-visible setup
 * fields, and text-first status. Selection changes border only — no expand.
 */
export const ModuleNode = memo(function ModuleNode({
  id,
  data,
  selected,
}: NodeProps<ModuleFlowNode>) {
  const visual = MODULE_VISUALS[data.moduleType];
  const exposedOutputChannels = useMemo(() => {
    const raw = data.config?.exposedOutputChannels;
    return Array.isArray(raw) ? (raw as string[]) : undefined;
  }, [data.config?.exposedOutputChannels]);
  const streamPorts = useModuleStreamPorts(id, data.moduleType, exposedOutputChannels);
  const requiredSetupFields = requiredModuleSetupFields(data.moduleType);
  const [setupDraft, setSetupDraft] = useState<ModuleSetupDraft>({
    ...EMPTY_MODULE_SETUP_DRAFT,
    topicSectors: data.topicSectors.join(', '),
  });
  const [setupState, setSetupState] = useState({
    topicSectors: data.topicSectors,
    capitalAllocationRef: data.capitalAllocationRef,
    targetExitRef: data.targetExitRef,
  });
  const [setupError, setSetupError] = useState<string | null>(null);
  const [savingSetup, setSavingSetup] = useState(false);
  const [restoringTopic, setRestoringTopic] = useState(false);
  const [topicOverridden, setTopicOverridden] = useState(Boolean(data.topicSectorsOverridden));
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>(data.config ?? {});
  const [localTypeContext, setLocalTypeContext] = useState(data.typeContext);
  const missingSetup = missingModuleSetupFields(data.moduleType, setupState);
  const usesTypeContext = moduleUsesTypeContext(data.moduleType);
  const setupFieldsForCard = usesTypeContext
    ? requiredSetupFields.filter((field) => field !== 'topic_sector')
    : requiredSetupFields;

  useEffect(() => {
    setSetupDraft({
      ...EMPTY_MODULE_SETUP_DRAFT,
      topicSectors: data.topicSectors.join(', '),
    });
    setSetupState({
      topicSectors: data.topicSectors,
      capitalAllocationRef: data.capitalAllocationRef,
      targetExitRef: data.targetExitRef,
    });
    setTopicOverridden(Boolean(data.topicSectorsOverridden));
    setLocalConfig(data.config ?? {});
    setLocalTypeContext(data.typeContext);
  }, [
    data.capitalAllocationRef,
    data.targetExitRef,
    data.topicSectors,
    data.topicSectorsOverridden,
    data.moduleType,
    data.config,
    data.typeContext,
  ]);

  async function saveSetup() {
    setSavingSetup(true);
    setSetupError(null);
    try {
      const { module } = await api<{
        module: {
          topicSectors: string[];
          capitalAllocationRef: string | null;
          targetExitRef: string | null;
          topicSectorsOverridden: boolean;
          engineInstanceId: string | null;
        };
      }>(`/api/companies/${data.companyId}/modules/${id}`, {
        method: 'PATCH',
        body: { setup: moduleSetupInputFromDraft(setupDraft, requiredSetupFields) },
      });
      const overridden =
        module.topicSectorsOverridden ||
        (Boolean(data.engineInstanceId) && Boolean(setupDraft.topicSectors.trim()));
      setSetupState(module);
      setTopicOverridden(overridden);
      setSetupDraft({
        ...EMPTY_MODULE_SETUP_DRAFT,
        topicSectors: module.topicSectors.join(', '),
      });
      window.dispatchEvent(
        new CustomEvent('hftr:module-setup-saved', {
          detail: {
            moduleId: id,
            topicSectors: module.topicSectors,
            capitalAllocationRef: module.capitalAllocationRef,
            targetExitRef: module.targetExitRef,
            topicSectorsOverridden: overridden,
            engineInstanceId: module.engineInstanceId ?? data.engineInstanceId,
          },
        }),
      );
    } catch {
      setSetupError('Setup could not be saved. Check the required values.');
    } finally {
      setSavingSetup(false);
    }
  }

  async function restoreEngineTopic() {
    if (!data.engineInstanceId) return;
    setRestoringTopic(true);
    setSetupError(null);
    try {
      const { module } = await api<{
        module: {
          topicSectors: string[];
          capitalAllocationRef: string | null;
          targetExitRef: string | null;
          topicSectorsOverridden: boolean;
        };
      }>(`/api/companies/${data.companyId}/modules/${id}`, {
        method: 'PATCH',
        body: { restoreEngineTopic: true },
      });
      setSetupState(module);
      setTopicOverridden(Boolean(module.topicSectorsOverridden));
      setSetupDraft({
        ...EMPTY_MODULE_SETUP_DRAFT,
        topicSectors: module.topicSectors.join(', '),
      });
      window.dispatchEvent(
        new CustomEvent('hftr:module-setup-saved', {
          detail: {
            moduleId: id,
            topicSectors: module.topicSectors,
            capitalAllocationRef: module.capitalAllocationRef,
            targetExitRef: module.targetExitRef,
            topicSectorsOverridden: module.topicSectorsOverridden,
          },
        }),
      );
      window.dispatchEvent(
        new CustomEvent('hftr:module-topic-restored', {
          detail: {
            moduleId: id,
            topicSectors: module.topicSectors,
            topicSectorsOverridden: module.topicSectorsOverridden,
          },
        }),
      );
    } catch {
      setSetupError('Could not restore the engine topic.');
    } finally {
      setRestoringTopic(false);
    }
  }

  const budgetHeld = (data.budgetQueuedJobs ?? 0) > 0;
  const statusLine =
    data.moduleType === 'display' && data.configSnippet
      ? data.configSnippet
      : (data.statusText ?? data.status);

  const familyLabel = FAMILY_LABELS[visual.family];
  const subtypeChip = data.subtypeChip?.trim() || null;
  const borderWidth = visual.borderStyle === 'double' ? 3 : visual.shape ? 1.5 : 1;
  const shaped = Boolean(visual.shape);

  return (
    <div className="relative" style={{ width: CARD_WIDTH_PX }}>
      {data.moduleType === 'math' ? (
        <MathPortBuses inbound={streamPorts.inbound} outbound={streamPorts.outbound} />
      ) : (
        <NodePortBuses
          moduleType={data.moduleType}
          inbound={streamPorts.inbound}
          outbound={streamPorts.outbound}
          config={data.config ?? null}
        />
      )}

      <div
        className={`relative overflow-hidden ${visual.radiusClass} border bg-[var(--color-surface-1)] px-2 py-1 shadow-lg transition-colors ${
          shaped ? 'min-h-[9rem]' : ''
        }`}
        style={{
          width: CARD_WIDTH_PX,
          borderStyle: visual.borderStyle,
          borderWidth,
          borderColor: selected ? visual.hue : shaped ? `${visual.hue}1c` : 'var(--color-line)',
          boxShadow: selected
            ? `0 0 0 1px ${visual.hue}, 0 8px 24px ${visual.hue}18`
            : shaped
              ? `0 4px 14px rgba(0,0,0,0.28), inset 0 0 0 1px ${visual.hue}06`
              : undefined,
          backgroundImage: `linear-gradient(${visual.wash}, ${visual.wash}), linear-gradient(var(--color-surface-1), var(--color-surface-1))`,
        }}
      >
        <FamilyShapeChrome shape={visual.shape} hue={visual.hue} selected={selected} />

        {/* Family accent — skipped when silhouette chrome already frames the card. */}
        {!shaped && visual.accent === 'bar' && (
          <span
            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-sm"
            style={{ background: visual.hue }}
            aria-hidden
          />
        )}
        {!shaped && visual.accent === 'stripe' && (
          <span
            className="pointer-events-none absolute inset-x-0 top-0 h-1 opacity-80"
            style={{
              background: `repeating-linear-gradient(90deg, ${visual.hue} 0 6px, transparent 6px 10px)`,
            }}
            aria-hidden
          />
        )}
        {!shaped && visual.accent === 'rail' && (
          <span
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-1.5"
            style={{
              background: `linear-gradient(180deg, ${visual.hue}, transparent)`,
              opacity: 0.55,
            }}
            aria-hidden
          />
        )}

        <div className="relative z-[1]">
          <div className="mb-0.5 flex items-center justify-between gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <span
                className="shrink-0 rounded px-1 py-px text-[7px] uppercase tracking-wider"
                style={{
                  color: visual.hue,
                  border: `1px solid ${visual.hue}66`,
                  background: `${visual.hue}14`,
                }}
              >
                {familyLabel}
              </span>
              <span className="text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                {visual.label}
              </span>
              {subtypeChip && (
                <span
                  className="max-w-[6.5rem] truncate rounded border border-[var(--color-line)] px-1 py-px text-[7px] text-[var(--color-ink-dim)]"
                  title={subtypeChip}
                >
                  {subtypeChip}
                </span>
              )}
            </div>
            <button
              type="button"
              className="nodrag shrink-0 rounded border border-[var(--color-line)] p-0.5 text-[var(--color-ink-faint)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              aria-label="Open process detail"
              title="Process"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('hftr:open-process-modal', {
                    detail: { moduleId: id },
                  }),
                );
              }}
            >
              <Layers size={10} aria-hidden />
            </button>
          </div>

          <div className="min-w-0">
            {(() => {
              const { primary, connectionRefs } = splitCompactModuleName(data.name);
              return (
                <>
                  <div
                    className="text-[11px] font-medium leading-tight text-[var(--color-ink)]"
                    title={data.name}
                  >
                    {primary}
                  </div>
                  {connectionRefs && (
                    <div
                      className="mt-px truncate text-[9px] leading-tight text-[var(--color-ink-faint)]"
                      title={connectionRefs}
                    >
                      {connectionRefs}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          <div className="mt-px flex items-center gap-1 text-[9px] text-[var(--color-ink-dim)]">
            {(data.activeJobs ?? 0) > 0 && (
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ background: visual.hue }}
              />
            )}
            {budgetHeld && (data.activeJobs ?? 0) === 0 && (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--color-warn)' }}
                aria-hidden
              />
            )}
            <span className={budgetHeld ? 'text-[var(--color-warn)]' : undefined}>
              {statusLine}
            </span>
          </div>

          {data.moduleType === 'clock' && (
            <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-[var(--color-ink-dim)]">
              <span className="truncate">
                {typeof localConfig.displayMode === 'string' ? localConfig.displayMode : 'session'}{' '}
                · now
              </span>
              {typeof localConfig.timezone === 'string' && localConfig.timezone.trim() ? (
                <span
                  className="shrink-0 truncate rounded border border-[var(--color-line)] px-1 py-px text-[7px] text-[var(--color-ink-faint)]"
                  title={localConfig.timezone}
                >
                  {localConfig.timezone}
                </span>
              ) : null}
            </div>
          )}

          {data.moduleType === 'time' && (
            <div className="mt-0.5 truncate text-[9px] text-[var(--color-ink-dim)]">
              {typeof localConfig.transform === 'string'
                ? localConfig.transform.replace(/_/g, ' ')
                : 'session window'}
              {typeof localConfig.descriptor === 'string' && localConfig.descriptor.trim()
                ? ` · ${localConfig.descriptor.trim()}`
                : ''}
            </div>
          )}

          {usesTypeContext && (
            <ModuleContextPanel
              companyId={data.companyId}
              moduleId={id}
              moduleType={data.moduleType}
              config={localConfig}
              typeContext={localTypeContext}
              topicSectors={setupState.topicSectors}
              topicOverridden={topicOverridden}
              engineInstanceId={data.engineInstanceId}
              onTopicSectorsChange={(sectors) => {
                setSetupState((prev) => ({ ...prev, topicSectors: sectors }));
                setSetupDraft((prev) => ({ ...prev, topicSectors: sectors.join(', ') }));
              }}
              onConfigChange={(config) => setLocalConfig(config)}
              onRestoreEngineTopic={() => void restoreEngineTopic()}
              restoringTopic={restoringTopic}
            />
          )}

          {setupFieldsForCard.length > 0 && (
            <div className="nodrag nowheel mt-1.5 border-t border-[var(--color-line)] pt-1.5">
              {!usesTypeContext && data.engineInstanceId && topicOverridden && (
                <button
                  type="button"
                  disabled={restoringTopic}
                  onClick={() => void restoreEngineTopic()}
                  className="mb-2 w-full rounded border border-[var(--color-accent)]/60 px-2 py-1 text-[10px] text-[var(--color-accent)] disabled:opacity-50"
                >
                  {restoringTopic ? 'Restoring…' : 'Use engine topic'}
                </button>
              )}
              <ModuleSetupFields
                requiredFields={setupFieldsForCard}
                missingFields={missingSetup.filter((f) => setupFieldsForCard.includes(f))}
                draft={setupDraft}
                onChange={setSetupDraft}
                compact
              />
              <button
                type="button"
                disabled={savingSetup}
                onClick={() => void saveSetup()}
                className="mt-2 w-full rounded border border-[var(--color-accent)] px-2 py-1 text-[10px] text-[var(--color-accent)] disabled:opacity-50"
              >
                {savingSetup ? 'Saving…' : 'Save setup'}
              </button>
              {setupError && (
                <p className="mt-1 text-[9px] text-[var(--color-block)]">{setupError}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {data.moduleType === 'trend' && localTypeContext?.kind === 'trend' && (
        <TrendListChrome
          trends={localTypeContext.trends}
          maxActiveTrends={localTypeContext.maxActiveTrends}
        />
      )}

      {(data.attachedMathTools?.length ?? 0) > 0 && (
        <div className="nodrag mt-1.5 space-y-1">
          {data.attachedMathTools!.map((tool) => (
            <div
              key={tool.id}
              className="flex items-center gap-2 rounded-md border border-dashed bg-[var(--color-surface-0)]/80 px-2.5 py-1"
              style={{
                width: CARD_WIDTH_PX,
                borderColor: `${MODULE_VISUALS.math.hue}80`,
              }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: MODULE_VISUALS.math.hue }}
              />
              <span className="text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                Math tool
              </span>
              <span className="min-w-0 truncate text-[10px] text-[var(--color-ink-dim)]">
                {tool.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
