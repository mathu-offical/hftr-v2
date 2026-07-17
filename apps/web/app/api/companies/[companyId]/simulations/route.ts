import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  CreateSimulationRunInput,
  SimulationComparisonSummary,
  SimulationRun,
  SimulationRunsResponse,
} from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { simulationRuns } from '@hftr/db/schema';
import { createSystemClock, enqueue } from '@hftr/engine';
import { parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

function serializeRun(row: typeof simulationRuns.$inferSelect): SimulationRun {
  return SimulationRun.parse({
    id: row.id,
    companyId: row.companyId,
    moduleId: row.moduleId,
    label: row.label,
    status: row.status,
    config: row.config as Record<string, unknown>,
    resultSummary: row.resultSummary as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function buildComparison(runs: SimulationRun[]): SimulationComparisonSummary | undefined {
  const completed = runs.filter((run) => run.status === 'completed');
  if (completed.length < 2) return undefined;

  const statusCounts = new Map<string, number>();
  for (const run of runs) {
    statusCounts.set(run.status, (statusCounts.get(run.status) ?? 0) + 1);
  }
  const statusPart = [...statusCounts.entries()]
    .map(([status, count]) => `${count} ${status}`)
    .join(', ');
  const labelPart = completed.map((run) => run.label).join('; ');

  return SimulationComparisonSummary.parse({
    runIds: completed.map((run) => run.id),
    deltaSummary:
      `Compared ${completed.length} completed runs. ` +
      `Status mix across listed runs: ${statusPart}. ` +
      `Completed labels: ${labelPart}.`,
  });
}

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const rows = await db
      .select()
      .from(simulationRuns)
      .where(eq(simulationRuns.companyId, companyId))
      .orderBy(desc(simulationRuns.createdAt))
      .limit(100);
    const runs = rows.map(serializeRun);
    const comparison = buildComparison(runs);
    return SimulationRunsResponse.parse({
      runs,
      ...(comparison !== undefined ? { comparison } : {}),
    });
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, CreateSimulationRunInput);
    if (input.moduleId) {
      await scoping.getOwnedModule(db, clerkUserId, companyId, input.moduleId);
    }
    const [row] = await db
      .insert(simulationRuns)
      .values({
        companyId,
        moduleId: input.moduleId ?? null,
        label: input.label,
        status: 'pending',
        config: input.config,
        resultSummary: {},
      })
      .returning();
    if (!row) throw new Error('insert_failed');

    const clock = createSystemClock();
    await enqueue(db, clock, {
      queueClass: 'VERIFY',
      kind: 'simulation.run',
      payload: { companyId, runId: row.id },
      idempotencyKey: `simulation-run-${row.id}`,
      priority: 'NORMAL',
      companyId,
      moduleId: row.moduleId,
    });

    return { run: serializeRun(row) };
  });
}
