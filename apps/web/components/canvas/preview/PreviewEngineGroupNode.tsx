'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import {
  engineUtilityBusesForCategory,
  engineUtilitySourceHandleId,
  engineUtilityTargetHandleId,
  getEngineTemplateById,
  type EngineUtilityBus,
} from '@hftr/contracts';
import { engineVisualForTemplate, NATURE_PORT_VISUALS } from '@/components/canvas/canvas-visuals';
import type { PreviewEngineGroupNodeData } from '@/lib/build-template-preview-graph';

type PreviewEngineFlowNode = Node<PreviewEngineGroupNodeData, 'previewEngine'>;

const BUS_LABELS: Record<EngineUtilityBus, string> = {
  data_in: 'Data in',
  data_out: 'Data out',
  clock: 'Clock',
  funds: 'Funds',
  system_control: 'Control',
};

const BUS_NATURE: Record<EngineUtilityBus, keyof typeof NATURE_PORT_VISUALS> = {
  data_in: 'data',
  data_out: 'data',
  clock: 'time',
  funds: 'fund',
  system_control: 'system',
};

export const PreviewEngineGroupNode = memo(function PreviewEngineGroupNode({
  data,
}: NodeProps<PreviewEngineFlowNode>) {
  const engineVisual = engineVisualForTemplate(data.templateId);
  const template = getEngineTemplateById(data.templateId);
  const utilityBuses = engineUtilityBusesForCategory(template?.category ?? 'research');
  const inboundBuses = utilityBuses.filter(
    (bus) => bus === 'data_in' || bus === 'clock' || bus === 'funds' || bus === 'system_control',
  );
  const outboundBuses = utilityBuses.filter(
    (bus) => bus === 'data_out' || bus === 'system_control',
  );
  const ring = data.selected
    ? 'border-[var(--color-accent)]'
    : data.familyActive
      ? 'border-[var(--color-accent)]/50'
      : undefined;
  return (
    <div
      className={`relative h-full w-full overflow-visible rounded-md border border-dashed ${ring ?? ''}`}
      style={{
        borderColor: ring ? undefined : `${engineVisual.hue}88`,
        backgroundImage: `
          linear-gradient(${engineVisual.wash}, ${engineVisual.wash}),
          repeating-linear-gradient(
            -18deg,
            ${engineVisual.stripe} 0 1px,
            transparent 1px 14px
          ),
          linear-gradient(var(--color-surface-0), var(--color-surface-0))
        `,
      }}
      data-testid="engine-preview-group"
      data-engine-key={data.engineKey}
      data-template-id={data.templateId}
      data-engine-section={data.section}
      data-family-active={data.familyActive ? 'true' : 'false'}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ background: engineVisual.hue, opacity: 0.75 }}
        aria-hidden
      />
      {inboundBuses.map((bus, index) => {
        const top = `${18 + index * 16}%`;
        const nature = NATURE_PORT_VISUALS[BUS_NATURE[bus]];
        return (
          <div key={`in-${bus}`}>
            <Handle
              id={engineUtilityTargetHandleId(bus)}
              type="target"
              position={Position.Left}
              style={{
                top,
                width: 6,
                height: 6,
                background: nature.color,
                border: `1px solid ${nature.color}`,
              }}
            />
            <span
              className="pointer-events-none absolute -left-[3.6rem] w-[3.4rem] truncate text-right text-[6px]"
              style={{ top, transform: 'translateY(-50%)', color: nature.color }}
              aria-hidden
            >
              {BUS_LABELS[bus]}
            </span>
          </div>
        );
      })}
      {outboundBuses.map((bus, index) => {
        const top = `${22 + index * 18}%`;
        const nature = NATURE_PORT_VISUALS[BUS_NATURE[bus]];
        return (
          <div key={`out-${bus}`}>
            <Handle
              id={engineUtilitySourceHandleId(bus)}
              type="source"
              position={Position.Right}
              style={{
                top,
                width: 6,
                height: 6,
                background: nature.color,
                border: `1px solid ${nature.color}`,
              }}
            />
            <span
              className="pointer-events-none absolute -right-[3.6rem] w-[3.4rem] truncate text-left text-[6px]"
              style={{ top, transform: 'translateY(-50%)', color: nature.color }}
              aria-hidden
            >
              {BUS_LABELS[bus]}
            </span>
          </div>
        );
      })}
      <div className="flex items-center gap-1 px-2 py-1 pl-3">
        <span
          className="shrink-0 rounded px-1 py-0.5 text-[7px] uppercase tracking-wider"
          style={{
            color: engineVisual.hue,
            border: `1px solid ${engineVisual.hue}66`,
            background: `${engineVisual.hue}14`,
          }}
        >
          Engine · {engineVisual.label}
        </span>
        <span className="truncate text-[10px] font-medium text-[var(--color-ink)]">
          {data.label}
        </span>
        <span className="shrink-0 text-[8px] uppercase tracking-wide text-[var(--color-ink-faint)]">
          {data.section}
        </span>
        {data.autoDependency && (
          <span
            className="shrink-0 rounded border border-[var(--color-line)] px-1 text-[8px] text-[var(--color-ink-faint)]"
            title="research dependency"
            data-testid="engine-auto-dep"
          >
            dep
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1 px-2 pb-1 pl-3">
        {utilityBuses.map((bus) => {
          const nature = NATURE_PORT_VISUALS[BUS_NATURE[bus]];
          return (
            <span
              key={bus}
              className="rounded border px-1 py-0.5 text-[7px]"
              style={{
                borderColor: `${nature.color}66`,
                color: nature.color,
              }}
            >
              {BUS_LABELS[bus]}
            </span>
          );
        })}
      </div>
    </div>
  );
});
