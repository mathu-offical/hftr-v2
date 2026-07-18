'use client';

import { useMemo } from 'react';
import { useEdges, useNodes } from '@xyflow/react';
import {
  moduleStreamPorts,
  splitCompactModuleName,
  type LinkKind,
  type ModuleType,
  type StreamPortSpec,
} from '@hftr/contracts';

function peerLabelFromNodeData(data: Record<string, unknown> | undefined): string {
  if (!data) return 'Node';
  const base =
    typeof data.generatedNameBase === 'string' && data.generatedNameBase.trim()
      ? data.generatedNameBase
      : typeof data.name === 'string'
        ? data.name
        : 'Node';
  return splitCompactModuleName(base).primary;
}

/** Live bus + per-dependency stream ports for a canvas module / Math tool. */
export function useModuleStreamPorts(
  moduleId: string,
  moduleType: ModuleType,
): { inbound: StreamPortSpec[]; outbound: StreamPortSpec[] } {
  const edges = useEdges();
  const nodes = useNodes();

  return useMemo(() => {
    const labelById = new Map<string, string>();
    for (const node of nodes) {
      if (node.type !== 'module' && node.type !== 'mathTool') continue;
      labelById.set(node.id, peerLabelFromNodeData(node.data as Record<string, unknown>));
    }

    const links = edges
      .filter((edge) => edge.source === moduleId || edge.target === moduleId)
      .map((edge) => {
        const linkKind =
          ((edge.data as { linkKind?: LinkKind } | undefined)?.linkKind as LinkKind | undefined) ??
          'data_feed';
        return {
          fromModuleId: edge.source,
          toModuleId: edge.target,
          linkKind,
          fromLabel: labelById.get(edge.source) ?? 'Node',
          toLabel: labelById.get(edge.target) ?? 'Node',
        };
      });

    return moduleStreamPorts({
      type: moduleType,
      moduleId,
      links,
    });
  }, [edges, nodes, moduleId, moduleType]);
}
