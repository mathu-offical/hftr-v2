'use client';

import { memo, useEffect, useState } from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import { api } from '@/lib/client';

export type EngineGroupNodeData = {
  companyId: string;
  label: string;
  templateId: string;
  masterTopicSectors: string[];
  memberModuleIds: string[];
  onRequestDelete: (engineId: string) => void;
  onRequestReflow: (engineId: string) => void;
  onMasterTopicSaved: (
    engineId: string,
    masterTopicSectors: string[],
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

/**
 * React Flow parent node for an ENGINE instance (D-028 / D-033): labeled
 * background with master topic, Reflow, and delete affordances.
 */
export const EngineGroupNode = memo(function EngineGroupNode({
  id,
  data,
  selected,
}: NodeProps<EngineGroupFlowNode>) {
  const [topicDraft, setTopicDraft] = useState(data.masterTopicSectors.join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTopicDraft(data.masterTopicSectors.join(', '));
  }, [data.masterTopicSectors]);

  async function saveMasterTopic() {
    setSaving(true);
    setError(null);
    try {
      const sectors = topicDraft
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      const response = await api<{
        engine: { masterTopicSectors: string[] };
        modules: Array<{
          id: string;
          topicSectors: string[];
          capitalAllocationRef: string | null;
          targetExitRef: string | null;
          topicSectorsOverridden: boolean;
        }>;
      }>(`/api/companies/${data.companyId}/engines/${id}`, {
        method: 'PATCH',
        body: { masterTopicSectors: sectors },
      });
      data.onMasterTopicSaved(id, response.engine.masterTopicSectors, response.modules);
    } catch {
      setError('Could not save engine topic.');
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
      <div className="nodrag nowheel space-y-1 px-3 py-2">
        <label className="block space-y-1">
          <span className="text-[10px] text-[var(--color-ink-dim)]">Master topic / sector</span>
          <div className="flex gap-1">
            <input
              value={topicDraft}
              onChange={(event) => setTopicDraft(event.target.value)}
              placeholder="e.g. semiconductors, AI infra"
              className="min-w-0 flex-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveMasterTopic()}
              className="rounded border border-[var(--color-accent)] px-2 py-1 text-[10px] text-[var(--color-accent)] disabled:opacity-50"
            >
              {saving ? '…' : 'Save'}
            </button>
          </div>
        </label>
        {error && <p className="text-[9px] text-[var(--color-block)]">{error}</p>}
      </div>
    </div>
  );
});
