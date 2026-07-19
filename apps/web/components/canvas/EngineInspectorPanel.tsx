'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  canvasVisibleOptionAnchors,
  getEngineTemplateById,
  type EngineSetupSnapshot,
  type ModuleSetupField,
  type OptionAnchorPosition,
  type OptionAnchorSpec,
} from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import { LeverTreeSection } from './LeverTreeSection';
import {
  EMPTY_MODULE_SETUP_DRAFT,
  ModuleSetupFields,
  missingFieldsFromDraft,
  moduleSetupInputFromDraft,
  type ModuleSetupDraft,
} from './ModuleSetupFields';

const ENGINE_SETUP_FIELDS: readonly ModuleSetupField[] = [
  'topic_sector',
  'capital_allocation',
  'target_exit',
];

export type EngineInspectorModel = {
  id: string;
  label: string;
  templateId: string;
  masterTopicSectors: string[];
  setupSnapshot?: EngineSetupSnapshot | null;
  templateInputs?: Record<string, string>;
};

/**
 * Floating inspector for a selected ENGINE group (D-173): setup, template
 * inputs, and the full option-anchor lever tree.
 */
export function EngineInspectorPanel(props: {
  companyId: string;
  engine: EngineInspectorModel;
  anchors: OptionAnchorSpec[];
  anchorPositions?: Record<string, OptionAnchorPosition>;
  onUpdated: (engineId: string, patch: Partial<EngineInspectorModel>) => void;
  onClose: () => void;
  onFocusAnchor?: (anchorId: string) => void;
  onAnchorPositionChange?: (anchorId: string, position: OptionAnchorPosition) => void;
}) {
  const { engine } = props;
  const template = useMemo(
    () => getEngineTemplateById(engine.templateId),
    [engine.templateId],
  );
  const [label, setLabel] = useState(engine.label);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [templateInputs, setTemplateInputs] = useState<Record<string, string>>(
    () => engine.templateInputs ?? {},
  );
  const [setupDraft, setSetupDraft] = useState<ModuleSetupDraft>(() => ({
    ...EMPTY_MODULE_SETUP_DRAFT,
    topicSectors: (engine.setupSnapshot?.topicSectors ?? engine.masterTopicSectors).join(', '),
    allocationMode: engine.setupSnapshot?.allocationMode ?? 'amount',
    allocationValue: engine.setupSnapshot?.allocationValue ?? '',
    targetExitLocal: engine.setupSnapshot?.targetExitLocal ?? '',
  }));

  useEffect(() => {
    setLabel(engine.label);
    setTemplateInputs(engine.templateInputs ?? {});
    setSetupDraft({
      ...EMPTY_MODULE_SETUP_DRAFT,
      topicSectors: (engine.setupSnapshot?.topicSectors ?? engine.masterTopicSectors).join(
        ', ',
      ),
      allocationMode: engine.setupSnapshot?.allocationMode ?? 'amount',
      allocationValue: engine.setupSnapshot?.allocationValue ?? '',
      targetExitLocal: engine.setupSnapshot?.targetExitLocal ?? '',
    });
    setError(null);
  }, [engine]);

  const missingSetup = missingFieldsFromDraft(ENGINE_SETUP_FIELDS, setupDraft);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const setup = moduleSetupInputFromDraft(setupDraft, ENGINE_SETUP_FIELDS);
      const setupSnapshot: EngineSetupSnapshot = {
        topicSectors: setup.topicSectors ?? [],
        allocationMode: setupDraft.allocationMode,
        allocationValue: setupDraft.allocationValue.trim(),
        targetExitLocal: setupDraft.targetExitLocal,
        ...(engine.setupSnapshot?.optionAnchors
          ? { optionAnchors: engine.setupSnapshot.optionAnchors }
          : {}),
        ...(engine.setupSnapshot?.optionAnchorPositions
          ? { optionAnchorPositions: engine.setupSnapshot.optionAnchorPositions }
          : {}),
        ...(props.anchors.length > 0 ? { optionAnchors: props.anchors } : {}),
        ...(props.anchorPositions
          ? { optionAnchorPositions: props.anchorPositions }
          : {}),
      };
      const response = await api<{
        engine: {
          label: string;
          masterTopicSectors: string[];
          setupSnapshot?: EngineSetupSnapshot | null;
          templateInputs?: Record<string, string>;
        };
      }>(`/api/companies/${props.companyId}/engines/${engine.id}`, {
        method: 'PATCH',
        body: {
          label: label.trim() || engine.label,
          masterTopicSectors: setup.topicSectors ?? [],
          setup,
          setupSnapshot,
          templateInputs,
        },
      });
      props.onUpdated(engine.id, {
        label: response.engine.label,
        masterTopicSectors: response.engine.masterTopicSectors,
        setupSnapshot: response.engine.setupSnapshot ?? setupSnapshot,
        templateInputs: response.engine.templateInputs ?? templateInputs,
      });
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Failed to save engine');
    } finally {
      setSaving(false);
    }
  }, [
    engine,
    label,
    props,
    setupDraft,
    templateInputs,
  ]);

  const canvasAnchors = canvasVisibleOptionAnchors(props.anchors);

  return (
    <aside
      className="absolute right-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-80 flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-4 shadow-2xl"
      aria-label="Engine inspector"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">
            Engine
          </p>
          <p className="text-xs text-[var(--color-ink-dim)]">
            {template?.label ?? engine.templateId}
          </p>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
        >
          Close
        </button>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-[var(--color-ink-dim)]">Label</span>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1.5 text-sm text-[var(--color-ink)]"
        />
      </label>

      <div className="space-y-2 border-t border-[var(--color-line)] pt-3">
        <span className="text-xs text-[var(--color-ink-dim)]">Shared setup</span>
        <ModuleSetupFields
          requiredFields={[...ENGINE_SETUP_FIELDS]}
          missingFields={missingSetup}
          draft={setupDraft}
          onChange={setSetupDraft}
          layout="stack"
          showLabels
        />
      </div>

      {(template?.inputs.length ?? 0) > 0 && (
        <div className="space-y-2 border-t border-[var(--color-line)] pt-3">
          <span className="text-xs text-[var(--color-ink-dim)]">Template inputs</span>
          {template?.inputs.map((input) => (
            <label key={input.key} className="block space-y-1">
              <span className="text-[10px] text-[var(--color-ink-faint)]">{input.label}</span>
              <input
                value={templateInputs[input.key] ?? ''}
                onChange={(event) =>
                  setTemplateInputs((current) => ({
                    ...current,
                    [input.key]: event.target.value,
                  }))
                }
                placeholder={input.placeholder}
                className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1.5 text-xs text-[var(--color-ink)]"
              />
            </label>
          ))}
        </div>
      )}

      {canvasAnchors.length > 0 && (
        <div className="space-y-2 border-t border-[var(--color-line)] pt-3">
          <span className="text-xs text-[var(--color-ink-dim)]">Option anchors</span>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {canvasAnchors.map((anchor) => (
              <li key={anchor.id}>
                <button
                  type="button"
                  onClick={() => props.onFocusAnchor?.(anchor.id)}
                  className="flex w-full items-center justify-between gap-2 rounded border border-[var(--color-line)] px-2 py-1 text-left text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
                >
                  <span className="truncate">{anchor.label}</span>
                  <span className="shrink-0 uppercase text-[var(--color-ink-faint)]">
                    {anchor.kind.replace(/_/g, ' ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {props.anchors.length > 0 && (
        <LeverTreeSection
          companyId={props.companyId}
          engineId={engine.id}
          anchors={props.anchors}
          {...(props.anchorPositions ? { positions: props.anchorPositions } : {})}
          manualControl
          {...(props.onAnchorPositionChange
            ? { onPositionChange: props.onAnchorPositionChange }
            : {})}
        />
      )}

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="rounded-md border border-[var(--color-accent)] px-3 py-2 text-xs text-[var(--color-accent)] disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save engine'}
      </button>

      {error && <p className="text-xs text-[var(--color-block)]">{error}</p>}
    </aside>
  );
}
