'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import {
  engineUtilityBusesForCategory,
  getEngineTemplateById,
  type EngineSetupSnapshot,
  type EngineUtilityBus,
  type MissingEngineChildDependency,
  type ModuleSetupField,
} from '@hftr/contracts';
import { api } from '@/lib/client';
import { InlineLoadingStrip } from '@/components/shell/LoadingChrome';
import { engineVisualForTemplate, NATURE_PORT_VISUALS } from './canvas-visuals';
import {
  EMPTY_MODULE_SETUP_DRAFT,
  ModuleSetupFields,
  missingFieldsFromDraft,
  moduleSetupInputFromDraft,
  type ModuleSetupDraft,
} from './ModuleSetupFields';
import type { EngineHydrationPhase } from './types';

const ENGINE_SETUP_FIELDS: readonly ModuleSetupField[] = [
  'topic_sector',
  'capital_allocation',
  'target_exit',
];

const BUS_LABELS: Record<EngineUtilityBus, string> = {
  data_in: 'Data in',
  data_out: 'Data out',
  clock: 'Clock',
  funds: 'Funds',
  system_control: 'Control',
};

/** Motherboard utility bus → port nature (edge/handle chrome parity with module rails). */
const BUS_NATURE: Record<EngineUtilityBus, keyof typeof NATURE_PORT_VISUALS> = {
  data_in: 'data',
  data_out: 'data',
  clock: 'time',
  funds: 'fund',
  system_control: 'system',
};

export type EngineUtilityLinkView = {
  id: string;
  bus: EngineUtilityBus;
  fromEngineId?: string | null;
  fromModuleId?: string | null;
  streamId?: string | null;
  streamDescriptor?: string | null;
};

export type EngineGroupNodeData = {
  companyId: string;
  label: string;
  templateId: string;
  masterTopicSectors: string[];
  setupSnapshot?: EngineSetupSnapshot | null;
  templateInputs?: Record<string, string>;
  memberModuleIds: string[];
  /** D-209 — shell + loading region until members/setup retrieve. */
  hydrationPhase?: EngineHydrationPhase;
  /** D-091 motherboard utility links bound to this engine. */
  utilityLinks?: EngineUtilityLinkView[];
  /** D-210: required research/sim child engines not yet on canvas. */
  missingChildDependencies?: MissingEngineChildDependency[];
  /** D-213: required research/sim child engines already attached to this execution. */
  presentChildDependencies?: MissingEngineChildDependency[];
  onRequestAddMissingDependencies?: (engineId: string) => void;
  onRequestDelete: (engineId: string) => void;
  onRequestReflow: (engineId: string) => void;
  onEngineSetupSaved: (
    engineId: string,
    engine: {
      masterTopicSectors: string[];
      setupSnapshot?: EngineSetupSnapshot | null;
      templateInputs?: Record<string, string>;
      capitalAllocationRef?: string | null;
      targetExitRef?: string | null;
    },
    modules: Array<{
      id: string;
      topicSectors: string[];
      capitalAllocationRef: string | null;
      targetExitRef: string | null;
      topicSectorsOverridden: boolean;
    }>,
  ) => void;
};

export type EngineGroupFlowNode = Node<EngineGroupNodeData, 'engineGroup'>;

function draftFromSnapshot(
  snapshot: EngineSetupSnapshot | null | undefined,
  masterTopicSectors: string[],
): ModuleSetupDraft {
  if (!snapshot) {
    return {
      ...EMPTY_MODULE_SETUP_DRAFT,
      topicSectors: masterTopicSectors.join(', '),
    };
  }
  const topics = snapshot.topicSectors ?? [];
  return {
    topicSectors: topics.length > 0 ? topics.join(', ') : masterTopicSectors.join(', '),
    allocationMode: snapshot.allocationMode ?? 'amount',
    allocationValue: snapshot.allocationValue ?? '',
    targetExitLocal: snapshot.targetExitLocal ?? '',
  };
}

/**
 * React Flow parent node for an ENGINE instance (D-028 / D-033 / D-035 / D-089 / D-091):
 * labeled chrome with Reflow/Delete; shared setup + template inputs as bordered
 * inline fields; motherboard utility ports for data/clock/funds/control.
 */
export const EngineGroupNode = memo(function EngineGroupNode({
  id,
  data,
  selected,
}: NodeProps<EngineGroupFlowNode>) {
  const [draft, setDraft] = useState(() =>
    draftFromSnapshot(data.setupSnapshot, data.masterTopicSectors),
  );
  const [templateInputs, setTemplateInputs] = useState<Record<string, string>>(
    () => data.templateInputs ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusField, setFocusField] = useState<ModuleSetupField | null>(null);
  const templateInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setDraft(draftFromSnapshot(data.setupSnapshot, data.masterTopicSectors));
  }, [data.setupSnapshot, data.masterTopicSectors]);

  useEffect(() => {
    setTemplateInputs(data.templateInputs ?? {});
  }, [data.templateInputs]);

  const missingFields = useMemo(() => missingFieldsFromDraft(ENGINE_SETUP_FIELDS, draft), [draft]);

  const template = useMemo(() => getEngineTemplateById(data.templateId), [data.templateId]);
  const utilityBuses = useMemo(
    () => engineUtilityBusesForCategory(template?.category ?? 'research'),
    [template?.category],
  );

  const templateInputDefs = useMemo(() => {
    return (template?.inputs ?? []).map((def) => ({
      key: def.key,
      value: templateInputs[def.key] ?? '',
      label: def.label,
      placeholder: def.placeholder,
    }));
  }, [template, templateInputs]);

  const linksByBus = useMemo(() => {
    const map = new Map<EngineUtilityBus, EngineUtilityLinkView[]>();
    for (const link of data.utilityLinks ?? []) {
      const list = map.get(link.bus) ?? [];
      list.push(link);
      map.set(link.bus, list);
    }
    return map;
  }, [data.utilityLinks]);

  async function saveSetup() {
    setSaving(true);
    setError(null);
    try {
      const setup = moduleSetupInputFromDraft(draft, ENGINE_SETUP_FIELDS);
      const setupSnapshot: EngineSetupSnapshot = {
        topicSectors: setup.topicSectors ?? [],
        allocationMode: draft.allocationMode,
        allocationValue: draft.allocationValue.trim(),
        targetExitLocal: draft.targetExitLocal,
        ...(data.setupSnapshot?.optionAnchors
          ? { optionAnchors: data.setupSnapshot.optionAnchors }
          : {}),
        ...(data.setupSnapshot?.optionAnchorPositions
          ? { optionAnchorPositions: data.setupSnapshot.optionAnchorPositions }
          : {}),
        ...(data.setupSnapshot?.decisionNodes
          ? { decisionNodes: data.setupSnapshot.decisionNodes }
          : {}),
        ...(data.setupSnapshot?.decisionOptionSelections
          ? { decisionOptionSelections: data.setupSnapshot.decisionOptionSelections }
          : {}),
      };
      const response = await api<{
        engine: {
          masterTopicSectors: string[];
          setupSnapshot?: EngineSetupSnapshot | null;
          templateInputs?: Record<string, string>;
          capitalAllocationRef?: string | null;
          targetExitRef?: string | null;
        };
        modules: Array<{
          id: string;
          topicSectors: string[];
          capitalAllocationRef: string | null;
          targetExitRef: string | null;
          topicSectorsOverridden: boolean;
        }>;
      }>(`/api/companies/${data.companyId}/engines/${id}`, {
        method: 'PATCH',
        body: {
          masterTopicSectors: setup.topicSectors ?? [],
          setup,
          setupSnapshot,
          templateInputs,
        },
      });
      data.onEngineSetupSaved(id, response.engine, response.modules);
    } catch {
      setError('Could not save engine setup.');
    } finally {
      setSaving(false);
    }
  }

  const engineVisual = engineVisualForTemplate(data.templateId);
  const inboundBuses = utilityBuses.filter((b) => b !== 'data_out');
  const outboundBuses = utilityBuses.filter((b) => b === 'data_out' || b === 'system_control');
  const hydrating = data.hydrationPhase === 'loading';
  const missingChildDeps = data.missingChildDependencies ?? [];
  const presentChildDeps = data.presentChildDependencies ?? [];
  const showMissingChildDeps = missingChildDeps.length > 0;
  const showPresentChildDeps = presentChildDeps.length > 0;

  function missingDepChipLabel(dep: MissingEngineChildDependency): string {
    if (dep.kind === 'simulation' && dep.role) {
      return `Missing: ${dep.role} sim`;
    }
    return `Missing: ${dep.label}`;
  }

  function presentDepChipLabel(dep: MissingEngineChildDependency): string {
    return `Attached: ${dep.label}`;
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-xl border border-dashed"
      data-testid="engine-group-node"
      data-hydration={hydrating ? 'loading' : 'ready'}
      aria-busy={hydrating || undefined}
      style={{
        borderColor: selected ? engineVisual.hue : `${engineVisual.hue}99`,
        boxShadow: selected
          ? `0 0 0 1px ${engineVisual.hue}, inset 0 0 0 1px ${engineVisual.stripe}`
          : `inset 0 0 0 1px ${engineVisual.stripe}`,
        backgroundImage: `
          linear-gradient(135deg, ${engineVisual.wash}, transparent 42%),
          repeating-linear-gradient(
            -18deg,
            ${engineVisual.stripe} 0 1px,
            transparent 1px 14px
          ),
          linear-gradient(var(--color-surface-1), var(--color-surface-1))
        `,
      }}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-1.5"
        style={{ background: engineVisual.hue, opacity: 0.7 }}
        aria-hidden
      />
      {/* D-091 motherboard utility ports (unique in/out handle ids) */}
      {inboundBuses.map((bus, index) => {
        const bound = (linksByBus.get(bus) ?? []).length > 0;
        const top = `${18 + index * 16}%`;
        const nature = NATURE_PORT_VISUALS[BUS_NATURE[bus]];
        return (
          <div key={`in-${bus}`}>
            <Handle
              id={`engine-util-${bus}`}
              type="target"
              position={Position.Left}
              style={{
                top,
                background: bound ? nature.color : 'var(--color-line)',
                border: `1px solid ${bound ? nature.color : 'var(--color-surface-0)'}`,
              }}
              title={`${BUS_LABELS[bus]}${bound ? ' · bound' : ' · unbound'}`}
              aria-label={`${BUS_LABELS[bus]} (${nature.label})`}
            />
            <span
              className="pointer-events-none absolute -left-[3.8rem] w-[3.6rem] truncate text-right text-[6px]"
              style={{ top, transform: 'translateY(-50%)', color: nature.color }}
              aria-hidden
            >
              {BUS_LABELS[bus]}
            </span>
          </div>
        );
      })}
      {outboundBuses.map((bus, index) => {
        const bound = (linksByBus.get(bus) ?? []).length > 0;
        const top = `${22 + index * 18}%`;
        const nature = NATURE_PORT_VISUALS[BUS_NATURE[bus]];
        return (
          <div key={`out-${bus}`}>
            <Handle
              id={`engine-util-${bus}-out`}
              type="source"
              position={Position.Right}
              style={{
                top,
                background: bound ? nature.color : 'var(--color-line)',
                border: `1px solid ${bound ? nature.color : 'var(--color-surface-0)'}`,
              }}
              title={`${BUS_LABELS[bus]}${bound ? ' · bound' : ' · unbound'}`}
              aria-label={`${BUS_LABELS[bus]} (${nature.label})`}
            />
            <span
              className="pointer-events-none absolute -right-[3.8rem] w-[3.6rem] truncate text-left text-[6px]"
              style={{ top, transform: 'translateY(-50%)', color: nature.color }}
              aria-hidden
            >
              {BUS_LABELS[bus]}
            </span>
          </div>
        );
      })}
      <div className="engine-group-drag border-b border-[var(--color-line)]/60 px-2 py-1 pl-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="rounded px-1 py-0.5 text-[8px] uppercase tracking-wider"
                style={{
                  color: engineVisual.hue,
                  border: `1px solid ${engineVisual.hue}66`,
                  background: `${engineVisual.hue}18`,
                }}
              >
                Engine · {engineVisual.label}
              </span>
            </div>
            <div className="truncate text-sm font-medium text-[var(--color-ink)]">{data.label}</div>
            {(showPresentChildDeps || showMissingChildDeps) && (
              <div className="nodrag mt-1 flex flex-wrap items-center gap-1">
                {presentChildDeps.map((dep) => (
                  <span
                    key={`present-${dep.templateId}`}
                    className="rounded-full border border-[var(--color-line)] px-1.5 py-0.5 text-[8px] text-[var(--color-ink-dim)]"
                    title={`Attached child engine: ${dep.label}`}
                  >
                    {presentDepChipLabel(dep)}
                  </span>
                ))}
                {missingChildDeps.map((dep) => (
                  <span
                    key={dep.templateId}
                    className="rounded-full border border-[var(--color-warn)] px-1.5 py-0.5 text-[8px] text-[var(--color-warn)]"
                    title={`Required child engine: ${dep.label}`}
                  >
                    {missingDepChipLabel(dep)}
                  </span>
                ))}
                {data.onRequestAddMissingDependencies && (
                  <button
                    type="button"
                    disabled={saving}
                    className="rounded border border-[var(--color-warn)] px-1.5 py-0.5 text-[8px] text-[var(--color-warn)] disabled:opacity-50"
                    onClick={() => data.onRequestAddMissingDependencies?.(id)}
                  >
                    Add deps
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="nodrag flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={hydrating}
              className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)] disabled:opacity-40"
              onClick={() => data.onRequestReflow(id)}
            >
              Reflow
            </button>
            <button
              type="button"
              disabled={hydrating}
              className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-block)] disabled:opacity-40"
              onClick={() => data.onRequestDelete(id)}
            >
              Delete
            </button>
          </div>
        </div>
        {hydrating ? (
          <div className="nodrag nowheel mt-1.5" data-testid="engine-group-loading">
            <InlineLoadingStrip label="Engine" detail="retrieving members" />
          </div>
        ) : (
          <>
            <div className="nodrag nowheel mt-1 flex min-w-0 flex-wrap items-center gap-1">
              <ModuleSetupFields
                requiredFields={ENGINE_SETUP_FIELDS}
                missingFields={missingFields}
                draft={draft}
                onChange={setDraft}
                layout="inline"
                hideHints
                focusField={focusField}
                onFocusField={setFocusField}
              />
              {templateInputDefs.map((input) => (
                <label
                  key={input.key}
                  className="min-w-[7rem] flex-1"
                  title={input.label}
                  onPointerDown={() => {
                    requestAnimationFrame(() => {
                      templateInputRefs.current[input.key]?.focus();
                    });
                  }}
                >
                  <span className="sr-only">{input.label}</span>
                  <input
                    ref={(element) => {
                      templateInputRefs.current[input.key] = element;
                    }}
                    value={input.value}
                    onChange={(event) =>
                      setTemplateInputs((current) => ({
                        ...current,
                        [input.key]: event.target.value,
                      }))
                    }
                    placeholder={input.placeholder ?? input.label}
                    title={input.value || input.label}
                    aria-label={input.label}
                    className="w-full truncate rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1 py-0.5 text-[9px] outline-none focus:border-[var(--color-accent)]"
                  />
                </label>
              ))}
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveSetup()}
                className="shrink-0 rounded border border-[var(--color-accent)] px-1.5 py-0.5 text-[9px] text-[var(--color-accent)] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              {error && <p className="text-[9px] text-[var(--color-block)]">{error}</p>}
            </div>
            <div className="nodrag mt-1 flex flex-wrap gap-1">
              {utilityBuses.map((bus) => {
                const bound = linksByBus.get(bus) ?? [];
                const nature = NATURE_PORT_VISUALS[BUS_NATURE[bus]];
                const tip =
                  bound[0]?.streamDescriptor ||
                  (bound.length > 0 ? `${bound.length} bound` : 'unbound');
                return (
                  <span
                    key={bus}
                    className="rounded border px-1 py-0.5 text-[8px]"
                    style={{
                      borderColor: bound.length > 0 ? `${nature.color}88` : 'var(--color-line)',
                      color: bound.length > 0 ? nature.color : 'var(--color-ink-faint)',
                    }}
                    title={tip}
                  >
                    {BUS_LABELS[bus]}
                    {bound.length > 0 ? ' ✓' : ''}
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
