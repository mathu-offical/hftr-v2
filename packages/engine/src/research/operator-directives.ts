import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { qualitativeNormalizeForCompare } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { operatorPhilosophyDirectives } from '@hftr/db/schema';

/**
 * Load recent company (+ optional module) operator directives for model context (D-082).
 * Digit/datetime literals are collapsed before leaving the DB boundary.
 */
export async function loadOperatorDirectiveHints(
  db: Db,
  opts: { companyId: string; moduleId?: string | null; limit?: number },
): Promise<string[]> {
  const limit = opts.limit ?? 8;
  const companyScope = eq(operatorPhilosophyDirectives.companyId, opts.companyId);
  const moduleScope = opts.moduleId
    ? or(
        isNull(operatorPhilosophyDirectives.moduleId),
        eq(operatorPhilosophyDirectives.moduleId, opts.moduleId),
      )
    : undefined;
  const rows = await db
    .select({
      body: operatorPhilosophyDirectives.body,
      moduleId: operatorPhilosophyDirectives.moduleId,
    })
    .from(operatorPhilosophyDirectives)
    .where(moduleScope ? and(companyScope, moduleScope) : companyScope)
    .orderBy(desc(operatorPhilosophyDirectives.createdAt))
    .limit(limit);

  return rows
    .map((r) => qualitativeNormalizeForCompare(r.body).slice(0, 500))
    .filter((s) => s.length > 0);
}
