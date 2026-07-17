'use client';

import { memo, useEffect, useState } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import {
  handleIdForLink,
  missingModuleSetupFields,
  moduleLinkPorts,
  requiredModuleSetupFields,
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
import { LINK_PORT_VISUALS, MODULE_VISUALS } from './types';

export type ModuleNodeData = {
  name: string;
  generatedNameBase: string;
  nameCustomized: boolean;
  moduleType: ModuleType;
  status: ModuleStatus;
  /** Server-composed text-first status projection line (T1.4). */
  statusText?: string;
  activeJobs?: number;
  /** Optional config summary for inline status (e.g. display kind). */
  configSnippet?: string;
  companyId: string;
  topicSectors: string[];
  capitalAllocationRef: string | null;
  targetExitRef: string | null;
  missingSetupFields: ModuleSetupField[];
  engineInstanceId: string | null;
  topicSectorsOverridden: boolean;
  attachedMathTools?: { id: string; name: string }[];
};

export type ModuleFlowNode = Node<ModuleNodeData, 'module'>;

const CARD_WIDTH_PX = 280;

function portTopPercent(index: number, total: number): string {
  if (total <= 1) return '50%';
  return `${((index + 1) / (total + 1)) * 100}%`;
}

function SettingsIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

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
  const ports = moduleLinkPorts(data.moduleType);
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
  const missingSetup = missingModuleSetupFields(data.moduleType, setupState);

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
  }, [
    data.capitalAllocationRef,
    data.targetExitRef,
    data.topicSectors,
    data.topicSectorsOverridden,
    data.moduleType,
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

  const statusLine =
    data.moduleType === 'display' && data.configSnippet
      ? data.configSnippet
      : (data.statusText ?? data.status);

  return (
    <div className="relative" style={{ width: CARD_WIDTH_PX }}>
      {ports.inbound.map((kind, index) => {
        const handleId = handleIdForLink(kind, 'in');
        const port = LINK_PORT_VISUALS[kind];
        const top = portTopPercent(index, ports.inbound.length);
        return (
          <div key={handleId}>
            <Handle
              id={handleId}
              type="target"
              position={Position.Left}
              className="hftr-handle"
              aria-label={`${port.label} input`}
              style={{
                top,
                width: 8,
                height: 8,
                background: port.color,
                border: '1px solid var(--color-surface-0)',
              }}
            />
            <span
              className="pointer-events-none absolute -left-[4.5rem] w-16 text-right text-[8px] leading-tight text-[var(--color-ink-faint)]"
              style={{ top, transform: 'translateY(-50%)' }}
              aria-hidden
            >
              {port.label}
            </span>
          </div>
        );
      })}

      {ports.outbound.map((kind, index) => {
        const handleId = handleIdForLink(kind, 'out');
        const port = LINK_PORT_VISUALS[kind];
        const top = portTopPercent(index, ports.outbound.length);
        return (
          <div key={handleId}>
            <Handle
              id={handleId}
              type="source"
              position={Position.Right}
              className="hftr-handle"
              aria-label={`${port.label} output`}
              style={{
                top,
                width: 8,
                height: 8,
                background: port.color,
                border: '1px solid var(--color-surface-0)',
              }}
            />
            <span
              className="pointer-events-none absolute -right-[4.5rem] w-16 text-left text-[8px] leading-tight text-[var(--color-ink-faint)]"
              style={{ top, transform: 'translateY(-50%)' }}
              aria-hidden
            >
              {port.label}
            </span>
          </div>
        );
      })}

      <div
        className="rounded-lg border bg-[var(--color-surface-1)] px-3.5 py-2.5 shadow-lg transition-colors"
        style={{
          width: CARD_WIDTH_PX,
          borderColor: selected ? visual.hue : 'var(--color-line)',
          boxShadow: selected ? `0 0 0 1px ${visual.hue}` : undefined,
        }}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: visual.hue }} />
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              {visual.label}
            </span>
          </div>
          <span
            aria-hidden
            className="shrink-0 rounded p-0.5 text-[var(--color-ink-faint)] opacity-50"
          >
            <SettingsIcon />
          </span>
        </div>

        <div className="text-sm font-medium leading-snug text-[var(--color-ink)]">{data.name}</div>

        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--color-ink-dim)]">
          {(data.activeJobs ?? 0) > 0 && (
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ background: visual.hue }}
            />
          )}
          <span>{statusLine}</span>
        </div>

        {requiredSetupFields.length > 0 && (
          <div className="nodrag nowheel mt-2 border-t border-[var(--color-line)] pt-2">
            {data.engineInstanceId && topicOverridden && (
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
              requiredFields={requiredSetupFields}
              missingFields={missingSetup}
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

      {(data.attachedMathTools?.length ?? 0) > 0 && (
        <div className="nodrag mt-1.5 space-y-1">
          {data.attachedMathTools!.map((tool) => (
            <div
              key={tool.id}
              className="flex items-center gap-2 rounded-md border border-dashed border-[#bb9af7]/50 bg-[var(--color-surface-0)]/80 px-2.5 py-1.5"
              style={{ width: CARD_WIDTH_PX }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: '#bb9af7' }}
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
