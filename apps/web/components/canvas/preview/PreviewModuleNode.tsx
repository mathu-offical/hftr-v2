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
}: NodeProps<PreviewModuleFlowNode>) {
  const moduleType = data.moduleType as ModuleType;
  const visual = MODULE_VISUALS[moduleType] ?? {
    label: data.moduleType,
    hue: '#a9b1d6',
    family: 'agent' as const,
    radiusClass: 'rounded',
    borderStyle: 'solid' as const,
    accent: 'bar' as const,
    wash: 'transparent',
  };
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
          borderColor: 'var(--color-line)',
          borderLeftWidth: 3,
          borderLeftColor: visual.hue,
          backgroundImage: visual.wash
            ? `linear-gradient(${visual.wash}, ${visual.wash}), linear-gradient(var(--color-surface-1), var(--color-surface-1))`
            : undefined,
          minHeight: shaped ? '100%' : undefined,
        }}
      >
        <FamilyShapeChrome shape={visual.shape} hue={visual.hue} />
        <div className="relative px-1.5 py-1">
          <p className="truncate text-[9px] font-medium leading-tight text-[var(--color-ink)]">
            {data.name}
          </p>
          <p className="truncate text-[8px] uppercase tracking-wide text-[var(--color-ink-faint)]">
            {FAMILY_LABELS[visual.family]} · {visual.label}
            {subtype ? ` · ${subtype}` : ''}
          </p>
        </div>
      </div>
    </div>
  );
});
