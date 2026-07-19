'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModuleStatus, OptionAnchorPosition, OptionAnchorSpec } from '@hftr/contracts';
import {
  missingModuleSetupFields,
  requiredModuleSetupFields,
} from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import type { ModuleNameUpdate } from '@/lib/module-generated-name';
import {
  AnalyzerConfigForm,
  ClockConfigForm,
  DisplayConfigForm,
  LibrarianConfigForm,
  LibraryConfigForm,
  LiveApiConfigForm,
  MathConfigForm,
  ResearchConfigForm,
  TimeConfigForm,
  TradingConfigForm,
  TrendConfigForm,
  TrendScanForm,
  WatchlistForm,
} from './ModuleControls';
import { PaperTradeForm } from './PaperTradeForm';
import { SchemaConfigForm } from './SchemaConfigForm';
import { LeverTreeSection } from './LeverTreeSection';
import {
  EMPTY_MODULE_SETUP_DRAFT,
  ModuleSetupFields,
  moduleSetupInputFromDraft,
  type ModuleSetupDraft,
} from './ModuleSetupFields';
import { MODULE_VISUALS, type CanvasModule } from './types';

const STATUS_OPTIONS: ModuleStatus[] = ['draft', 'active', 'paused'];

type ModulePatch = Partial<
  Pick<
    CanvasModule,
    | 'name'
    | 'status'
    | 'generatedNameBase'
    | 'nameCustomized'
    | 'config'
    | 'topicSectors'
    | 'capitalAllocationRef'
    | 'targetExitRef'
    | 'missingSetupFields'
    | 'topicSectorsOverridden'
  >
>;

function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
): (...args: Args) => void {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  fnRef.current = fn;

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return useCallback(
    (...args: Args) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay],
  );
}

const LEVER_TREE_MODULE_TYPES: ReadonlySet<CanvasModule['type']> = new Set([
  'trading',
  'trend',
  'policy',
]);

/**
 * Floating inspector card for the selected module (layered over the canvas,
 * top-right): rename, status, per-type controls, delete.
 */
export function InspectorPanel(props: {
  companyId: string;
  module: CanvasModule;
  anchors?: OptionAnchorSpec[];
  anchorPositions?: Record<string, OptionAnchorPosition>;
  onUpdated: (id: string, patch: ModulePatch) => void;
  onDeleted: (id: string, renamedModules?: readonly ModuleNameUpdate[]) => void;
  onClose: () => void;
  onOpenProcess?: () => void;
  onAnchorPositionChange?: (anchorId: string, position: OptionAnchorPosition) => void;
}) {
  const { module: mod } = props;
  const [name, setName] = useState(mod.name);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoringTopic, setRestoringTopic] = useState(false);
  const [setupDraft, setSetupDraft] = useState<ModuleSetupDraft>({
    ...EMPTY_MODULE_SETUP_DRAFT,
    topicSectors: mod.topicSectors.join(', '),
  });
  const [setupState, setSetupState] = useState({
    topicSectors: mod.topicSectors,
    capitalAllocationRef: mod.capitalAllocationRef,
    targetExitRef: mod.targetExitRef,
  });
  const [setupError, setSetupError] = useState<string | null>(null);
  const [savingSetup, setSavingSetup] = useState(false);
  const visual = MODULE_VISUALS[mod.type];
  const isProtectedSingleton = mod.type === 'math' || mod.type === 'clock';
  const requiredSetupFields = requiredModuleSetupFields(mod.type);
  const missingSetup = missingModuleSetupFields(mod.type, setupState);
  const moduleConfig = mod.config ?? {};
  const manualControl = moduleConfig.manualControl === true;

  useEffect(() => {
    setName(mod.name);
    setError(null);
    setSetupDraft({
      ...EMPTY_MODULE_SETUP_DRAFT,
      topicSectors: mod.topicSectors.join(', '),
    });
    setSetupState({
      topicSectors: mod.topicSectors,
      capitalAllocationRef: mod.capitalAllocationRef,
      targetExitRef: mod.targetExitRef,
    });
    setSetupError(null);
  }, [
    mod.capitalAllocationRef,
    mod.id,
    mod.name,
    mod.targetExitRef,
    mod.topicSectors,
  ]);

  async function saveName() {
    if (name.trim() === mod.name || name.trim() === '') return;
    try {
      const { module } = await api<{
        module: {
          name: string;
          generatedNameBase: string;
          nameCustomized: boolean;
        };
      }>(`/api/companies/${props.companyId}/modules/${mod.id}`, {
        method: 'PATCH',
        body: { name: name.trim() },
      });
      props.onUpdated(mod.id, {
        name: module.name,
        generatedNameBase: module.generatedNameBase,
        nameCustomized: module.nameCustomized,
      });
      setName(module.name);
    } catch {
      setError('Rename failed.');
      setName(mod.name);
    }
  }

  async function restoreGeneratedName() {
    setRestoring(true);
    setError(null);
    try {
      const { module } = await api<{
        module: {
          name: string;
          generatedNameBase: string;
          nameCustomized: boolean;
        };
      }>(`/api/companies/${props.companyId}/modules/${mod.id}`, {
        method: 'PATCH',
        body: { restoreGeneratedName: true },
      });
      props.onUpdated(mod.id, {
        name: module.name,
        generatedNameBase: module.generatedNameBase,
        nameCustomized: module.nameCustomized,
      });
      setName(module.name);
    } catch {
      setError('Could not restore the generated name.');
    } finally {
      setRestoring(false);
    }
  }

  async function restoreEngineTopic() {
    if (!mod.engineInstanceId) return;
    setRestoringTopic(true);
    setError(null);
    try {
      const { module } = await api<{
        module: {
          topicSectors: string[];
          capitalAllocationRef: string | null;
          targetExitRef: string | null;
          topicSectorsOverridden: boolean;
        };
      }>(`/api/companies/${props.companyId}/modules/${mod.id}`, {
        method: 'PATCH',
        body: { restoreEngineTopic: true },
      });
      window.dispatchEvent(
        new CustomEvent('hftr:module-topic-restored', {
          detail: {
            moduleId: mod.id,
            topicSectors: module.topicSectors,
            topicSectorsOverridden: module.topicSectorsOverridden,
          },
        }),
      );
    } catch {
      setError('Could not restore the engine topic.');
    } finally {
      setRestoringTopic(false);
    }
  }

  async function setStatus(status: ModuleStatus) {
    try {
      await api(`/api/companies/${props.companyId}/modules/${mod.id}`, {
        method: 'PATCH',
        body: { status },
      });
      props.onUpdated(mod.id, { status });
      setError(null);
    } catch (err) {
      if (err instanceof RequestError && err.code === 'module_graph_incomplete') {
        const reasons = Array.isArray(err.details?.reasons)
          ? (err.details.reasons as string[])
          : [];
        setError(
          reasons[0] ??
            'Module graph is incomplete — add required inbound links before activating.',
        );
        return;
      }
      if (err instanceof RequestError && err.code.startsWith('module_setup_incomplete')) {
        setError('Module setup is incomplete — fill required fields before activating.');
        return;
      }
      setError('Status change failed.');
    }
  }

  async function remove() {
    try {
      const response = await api<{ deleted: true; renamedModules: ModuleNameUpdate[] }>(
        `/api/companies/${props.companyId}/modules/${mod.id}`,
        { method: 'DELETE' },
      );
      props.onDeleted(mod.id, response.renamedModules);
    } catch (err) {
      setError(
        err instanceof RequestError && err.code === 'math_module_not_deletable'
          ? 'The Math module cannot be deleted.'
          : 'Delete failed.',
      );
    }
  }

  const saveSetup = useCallback(
    async (draft: ModuleSetupDraft) => {
      setSavingSetup(true);
      setSetupError(null);
      try {
        const { module } = await api<{
          module: {
            topicSectors: string[];
            capitalAllocationRef: string | null;
            targetExitRef: string | null;
            topicSectorsOverridden: boolean;
            missingSetupFields: CanvasModule['missingSetupFields'];
          };
        }>(`/api/companies/${props.companyId}/modules/${mod.id}`, {
          method: 'PATCH',
          body: { setup: moduleSetupInputFromDraft(draft, requiredSetupFields) },
        });
        const overridden =
          module.topicSectorsOverridden ||
          (Boolean(mod.engineInstanceId) && Boolean(draft.topicSectors.trim()));
        const nextState = {
          topicSectors: module.topicSectors,
          capitalAllocationRef: module.capitalAllocationRef,
          targetExitRef: module.targetExitRef,
        };
        setSetupState(nextState);
        props.onUpdated(mod.id, {
          topicSectors: module.topicSectors,
          capitalAllocationRef: module.capitalAllocationRef,
          targetExitRef: module.targetExitRef,
          missingSetupFields: module.missingSetupFields,
          topicSectorsOverridden: overridden,
        });
        window.dispatchEvent(
          new CustomEvent('hftr:module-setup-saved', {
            detail: {
              moduleId: mod.id,
              topicSectors: module.topicSectors,
              capitalAllocationRef: module.capitalAllocationRef,
              targetExitRef: module.targetExitRef,
              topicSectorsOverridden: overridden,
              engineInstanceId: mod.engineInstanceId,
            },
          }),
        );
      } catch {
        setSetupError('Setup could not be saved. Check the required values.');
      } finally {
        setSavingSetup(false);
      }
    },
    [mod.engineInstanceId, mod.id, props, requiredSetupFields],
  );

  const debouncedSaveSetup = useDebouncedCallback((draft: ModuleSetupDraft) => {
    void saveSetup(draft);
  }, 500);

  function handleSetupDraftChange(draft: ModuleSetupDraft) {
    setSetupDraft(draft);
    debouncedSaveSetup(draft);
  }

  return (
    <aside className="absolute right-4 top-4 z-20 flex max-h-[calc(100%-2rem)] w-72 flex-col gap-5 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)]/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: visual.hue }} />
          <span className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            {visual.label}
          </span>
        </div>
        <button
          onClick={props.onClose}
          className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          aria-label="Close inspector"
        >
          ×
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="block space-y-1.5">
          <span className="text-xs text-[var(--color-ink-dim)]">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            disabled={isProtectedSingleton}
            maxLength={80}
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-60"
          />
        </label>
        <p className="text-[10px] text-[var(--color-ink-faint)]">
          {mod.nameCustomized ? (
            <>Custom name · function label: {mod.generatedNameBase}</>
          ) : (
            <>
              Generated compact label · function: {mod.generatedNameBase} · focus + connection refs
            </>
          )}
        </p>
        {mod.nameCustomized && !isProtectedSingleton && (
          <button
            type="button"
            disabled={restoring}
            onClick={() => void restoreGeneratedName()}
            className="text-xs text-[var(--color-accent)] hover:underline disabled:opacity-50"
          >
            {restoring ? 'Restoring…' : 'Restore generated name'}
          </button>
        )}
        {mod.engineInstanceId && mod.topicSectorsOverridden && (
          <button
            type="button"
            disabled={restoringTopic}
            onClick={() => void restoreEngineTopic()}
            className="text-xs text-[var(--color-accent)] hover:underline disabled:opacity-50"
          >
            {restoringTopic ? 'Restoring…' : 'Use engine topic'}
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <span className="text-xs text-[var(--color-ink-dim)]">Status</span>
        <div className="flex gap-1.5">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                mod.status === s
                  ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                  : 'border-[var(--color-line)] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {props.onOpenProcess && (
        <button
          type="button"
          onClick={props.onOpenProcess}
          className="w-full rounded-md border border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          Process
        </button>
      )}

      {requiredSetupFields.length > 0 && (
        <div className="space-y-2 border-t border-[var(--color-line)] pt-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--color-ink-dim)]">Module setup</span>
            {savingSetup && (
              <span className="text-[10px] text-[var(--color-ink-faint)]">Saving…</span>
            )}
          </div>
          <ModuleSetupFields
            requiredFields={requiredSetupFields}
            missingFields={missingSetup}
            draft={setupDraft}
            onChange={handleSetupDraftChange}
            layout="stack"
            showLabels
          />
          {setupError && <p className="text-xs text-[var(--color-block)]">{setupError}</p>}
        </div>
      )}

      <SchemaConfigForm
        companyId={props.companyId}
        moduleId={mod.id}
        moduleType={mod.type}
        config={moduleConfig}
        onPatched={(config) => props.onUpdated(mod.id, { config })}
      />

      {LEVER_TREE_MODULE_TYPES.has(mod.type) && (
        <LeverTreeSection
          companyId={props.companyId}
          moduleId={mod.id}
          {...(mod.engineInstanceId ? { engineId: mod.engineInstanceId } : {})}
          anchors={props.anchors ?? []}
          {...(props.anchorPositions ? { positions: props.anchorPositions } : {})}
          manualControl={manualControl}
          {...(props.onAnchorPositionChange
            ? { onPositionChange: props.onAnchorPositionChange }
            : {})}
        />
      )}

      {mod.type === 'trading' && (
        <>
          <TradingConfigForm companyId={props.companyId} moduleId={mod.id} />
          <PaperTradeForm
            companyId={props.companyId}
            moduleId={mod.id}
            disabled={mod.status !== 'active'}
          />
          <WatchlistForm companyId={props.companyId} moduleId={mod.id} />
        </>
      )}

      {mod.type === 'trend' && (
        <>
          <TrendConfigForm companyId={props.companyId} moduleId={mod.id} />
          <TrendScanForm
            companyId={props.companyId}
            moduleId={mod.id}
            disabled={mod.status !== 'active'}
          />
          <WatchlistForm companyId={props.companyId} moduleId={mod.id} />
        </>
      )}

      {mod.type === 'display' && (
        <DisplayConfigForm companyId={props.companyId} moduleId={mod.id} />
      )}

      {mod.type === 'research' && (
        <ResearchConfigForm companyId={props.companyId} moduleId={mod.id} />
      )}

      {mod.type === 'librarian' && (
        <LibrarianConfigForm companyId={props.companyId} moduleId={mod.id} />
      )}

      {mod.type === 'library' && (
        <LibraryConfigForm companyId={props.companyId} moduleId={mod.id} />
      )}

      {mod.type === 'live_api' && (
        <LiveApiConfigForm companyId={props.companyId} moduleId={mod.id} />
      )}

      {mod.type === 'math' && <MathConfigForm companyId={props.companyId} moduleId={mod.id} />}

      {mod.type === 'clock' && <ClockConfigForm companyId={props.companyId} moduleId={mod.id} />}
      {mod.type === 'analyzer' && (
        <AnalyzerConfigForm companyId={props.companyId} moduleId={mod.id} />
      )}

      {mod.type === 'time' && <TimeConfigForm companyId={props.companyId} moduleId={mod.id} />}

      {isProtectedSingleton ? (
        <p className="text-xs leading-relaxed text-[var(--color-ink-faint)]">
          {mod.type === 'clock'
            ? 'Master Clock is the company temporal authority (D-088). It is created with the company and cannot be deleted.'
            : 'The company Math hub audits every number and timestamp. It is created with the company and cannot be deleted.'}
        </p>
      ) : (
        <button
          onClick={() => void remove()}
          className="mt-auto rounded-md border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-block)] hover:border-[var(--color-block)]"
        >
          Delete module
        </button>
      )}

      {error && <p className="text-xs text-[var(--color-block)]">{error}</p>}
    </aside>
  );
}
