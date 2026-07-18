import type { LlmProvider, QueueClass } from '@hftr/contracts';

export const BUDGET_QUEUED_ERROR = 'budget_queued';

export const LLM_BUDGET_QUEUE_CLASSES = [
  'RESEARCH',
  'LIBRARY_RESEARCH',
  'POSTURE_RESEARCH',
  'STRATEGIC',
  'TACTICAL',
  'COMPILE',
  'ASSISTANT',
] as const satisfies readonly QueueClass[];

export type LlmBudgetQueueClass = (typeof LLM_BUDGET_QUEUE_CLASSES)[number];

export interface JobCostEstimate {
  provider?: string;
  estimatedCostCents?: number;
  estimatedCalls?: number;
}

export interface BudgetRowSnapshot {
  consumedCalls: number;
  maxCalls: number;
  consumedCostCents: number;
  maxCostCents: number;
  windowMinutes: number;
  windowStartedAt: Date;
}

export function isLlmBudgetQueueClass(queueClass: string): queueClass is LlmBudgetQueueClass {
  return (LLM_BUDGET_QUEUE_CLASSES as readonly string[]).includes(queueClass);
}

export function hasNonEmptyCostEstimate(estimate: JobCostEstimate | null | undefined): boolean {
  if (!estimate || typeof estimate !== 'object') return false;
  return (
    estimate.provider !== undefined ||
    estimate.estimatedCostCents !== undefined ||
    estimate.estimatedCalls !== undefined
  );
}

export function budgetWindowExpired(
  windowStartedAt: Date,
  windowMinutes: number,
  nowMs: number,
): boolean {
  return nowMs - windowStartedAt.getTime() >= windowMinutes * 60_000;
}

export function effectiveBudgetConsumption(
  budget: BudgetRowSnapshot,
  nowMs: number,
): { consumedCalls: number; consumedCostCents: number } {
  if (budgetWindowExpired(budget.windowStartedAt, budget.windowMinutes, nowMs)) {
    return { consumedCalls: 0, consumedCostCents: 0 };
  }
  return {
    consumedCalls: budget.consumedCalls,
    consumedCostCents: budget.consumedCostCents,
  };
}

export function isBudgetExhausted(
  budget: BudgetRowSnapshot,
  estimate: JobCostEstimate,
  nowMs: number,
): boolean {
  const { consumedCalls, consumedCostCents } = effectiveBudgetConsumption(budget, nowMs);
  const nextCalls = consumedCalls + (estimate.estimatedCalls ?? 1);
  const nextCost = consumedCostCents + (estimate.estimatedCostCents ?? 0);
  return nextCalls > budget.maxCalls || nextCost > budget.maxCostCents;
}

export function shouldDeferForBudget(opts: {
  queueClass: string;
  companyId: string | null;
  costEstimate: JobCostEstimate | null | undefined;
  budget: BudgetRowSnapshot | null;
  nowMs: number;
}): boolean {
  if (!opts.companyId) return false;
  if (!isLlmBudgetQueueClass(opts.queueClass)) return false;
  if (!hasNonEmptyCostEstimate(opts.costEstimate)) return false;
  if (!opts.budget) return false;
  return isBudgetExhausted(opts.budget, opts.costEstimate ?? {}, opts.nowMs);
}

export function resolveBudgetProvider(estimate: JobCostEstimate): LlmProvider | null {
  if (!estimate.provider) return null;
  const providers: LlmProvider[] = [
    'anthropic',
    'mistral',
    'groq',
    'cerebras',
    'fireworks',
    'openrouter',
  ];
  return providers.includes(estimate.provider as LlmProvider)
    ? (estimate.provider as LlmProvider)
    : null;
}
