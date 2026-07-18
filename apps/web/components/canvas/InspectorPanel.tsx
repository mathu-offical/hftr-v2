'use client';

import { useEffect, useState } from 'react';
import type { ModuleStatus } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import type { ModuleNameUpdate } from '@/lib/module-generated-name';
import {
  DisplayConfigForm,
  LibrarianConfigForm,
  LibraryConfigForm,
  LiveApiConfigForm,
  MathConfigForm,
  ResearchConfigForm,
  TradingConfigForm,
  TrendConfigForm,
  TrendScanForm,
  WatchlistForm,
} from './ModuleControls';
import { PaperTradeForm } from './PaperTradeForm';
import { MODULE_VISUALS, type CanvasModule } from './types';

const STATUS_OPTIONS: ModuleStatus[] = ['draft', 'active', 'paused'];

type ModulePatch = Partial<
  Pick<CanvasModule, 'name' | 'status' | 'generatedNameBase' | 'nameCustomized'>
>;

/**
 * Floating inspector card for the selected module (layered over the canvas,
 * top-right): rename, status, per-type controls, delete.
 */
export function InspectorPanel(props: {
  companyId: string;
  module: CanvasModule;
  onUpdated: (id: string, patch: ModulePatch) => void;
  onDeleted: (id: string, renamedModules?: readonly ModuleNameUpdate[]) => void;
  onClose: () => void;
  onOpenProcess?: () => void;
}) {
  const { module: mod } = props;
  const [name, setName] = useState(mod.name);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoringTopic, setRestoringTopic] = useState(false);
  const visual = MODULE_VISUALS[mod.type];
  const isMath = mod.type === 'math';

  useEffect(() => {
    setName(mod.name);
    setError(null);
  }, [mod.id, mod.name]);

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
            disabled={isMath}
            maxLength={80}
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-60"
          />
        </label>
        <p className="text-[10px] text-[var(--color-ink-faint)]">
          {mod.nameCustomized ? (
            <>Custom name · function label: {mod.generatedNameBase}</>
          ) : (
            <>Generated compact label · function: {mod.generatedNameBase} · focus + connection refs</>
          )}
        </p>
        {mod.nameCustomized && !isMath && (
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

      {(mod.type === 'holding_fund' || mod.type === 'fund_router') && (
        <p className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] p-2 text-xs leading-relaxed text-[var(--color-ink-faint)]">
          Visible paper topology only. This module does not move funds yet; future transfers must
          resolve through ValueRefs, the deterministic Math calculator, approval policy, and the
          immutable ledger.
        </p>
      )}

      {isMath ? (
        <p className="text-xs leading-relaxed text-[var(--color-ink-faint)]">
          The company Math hub audits every number and timestamp. It is created with the company and
          cannot be deleted.
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
