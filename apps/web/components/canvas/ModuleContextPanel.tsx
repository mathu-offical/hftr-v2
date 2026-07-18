'use client';

import { useEffect, useState } from 'react';
import type { ModuleType } from '@hftr/contracts';
import { api } from '@/lib/client';
import type { ModuleTypeContextProjection } from './types';

const LIBRARY_CLASS_OPTIONS = [
  { value: 'seeded_mechanisms', label: 'Seeded mechanisms' },
  { value: 'topic_runtime', label: 'Topic runtime' },
  { value: 'market_history', label: 'Market history' },
  { value: 'runtime_market_cache', label: 'Runtime market cache' },
  { value: 'runtime_app_logs', label: 'Runtime app logs' },
  { value: 'specialty_evidence', label: 'Specialty evidence' },
  { value: 'master_graph', label: 'Master graph' },
] as const;

const TREND_POSTURE_OPTIONS = [
  { value: 'session_intraday', label: 'Session intraday' },
  { value: 'crypto_cross_cap', label: 'Crypto cross-cap' },
  { value: 'event_probability', label: 'Event probability' },
  { value: 'position_horizon', label: 'Position horizon' },
  { value: 'microstructure_swarm', label: 'Microstructure swarm' },
  { value: 'research_only', label: 'Research only' },
] as const;

const LIVE_VENUE_OPTIONS = [
  { value: 'alpaca', label: 'Alpaca' },
  { value: 'kalshi', label: 'Kalshi' },
  { value: 'polymarket', label: 'Polymarket' },
  { value: 'coinbase', label: 'Coinbase' },
  { value: 'paper_sim', label: 'Paper sim' },
] as const;

const CONTEXT_MODULE_TYPES: ReadonlySet<ModuleType> = new Set([
  'library',
  'research',
  'live_api',
  'trend',
]);

export function moduleUsesTypeContext(type: ModuleType): boolean {
  return CONTEXT_MODULE_TYPES.has(type);
}

function ScopeSeedRow(props: {
  label: string;
  topicSectors: string[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  showRestore?: boolean | undefined;
  onRestore?: (() => void) | undefined;
  restoring?: boolean | undefined;
}) {
  const seeded = props.topicSectors.length > 0;
  return (
    <div className="mt-1 space-y-0.5 border-t border-[var(--color-line)]/50 pt-1">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[7px] uppercase tracking-wider text-[var(--color-ink-faint)]">
          {props.label}
        </span>
        {seeded && (
          <span
            className="truncate text-[8px] text-[var(--color-ink-faint)]"
            title={props.topicSectors.join(', ')}
          >
            {props.topicSectors.join(', ')}
          </span>
        )}
      </div>
      <input
        type="text"
        value={props.draft}
        onChange={(e) => props.onDraftChange(e.target.value)}
        placeholder={seeded ? 'Override…' : 'Required scope seed'}
        className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-dim)] outline-none focus:border-[var(--color-accent)]"
      />
      <div className="flex gap-1">
        <button
          type="button"
          disabled={props.saving}
          onClick={props.onSave}
          className="flex-1 rounded border border-[var(--color-line)] px-1 py-0.5 text-[9px] text-[var(--color-ink-faint)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
        >
          {props.saving ? 'Saving…' : 'Save scope'}
        </button>
        {props.showRestore && props.onRestore && (
          <button
            type="button"
            disabled={props.restoring}
            onClick={props.onRestore}
            className="rounded border border-[var(--color-accent)]/50 px-1 py-0.5 text-[9px] text-[var(--color-accent)] disabled:opacity-50"
          >
            {props.restoring ? '…' : 'Engine'}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * D-077: type-relevant interactive card body. Cascaded engine topic is demoted
 * to a secondary scope/focus seed — not the primary identity of the card.
 */
export function ModuleContextPanel(props: {
  companyId: string;
  moduleId: string;
  moduleType: ModuleType;
  config: Record<string, unknown>;
  typeContext: ModuleTypeContextProjection | undefined;
  topicSectors: string[];
  topicOverridden: boolean;
  engineInstanceId: string | null;
  onTopicSectorsChange: (sectors: string[]) => void;
  onConfigChange: (config: Record<string, unknown>) => void;
  onRestoreEngineTopic?: (() => void) | undefined;
  restoringTopic?: boolean | undefined;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopeDraft, setScopeDraft] = useState(props.topicSectors.join(', '));
  const [instrumentsDraft, setInstrumentsDraft] = useState('');
  const [maxTrendsDraft, setMaxTrendsDraft] = useState('10');
  const [cadenceDraft, setCadenceDraft] = useState('30');
  const [pollDraft, setPollDraft] = useState('60');
  const [feedDraft, setFeedDraft] = useState('iex_free');

  useEffect(() => {
    setScopeDraft(props.topicSectors.join(', '));
  }, [props.topicSectors]);

  useEffect(() => {
    const ctx = props.typeContext;
    if (ctx?.kind === 'live_api') {
      setInstrumentsDraft(ctx.instruments.join(', '));
      setPollDraft(String(ctx.pollSeconds ?? 60));
      setFeedDraft(ctx.feedClass ?? 'iex_free');
    } else if (props.moduleType === 'live_api') {
      const instruments = Array.isArray(props.config.instruments)
        ? props.config.instruments.filter((s): s is string => typeof s === 'string')
        : [];
      setInstrumentsDraft(instruments.join(', '));
      setPollDraft(
        String(typeof props.config.pollSeconds === 'number' ? props.config.pollSeconds : 60),
      );
      setFeedDraft(
        typeof props.config.feedClass === 'string' ? props.config.feedClass : 'iex_free',
      );
    }
    if (ctx?.kind === 'trend') {
      setMaxTrendsDraft(String(ctx.maxActiveTrends));
      setCadenceDraft(String(ctx.cadenceMinutes ?? 30));
    } else if (props.moduleType === 'trend') {
      setMaxTrendsDraft(
        String(
          typeof props.config.maxActiveTrends === 'number' ? props.config.maxActiveTrends : 10,
        ),
      );
      setCadenceDraft(
        String(typeof props.config.cadenceMinutes === 'number' ? props.config.cadenceMinutes : 30),
      );
    }
  }, [props.typeContext, props.config, props.moduleType]);

  async function patchConfig(next: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const { module } = await api<{ module: { config: Record<string, unknown> } }>(
        `/api/companies/${props.companyId}/modules/${props.moduleId}`,
        { method: 'PATCH', body: { config: next } },
      );
      props.onConfigChange(module.config);
      window.dispatchEvent(
        new CustomEvent('hftr:module-config-saved', {
          detail: { moduleId: props.moduleId, config: module.config },
        }),
      );
    } catch {
      setError('Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function saveScope() {
    const sectors = scopeDraft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setSaving(true);
    setError(null);
    try {
      const { module } = await api<{
        module: { topicSectors: string[]; topicSectorsOverridden: boolean };
      }>(`/api/companies/${props.companyId}/modules/${props.moduleId}`, {
        method: 'PATCH',
        body: { setup: { topicSectors: sectors } },
      });
      props.onTopicSectorsChange(module.topicSectors);
      window.dispatchEvent(
        new CustomEvent('hftr:module-setup-saved', {
          detail: {
            moduleId: props.moduleId,
            topicSectors: module.topicSectors,
            topicSectorsOverridden: module.topicSectorsOverridden,
          },
        }),
      );
    } catch {
      setError('Could not save scope.');
    } finally {
      setSaving(false);
    }
  }

  const ctx = props.typeContext;
  const showRestore = Boolean(props.engineInstanceId && props.topicOverridden);

  if (props.moduleType === 'library') {
    const libraryClass =
      (ctx?.kind === 'library' ? ctx.libraryClass : null) ??
      (typeof props.config.libraryClass === 'string' ? props.config.libraryClass : 'topic_runtime');
    const name = ctx?.kind === 'library' ? ctx.name : null;
    const conceptCount = ctx?.kind === 'library' ? ctx.conceptCount : 0;
    return (
      <div className="nodrag nowheel mt-1.5 space-y-1.5 border-t border-[var(--color-line)] pt-1.5">
        <label className="block space-y-0.5">
          <span className="text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Library class
          </span>
          <select
            value={libraryClass}
            disabled={saving}
            onChange={(e) =>
              void patchConfig({
                ...props.config,
                libraryClass: e.target.value,
                topicScope: props.config.topicScope ?? props.topicSectors[0] ?? 'general',
              })
            }
            className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1.5 py-1 text-[10px] outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
          >
            {LIBRARY_CLASS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <div className="text-[10px] text-[var(--color-ink-dim)]">
          {name ? (
            <>
              <span className="text-[var(--color-ink)]">{name}</span>
              <span className="text-[var(--color-ink-faint)]"> · {conceptCount} concepts</span>
            </>
          ) : (
            <span className="text-[var(--color-ink-faint)]">No linked library entity</span>
          )}
        </div>
        <ScopeSeedRow
          label="Scope"
          topicSectors={props.topicSectors}
          draft={scopeDraft}
          onDraftChange={setScopeDraft}
          onSave={() => void saveScope()}
          saving={saving}
          showRestore={showRestore}
          onRestore={props.onRestoreEngineTopic}
          restoring={props.restoringTopic}
        />
        {error && <p className="text-[9px] text-[var(--color-block)]">{error}</p>}
      </div>
    );
  }

  if (props.moduleType === 'research') {
    const topics = ctx?.kind === 'research' ? ctx.topics : [];
    const targets = ctx?.kind === 'research' ? ctx.targetLibraries : [];
    const subtype =
      (ctx?.kind === 'research' ? ctx.researchSubtype : null) ??
      (typeof props.config.researchSubtype === 'string' ? props.config.researchSubtype : null);
    const cadence =
      (ctx?.kind === 'research' ? ctx.cadenceMinutes : null) ??
      (typeof props.config.cadenceMinutes === 'number' ? props.config.cadenceMinutes : null);
    return (
      <div className="nodrag nowheel mt-1.5 space-y-1.5 border-t border-[var(--color-line)] pt-1.5">
        <div className="flex flex-wrap gap-1 text-[9px] text-[var(--color-ink-faint)]">
          {subtype && (
            <span className="rounded border border-[var(--color-line)] px-1 py-0.5">{subtype}</span>
          )}
          {cadence != null && (
            <span className="rounded border border-[var(--color-line)] px-1 py-0.5">
              {cadence}m
            </span>
          )}
        </div>
        <div>
          <div className="mb-0.5 text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Research topics
          </div>
          {topics.length === 0 ? (
            <p className="text-[10px] text-[var(--color-ink-faint)]">No active topics</p>
          ) : (
            <ul className="max-h-16 space-y-0.5 overflow-y-auto">
              {topics.map((t) => (
                <li
                  key={t.id}
                  className="truncate text-[10px] text-[var(--color-ink-dim)]"
                  title={t.title}
                >
                  {t.title}
                </li>
              ))}
            </ul>
          )}
        </div>
        {targets.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {targets.map((lib) => (
              <span
                key={lib.id}
                className="max-w-[6rem] truncate rounded border border-[var(--color-line)] px-1 py-0.5 text-[9px] text-[var(--color-ink-dim)]"
                title={lib.name}
              >
                {lib.name}
              </span>
            ))}
          </div>
        )}
        <ScopeSeedRow
          label="Focus seed"
          topicSectors={props.topicSectors}
          draft={scopeDraft}
          onDraftChange={setScopeDraft}
          onSave={() => void saveScope()}
          saving={saving}
          showRestore={showRestore}
          onRestore={props.onRestoreEngineTopic}
          restoring={props.restoringTopic}
        />
        {error && <p className="text-[9px] text-[var(--color-block)]">{error}</p>}
      </div>
    );
  }

  if (props.moduleType === 'live_api') {
    const venue =
      (ctx?.kind === 'live_api' ? ctx.venue : null) ??
      (typeof props.config.venue === 'string' ? props.config.venue : 'paper_sim');
    return (
      <div className="nodrag nowheel mt-1.5 space-y-1.5 border-t border-[var(--color-line)] pt-1.5">
        <label className="block space-y-0.5">
          <span className="text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Venue
          </span>
          <select
            value={venue}
            disabled={saving}
            onChange={(e) =>
              void patchConfig({
                venue: e.target.value,
                instruments: instrumentsDraft
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
                feedClass: feedDraft,
                pollSeconds: Number(pollDraft) || 60,
              })
            }
            className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1.5 py-1 text-[10px] outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
          >
            {LIVE_VENUE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className="text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Instruments
          </span>
          <input
            type="text"
            value={instrumentsDraft}
            onChange={(e) => setInstrumentsDraft(e.target.value)}
            placeholder="SPY, QQQ"
            className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1.5 py-1 text-[10px] outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <div className="grid grid-cols-2 gap-1">
          <label className="block space-y-0.5">
            <span className="text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              Feed
            </span>
            <input
              type="text"
              value={feedDraft}
              onChange={(e) => setFeedDraft(e.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1.5 py-1 text-[10px] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="block space-y-0.5">
            <span className="text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              Poll (s)
            </span>
            <input
              type="number"
              min={5}
              max={3600}
              value={pollDraft}
              onChange={(e) => setPollDraft(e.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1.5 py-1 text-[10px] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            void patchConfig({
              venue,
              instruments: instrumentsDraft
                .split(',')
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean),
              feedClass: feedDraft.trim() || 'iex_free',
              pollSeconds: Math.min(3600, Math.max(5, Number(pollDraft) || 60)),
            })
          }
          className="w-full rounded border border-[var(--color-accent)] px-2 py-1 text-[10px] text-[var(--color-accent)] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save feed'}
        </button>
        <ScopeSeedRow
          label="Scope"
          topicSectors={props.topicSectors}
          draft={scopeDraft}
          onDraftChange={setScopeDraft}
          onSave={() => void saveScope()}
          saving={saving}
          showRestore={showRestore}
          onRestore={props.onRestoreEngineTopic}
          restoring={props.restoringTopic}
        />
        {error && <p className="text-[9px] text-[var(--color-block)]">{error}</p>}
      </div>
    );
  }

  if (props.moduleType === 'trend') {
    const posture =
      (ctx?.kind === 'trend' ? ctx.trendPosture : null) ??
      (typeof props.config.trendPosture === 'string'
        ? props.config.trendPosture
        : 'session_intraday');
    return (
      <div className="nodrag nowheel mt-1.5 space-y-1.5 border-t border-[var(--color-line)] pt-1.5">
        <label className="block space-y-0.5">
          <span className="text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Posture
          </span>
          <select
            value={posture}
            disabled={saving}
            onChange={(e) =>
              void patchConfig({
                ...props.config,
                focus: props.config.focus ?? props.topicSectors[0] ?? 'general',
                trendPosture: e.target.value,
                maxActiveTrends: Number(maxTrendsDraft) || 10,
                cadenceMinutes: Number(cadenceDraft) || 30,
              })
            }
            className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1.5 py-1 text-[10px] outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
          >
            {TREND_POSTURE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-1">
          <label className="block space-y-0.5">
            <span className="text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              Max active
            </span>
            <input
              type="number"
              min={1}
              max={50}
              value={maxTrendsDraft}
              onChange={(e) => setMaxTrendsDraft(e.target.value)}
              onBlur={() =>
                void patchConfig({
                  ...props.config,
                  focus: props.config.focus ?? props.topicSectors[0] ?? 'general',
                  trendPosture: posture,
                  maxActiveTrends: Math.min(50, Math.max(1, Number(maxTrendsDraft) || 10)),
                  cadenceMinutes: Number(cadenceDraft) || 30,
                })
              }
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1.5 py-1 text-[10px] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="block space-y-0.5">
            <span className="text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              Cadence (m)
            </span>
            <input
              type="number"
              min={5}
              max={1440}
              value={cadenceDraft}
              onChange={(e) => setCadenceDraft(e.target.value)}
              onBlur={() =>
                void patchConfig({
                  ...props.config,
                  focus: props.config.focus ?? props.topicSectors[0] ?? 'general',
                  trendPosture: posture,
                  maxActiveTrends: Number(maxTrendsDraft) || 10,
                  cadenceMinutes: Math.min(1440, Math.max(5, Number(cadenceDraft) || 30)),
                })
              }
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1.5 py-1 text-[10px] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
        </div>
        <ScopeSeedRow
          label="Focus seed"
          topicSectors={props.topicSectors}
          draft={scopeDraft}
          onDraftChange={setScopeDraft}
          onSave={() => void saveScope()}
          saving={saving}
          showRestore={showRestore}
          onRestore={props.onRestoreEngineTopic}
          restoring={props.restoringTopic}
        />
        {error && <p className="text-[9px] text-[var(--color-block)]">{error}</p>}
      </div>
    );
  }

  return null;
}
