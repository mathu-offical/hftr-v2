'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { processLayersForModule, type ModuleType } from '@hftr/contracts';
import { api } from '@/lib/client';
import {
  composeLayerQueueStatusText,
  firstQueueErrorSnippet,
  partitionJobsByLayer,
  type ModuleJobSummaryRow,
} from './module-process-job-status';
import type { ModuleCanvasStatusProjection } from './types';
import { MODULE_VISUALS } from './types';

const MANUAL_CONTROL_TYPES = new Set<ModuleType>(['research', 'librarian', 'trend', 'trading']);
const STATUS_POLL_MS = 8000;

export function ModuleProcessDetailModal(props: {
  companyId: string;
  moduleId: string;
  moduleType: ModuleType;
  moduleName: string;
  onClose: () => void;
}) {
  const layers = processLayersForModule(props.moduleType);
  const visual = MODULE_VISUALS[props.moduleType];
  const supportsManualControl = MANUAL_CONTROL_TYPES.has(props.moduleType);

  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moduleStatus, setModuleStatus] = useState<ModuleCanvasStatusProjection | null>(null);
  const [moduleJobs, setModuleJobs] = useState<ModuleJobSummaryRow[]>([]);

  const { byLayer, unmapped } = useMemo(
    () => partitionJobsByLayer(moduleJobs, layers),
    [moduleJobs, layers],
  );
  const queueError = firstQueueErrorSnippet(unmapped.length > 0 ? unmapped : moduleJobs);

  useEffect(() => {
    let stopped = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const mod = await api<{ module: { config: Record<string, unknown> } }>(
          `/api/companies/${props.companyId}/modules/${props.moduleId}`,
        );
        if (!stopped) setConfig(mod.module.config ?? {});
      } catch {
        if (!stopped) setError('Could not load module process settings.');
      } finally {
        if (!stopped) setLoading(false);
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, [props.companyId, props.moduleId]);

  useEffect(() => {
    let stopped = false;

    async function pollStatus() {
      try {
        const [canvas, summary] = await Promise.all([
          api<{ modules: ModuleCanvasStatusProjection[] }>(
            `/api/companies/${props.companyId}/canvas`,
          ),
          api<{ jobs: ModuleJobSummaryRow[] }>(
            `/api/companies/${props.companyId}/modules/${props.moduleId}/jobs/summary`,
          ),
        ]);
        if (stopped) return;
        const projection = canvas.modules.find((row) => row.moduleId === props.moduleId) ?? null;
        setModuleStatus(projection);
        setModuleJobs(summary.jobs);
      } catch {
        // transient; next poll retries
      }
    }

    void pollStatus();
    const interval = setInterval(pollStatus, STATUS_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [props.companyId, props.moduleId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) props.onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props, saving]);

  async function setManualControl(enabled: boolean) {
    if (!config) return;
    const next = { ...config, manualControl: enabled };
    const prev = config;
    setConfig(next);
    setSaving(true);
    setError(null);
    try {
      await api(`/api/companies/${props.companyId}/modules/${props.moduleId}`, {
        method: 'PATCH',
        body: { config: next },
      });
    } catch {
      setConfig(prev);
      setError('Manual control update failed.');
    } finally {
      setSaving(false);
    }
  }

  const manualControl = Boolean(config?.manualControl);
  const headerStatus = moduleStatus?.statusText ?? 'idle';
  const showQueueStrip = unmapped.length > 0 || (moduleJobs.length > 0 && byLayer.size === 0);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!saving) props.onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="module-process-title"
        className="flex max-h-[min(32rem,90vh)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: visual.hue }} />
              <span className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                {visual.label} process
              </span>
            </div>
            <h2
              id="module-process-title"
              className="mt-1 truncate text-sm font-medium text-[var(--color-ink)]"
            >
              {props.moduleName}
            </h2>
            <p
              className="mt-1 text-[11px] text-[var(--color-ink-dim)]"
              aria-live="polite"
              aria-atomic="true"
            >
              {headerStatus}
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            disabled={saving}
            aria-label="Close process detail"
            className="shrink-0 rounded p-1 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        {showQueueStrip && (
          <div className="border-b border-[var(--color-line)] px-4 py-2">
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">
              Queue
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-dim)]">
              {unmapped.length > 0
                ? unmapped.map((job) => `${job.kind} · ${job.status}`).join(' · ')
                : moduleJobs.map((job) => `${job.kind} · ${job.status}`).join(' · ')}
            </p>
            {queueError && (
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
                Last error: {queueError}
              </p>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="text-xs text-[var(--color-ink-faint)]">Loading process layers…</p>
          ) : (
            <ul className="space-y-3">
              {layers.map((layer) => {
                const layerJobs = byLayer.get(layer.id) ?? [];
                const layerStatus = composeLayerQueueStatusText(layerJobs);
                return (
                  <li
                    key={layer.id}
                    className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-[var(--color-ink)]">
                        {layer.label}
                      </span>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[10px] text-[var(--color-ink-dim)]">
                          {layerStatus}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${
                            layer.tunable
                              ? 'border border-[var(--color-accent)]/50 text-[var(--color-accent)]'
                              : 'border border-[var(--color-line)] text-[var(--color-ink-faint)]'
                          }`}
                        >
                          {layer.tunable ? 'Tunable' : 'Observe only'}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
                      {layer.description}
                    </p>
                    {layerJobs.length > 0 && (
                      <p className="mt-2 text-[10px] text-[var(--color-ink-faint)]">
                        Jobs: {layerJobs.map((job) => job.kind).join(' · ')}
                      </p>
                    )}
                    {layer.v1Refs.length > 0 && (
                      <p className="mt-2 text-[10px] text-[var(--color-ink-faint)]">
                        v1 refs: {layer.v1Refs.join(' · ')}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {supportsManualControl && !loading && (
          <div className="border-t border-[var(--color-line)] px-4 py-3">
            <label className="flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--color-ink-dim)]">Manual control</span>
              <input
                type="checkbox"
                checked={manualControl}
                disabled={saving || !config}
                onChange={(e) => void setManualControl(e.target.checked)}
                aria-label="Manual control of in-envelope levers"
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
            </label>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-ink-faint)]">
              When enabled, you own deeper lever picks inside immutable envelopes. LLM defaults
              apply when off.
            </p>
          </div>
        )}

        {error && (
          <p className="border-t border-[var(--color-line)] px-4 py-2 text-xs text-[var(--color-block)]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
