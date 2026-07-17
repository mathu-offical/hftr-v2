import { z } from 'zod';

export const SimulationRunStatus = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'canceled',
]);
export type SimulationRunStatus = z.infer<typeof SimulationRunStatus>;

export const SimulationRun = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  moduleId: z.string().uuid().nullable(),
  label: z.string(),
  status: SimulationRunStatus,
  config: z.record(z.string(), z.unknown()),
  resultSummary: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SimulationRun = z.infer<typeof SimulationRun>;

export const CreateSimulationRunInput = z.object({
  moduleId: z.string().uuid().optional(),
  label: z.string().min(1).max(120),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type CreateSimulationRunInput = z.infer<typeof CreateSimulationRunInput>;

/** Text-first comparison when two or more runs have completed. */
export const SimulationComparisonSummary = z.object({
  runIds: z.array(z.string().uuid()),
  deltaSummary: z.string(),
});
export type SimulationComparisonSummary = z.infer<typeof SimulationComparisonSummary>;

export const SimulationRunsResponse = z.object({
  runs: z.array(SimulationRun),
  comparison: SimulationComparisonSummary.optional(),
});
export type SimulationRunsResponse = z.infer<typeof SimulationRunsResponse>;
