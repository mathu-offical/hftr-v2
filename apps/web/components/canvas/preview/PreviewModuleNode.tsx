'use client';

import { memo, useMemo } from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import {
  moduleStreamPorts,
  type ModuleType,
} from '@hftr/contracts';
import { FamilyShapeChrome } from '@/components/canvas/FamilyShapeChrome';
import { MathPortBuses, NodePortBuses } from '@/components/canvas/NodePortBuses';
import {
  FAMILY_LABELS,
  MODULE_VISUALS,
  moduleSubtypeChip,
} from '@/components/canvas/canvas-visuals';
import type { PreviewModuleNodeData } from '@/lib/build-template-preview-graph';

type PreviewModuleFlowNode = Node<PreviewModuleNodeData, 'previewModule'>;

export const PreviewModuleNode = memo(function PreviewModuleNode({
  id,
  data,
  selected,
}: NodeProps<PreviewModuleFlowNode>) {
  const moduleType = data.moduleType as ModuleType;
  const visual = MODULE_VISUALS[moduleType] ?? MODULE_VISUALS.display;
  const config = data.config ?? null;
  const subtype = moduleSubtypeChip(moduleType, config, data.name);
  const streamPorts = useMemo(
    () =>
      moduleStreamPorts({
        type: moduleType,
        moduleId: id,
        links: [],
      }),
    [id, moduleType],
  );
  const shaped = Boolean(visual.shape);

  return (
    <div
      className={`relative h-full w-full overflow-visible ${visual.radiusClass ?? 'rounded'}`}
      title={data.name}
    >
      {moduleType === 'math' ? (
        <MathPortBuses inbound={streamPorts.inbound} outbound={streamPorts.outbound} />
      ) : (
        <NodePortBuses
          moduleType={moduleType}
          inbound={streamPorts.inbound}
          outbound={streamPorts.outbound}
          config={config}
        />
      )}
      <div
        className={`relative h-full w-full overflow-hidden border bg-[var(--color-surface-1)] ${visual.radiusClass ?? 'rounded'}`}
        style={{
          borderStyle: visual.borderStyle ?? 'solid',
          borderColor: selected ? visual.hue : 'var(--color-line)',
          borderLeftWidth: 3,
          borderLeftColor: visual.hue,
          boxShadow: selected ? `0 0 0 1px ${visual.hue}55` : undefined,
          backgroundImage: visual.wash
            ? `linear-gradient(${visual.wash}, ${visual.wash}), linear-gradient(var(--color-surface-1), var(--color-surface-1))`
            : undefined,
          minHeight: shaped ? '100%' : undefined,
        }}
      >
        <FamilyShapeChrome shape={visual.shape} hue={visual.hue} selected={selected} />
        <div className="relative px-1.5 py-1">
          <div className="flex items-center gap-1">
            <span
              className="shrink-0 rounded px-0.5 text-[7px] uppercase tracking-wide"
              style={{
                color: visual.hue,
                border: `1px solid ${visual.hue}55`,
                background: `${visual.hue}12`,
              }}
            >
              {FAMILY_LABELS[visual.family]}
            </span>
            <p className="min-w-0 truncate text-[9px] font-medium leading-tight text-[var(--color-ink)]">
              {data.name}
            </p>
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <p className="truncate text-[8px] uppercase tracking-wide text-[var(--color-ink-faint)]">
              {visual.label}
            </p>
            {subtype ? (
              <span
                className="max-w-[5.5rem] truncate rounded border border-[var(--color-line)] px-0.5 text-[7px] text-[var(--color-ink-dim)]"
                title={subtype}
              >
                {subtype}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});
