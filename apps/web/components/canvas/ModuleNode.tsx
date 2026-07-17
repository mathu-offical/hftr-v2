'use client';

import { useEffect, useState } from 'react';
import { Handle, type NodeProps, type Node } from '@xyflow/react';
import {
  missingModuleSetupFields,
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
import { HANDLE_SPEC, MODULE_VISUALS, type HandleGroup } from './types';

export type ModuleNodeData = {
  name: string;
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
};

export type ModuleFlowNode = Node<ModuleNodeData, 'module'>;

const HANDLE_GROUPS: HandleGroup[] = ['dataIn', 'dataOut', 'controlIn', 'toolsOut'];

/** Math is tool-access oriented; its data-plane handles read as secondary. */
const MATH_DEEMPHASIZED: ReadonlySet<HandleGroup> = new Set(['dataIn', 'dataOut']);

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
 * Canvas node: type-tinted card with text-first status (never color alone).
 * Handles follow the ui-spec node model — left data in, right data out,
 * top control in, bottom tools out — colored by the type they accept.
 */
export function ModuleNode({ id, data, selected }: NodeProps<ModuleFlowNode>) {
  const visual = MODULE_VISUALS[data.moduleType];
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
  }, [data.capitalAllocationRef, data.targetExitRef, data.topicSectors, data.moduleType]);

  async function saveSetup() {
    setSavingSetup(true);
    setSetupError(null);
    try {
      const { module } = await api<{
        module: {
          topicSectors: string[];
          capitalAllocationRef: string | null;
          targetExitRef: string | null;
        };
      }>(`/api/companies/${data.companyId}/modules/${id}`, {
        method: 'PATCH',
        body: { setup: moduleSetupInputFromDraft(setupDraft, requiredSetupFields) },
      });
      setSetupState(module);
      setSetupDraft({
        ...EMPTY_MODULE_SETUP_DRAFT,
        topicSectors: module.topicSectors.join(', '),
      });
      window.dispatchEvent(
        new CustomEvent('hftr:module-setup-saved', {
          detail: { moduleId: id, ...module },
        }),
      );
    } catch {
      setSetupError('Setup could not be saved. Check the required values.');
    } finally {
      setSavingSetup(false);
    }
  }
  const statusLine =
    data.moduleType === 'display' && data.configSnippet
      ? data.configSnippet
      : (data.statusText ?? data.status);
  return (
    <div
      className="group min-w-40 rounded-lg border bg-[var(--color-surface-1)] px-3.5 py-2.5 shadow-lg transition-colors"
      style={{
        borderColor: selected ? visual.hue : 'var(--color-line)',
        boxShadow: selected ? `0 0 0 1px ${visual.hue}` : undefined,
      }}
    >
      {HANDLE_GROUPS.map((group) => {
        const spec = HANDLE_SPEC[group];
        const deemphasized = data.moduleType === 'math' && MATH_DEEMPHASIZED.has(group);
        return (
          <Handle
            key={spec.id}
            id={spec.id}
            type={spec.type}
            position={spec.position}
            className="hftr-handle"
            style={{
              width: 8,
              height: 8,
              background: spec.color,
              border: '1px solid var(--color-surface-0)',
              opacity: deemphasized ? 0.35 : 1,
            }}
          />
        );
      })}
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: visual.hue }} />
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            {visual.label}
          </span>
        </div>
        <button
          type="button"
          aria-label="Module settings"
          className="shrink-0 rounded p-0.5 text-[var(--color-ink-faint)] opacity-50 transition-opacity hover:opacity-100 hover:text-[var(--color-ink-dim)]"
          tabIndex={-1}
        >
          <SettingsIcon />
        </button>
      </div>
      <div className="text-sm font-medium text-[var(--color-ink)]">{data.name}</div>
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
          {!selected ? (
            <div className="flex flex-wrap gap-1">
              {missingSetup.map((field) => (
                <span
                  key={field}
                  className="rounded-full border border-[var(--color-warn)] px-1.5 py-0.5 text-[9px] text-[var(--color-warn)]"
                >
                  Required · {field.replace('_', ' ')}
                </span>
              ))}
              {missingSetup.length === 0 && (
                <span className="rounded-full border border-[var(--color-ok)] px-1.5 py-0.5 text-[9px] text-[var(--color-ok)]">
                  Setup complete
                </span>
              )}
            </div>
          ) : (
            <div className="w-64 space-y-2">
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
                className="w-full rounded border border-[var(--color-accent)] px-2 py-1 text-[10px] text-[var(--color-accent)] disabled:opacity-50"
              >
                {savingSetup ? 'Saving…' : 'Save setup'}
              </button>
              {setupError && <p className="text-[9px] text-[var(--color-block)]">{setupError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
