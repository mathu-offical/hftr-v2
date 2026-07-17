import { and, eq } from 'drizzle-orm';
import type { LlmProvider } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { llmBudgets } from '@hftr/db/schema';

export interface BudgetScopeRef {
  scope: 'user' | 'company' | 'module';
  scopeId: string;
}

export interface BudgetAdmitResult {
  ok: boolean;
  failure?: 'budget_exceeded';
}

function windowExpired(windowStartedAt: Date, windowMinutes: number): boolean {
  return Date.now() - windowStartedAt.getTime() >= windowMinutes * 60_000;
}

async function refreshBudgetWindow(db: Db, budgetId: string, windowMinutes: number): Promise<void> {
  await db
    .update(llmBudgets)
    .set({
      consumedCalls: 0,
      consumedCostCents: 0,
      windowStartedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(llmBudgets.id, budgetId));
}

async function admitScope(
  db: Db,
  scope: BudgetScopeRef,
  provider: LlmProvider,
  estimatedCostCents: number,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(llmBudgets)
    .where(
      and(
        eq(llmBudgets.scope, scope.scope),
        eq(llmBudgets.scopeId, scope.scopeId),
        eq(llmBudgets.provider, provider),
      ),
    )
    .limit(1);

  const budget = rows[0];
  if (!budget) {
    return true;
  }

  if (windowExpired(budget.windowStartedAt, budget.windowMinutes)) {
    await refreshBudgetWindow(db, budget.id, budget.windowMinutes);
    budget.consumedCalls = 0;
    budget.consumedCostCents = 0;
  }

  if (budget.consumedCalls + 1 > budget.maxCalls) {
    return false;
  }
  if (budget.consumedCostCents + estimatedCostCents > budget.maxCostCents) {
    return false;
  }
  return true;
}

export function budgetScopesForCall(
  clerkUserId: string,
  companyId: string,
  moduleId: string | null,
): BudgetScopeRef[] {
  const scopes: BudgetScopeRef[] = [
    { scope: 'user', scopeId: clerkUserId },
    { scope: 'company', scopeId: companyId },
  ];
  if (moduleId) {
    scopes.push({ scope: 'module', scopeId: moduleId });
  }
  return scopes;
}

export async function admitBudget(
  db: Db,
  scopes: BudgetScopeRef[],
  provider: LlmProvider,
  estimatedCostCents: number,
): Promise<BudgetAdmitResult> {
  for (const scope of scopes) {
    const allowed = await admitScope(db, scope, provider, estimatedCostCents);
    if (!allowed) {
      return { ok: false, failure: 'budget_exceeded' };
    }
  }
  return { ok: true };
}

async function consumeScope(
  db: Db,
  scope: BudgetScopeRef,
  provider: LlmProvider,
  costCents: number,
): Promise<void> {
  const rows = await db
    .select()
    .from(llmBudgets)
    .where(
      and(
        eq(llmBudgets.scope, scope.scope),
        eq(llmBudgets.scopeId, scope.scopeId),
        eq(llmBudgets.provider, provider),
      ),
    )
    .limit(1);

  const budget = rows[0];
  if (!budget) {
    return;
  }

  if (windowExpired(budget.windowStartedAt, budget.windowMinutes)) {
    await refreshBudgetWindow(db, budget.id, budget.windowMinutes);
  }

  await db
    .update(llmBudgets)
    .set({
      consumedCalls: budget.consumedCalls + 1,
      consumedCostCents: budget.consumedCostCents + costCents,
      updatedAt: new Date(),
    })
    .where(eq(llmBudgets.id, budget.id));
}

export async function consumeBudget(
  db: Db,
  scopes: BudgetScopeRef[],
  provider: LlmProvider,
  costCents: number,
): Promise<void> {
  for (const scope of scopes) {
    await consumeScope(db, scope, provider, costCents);
  }
}
