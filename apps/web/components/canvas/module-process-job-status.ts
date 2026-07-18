import type { ProcessLayerDef } from '@hftr/contracts';

export interface ModuleJobSummaryRow {
  kind: string;
  status: 'pending' | 'active' | 'dead';
  lastError: string | null;
  budgetQueued: boolean;
}

const HANDLER_TO_LAYER: Record<string, string> = {
  'research.gather': 'gather',
  'research.validate': 'validate',
  'research.synthesize': 'synthesize_admit',
  'research.admit': 'synthesize_admit',
  'research.curate': 'gather',
  'research.strategic': 'synthesize_admit',
  'research.company_sweep': 'gather',
  'trend.scan': 'scan',
  'trend.promote': 'lead',
  'tactical.expand': 'tree',
  'compile.select': 'compile',
  'dispatch.paper_trade': 'dispatch',
  'verify.reconcile_order': 'loop_refine',
  'simulation.run': 'paper_parallel',
  'analyzer.summarize': 'reconcile',
  'analyzer.concat': 'concat_emit',
};

export function layerIdForJobKind(kind: string, layers: readonly ProcessLayerDef[]): string | null {
  const explicit = HANDLER_TO_LAYER[kind];
  if (explicit && layers.some((layer) => layer.id === explicit)) return explicit;

  for (const layer of layers) {
    if (kind.includes(layer.id)) return layer.id;
    for (const ref of layer.v1Refs) {
      if (kind.includes(ref) || kind.includes(ref.replace(/\./g, '_'))) return layer.id;
    }
  }
  return null;
}

export function composeLayerQueueStatusText(moduleJobs: ModuleJobSummaryRow[]): string {
  const active = moduleJobs.filter((job) => job.status === 'active').length;
  const dead = moduleJobs.filter((job) => job.status === 'dead').length;
  const budgetHeld = moduleJobs.filter(
    (job) => job.status === 'pending' && job.budgetQueued,
  ).length;
  const pending = moduleJobs.filter((job) => job.status === 'pending' && !job.budgetQueued).length;

  if (active > 0) return `active · ${active}`;
  if (dead > 0) return `dead · ${dead}`;
  if (budgetHeld > 0) return `budget held · ${budgetHeld}`;
  if (pending > 0) return `pending · ${pending}`;
  return 'idle';
}

export function partitionJobsByLayer(
  moduleJobs: ModuleJobSummaryRow[],
  layers: readonly ProcessLayerDef[],
): {
  byLayer: Map<string, ModuleJobSummaryRow[]>;
  unmapped: ModuleJobSummaryRow[];
} {
  const byLayer = new Map<string, ModuleJobSummaryRow[]>();
  const unmapped: ModuleJobSummaryRow[] = [];

  for (const job of moduleJobs) {
    const layerId = layerIdForJobKind(job.kind, layers);
    if (layerId == null) {
      unmapped.push(job);
      continue;
    }
    const bucket = byLayer.get(layerId);
    if (bucket) bucket.push(job);
    else byLayer.set(layerId, [job]);
  }

  return { byLayer, unmapped };
}

export function firstQueueErrorSnippet(jobs: ModuleJobSummaryRow[]): string | null {
  for (const job of jobs) {
    if (job.lastError && job.lastError !== 'budget_queued') return job.lastError;
  }
  return null;
}
