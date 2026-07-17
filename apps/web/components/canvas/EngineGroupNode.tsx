'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import type { EngineSetupSnapshot, ModuleSetupField } from '@hftr/contracts';
import { api } from '@/lib/client';
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

export type EngineGroupNodeData = {
  companyId: string;
  label: string;
  templateId: string;
  masterTopicSectors: string[];
  setupSnapshot?: EngineSetupSnapshot | null;
  templateInputs?: Record<string, string>;
  memberModuleIds: string[];
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
 * React Flow parent node for an ENGINE instance (D-028 / D-033 / D-035):
 * labeled chrome with Reflow, full shared setup (topic, total capital envelope,
 * overall exit), template inputs, and delete.
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

  useEffect(() => {
    setDraft(draftFromSnapshot(data.setupSnapshot, data.masterTopicSectors));
  }, [data.setupSnapshot, data.masterTopicSectors]);

  useEffect(() => {
    setTemplateInputs(data.templateInputs ?? {});
  }, [data.templateInputs]);

  const missingFields = useMemo(
    () => missingFieldsFromDraft(ENGINE_SETUP_FIELDS, draft),
    [draft],
  );

  const templateEntries = Object.entries(templateInputs);

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

  return (
    <div
      className="h-full w-full rounded-xl border border-dashed bg-[var(--color-surface-1)]/40"
      style={{
        borderColor: selected ? 'var(--color-accent)' : 'var(--color-line)',
        boxShadow: selected ? '0 0 0 1px var(--color-accent)' : undefined,
      }}
    >
      <div className="engine-group-drag flex items-start justify-between gap-2 border-b border-[var(--color-line)]/60 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Engine
          </div>
          <div className="truncate text-sm font-medium text-[var(--color-ink)]">{data.label}</div>
        </div>
        <div className="nodrag flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)]"
            onClick={() => data.onRequestReflow(id)}
          >
            Reflow
          </button>
          <button
            type="button"
            className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-block)]"
            onClick={() => data.onRequestDelete(id)}
          >
            Delete
          </button>
        </div>
      </div>
      <div className="nodrag nowheel max-h-[260px] space-y-2 overflow-y-auto px-3 py-2">
        <p className="text-[9px] text-[var(--color-ink-faint)]">
          Shared setup · capital is total envelope (split across members) · exit is overall deadline
        </p>
        <ModuleSetupFields
          requiredFields={ENGINE_SETUP_FIELDS}
          missingFields={missingFields}
          draft={draft}
          onChange={setDraft}
          compact
        />
        {templateEntries.length > 0 && (
          <div className="space-y-1 border-t border-[var(--color-line)]/50 pt-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              Template inputs
            </div>
            {templateEntries.map(([key, value]) => (
              <label key={key} className="block space-y-0.5">
                <span className="text-[10px] text-[var(--color-ink-dim)]">{key}</span>
                <input
                  value={value}
                  onChange={(event) =>
                    setTemplateInputs((current) => ({ ...current, [key]: event.target.value }))
                  }
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1.5 py-1 text-[10px] outline-none focus:border-[var(--color-accent)]"
                />
              </label>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveSetup()}
            className="rounded border border-[var(--color-accent)] px-2 py-1 text-[10px] text-[var(--color-accent)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save setup'}
          </button>
          {error && <p className="text-[9px] text-[var(--color-block)]">{error}</p>}
        </div>
      </div>
    </div>
  );
});
