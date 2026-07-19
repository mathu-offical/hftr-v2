import { describe, expect, it } from 'vitest';
import { createFixedClock } from '../clock';
import {
  BUDGET_QUEUED_ERROR,
  hasNonEmptyCostEstimate,
  isBudgetExhausted,
  shouldDeferForBudget,
} from './budget-admission';
import { isScheduleDue, parseScheduleExpr, scheduleWindowKey } from '../schedules/materialize';

describe('budget admission helpers', () => {
  const budget = {
    consumedCalls: 10,
    maxCalls: 10,
    consumedCostCents: 50,
    maxCostCents: 100,
    windowMinutes: 60,
    windowStartedAt: new Date('2026-07-17T12:00:00.000Z'),
  };

  it('detects non-empty cost estimates', () => {
    expect(hasNonEmptyCostEstimate({})).toBe(false);
    expect(hasNonEmptyCostEstimate({ provider: 'anthropic' })).toBe(true);
    expect(hasNonEmptyCostEstimate({ estimatedCalls: 1 })).toBe(true);
  });

  it('marks budget exhausted when calls or cost would exceed caps', () => {
    const nowMs = new Date('2026-07-17T12:30:00.000Z').getTime();
    expect(isBudgetExhausted(budget, { estimatedCalls: 1, estimatedCostCents: 0 }, nowMs)).toBe(
      true,
    );
    expect(
      isBudgetExhausted(
        { ...budget, consumedCalls: 5, consumedCostCents: 90 },
        { estimatedCostCents: 20 },
        nowMs,
      ),
    ).toBe(true);
    expect(
      isBudgetExhausted(
        { ...budget, consumedCalls: 5, consumedCostCents: 10 },
        { estimatedCalls: 1, estimatedCostCents: 10 },
        nowMs,
      ),
    ).toBe(false);
  });

  it('resets consumption after the budget window expires', () => {
    const nowMs = new Date('2026-07-17T14:00:00.000Z').getTime();
    expect(isBudgetExhausted(budget, { estimatedCalls: 1, estimatedCostCents: 0 }, nowMs)).toBe(
      false,
    );
  });

  it('defers only LLM queue classes with company budget rows', () => {
    const nowMs = new Date('2026-07-17T12:30:00.000Z').getTime();
    expect(
      shouldDeferForBudget({
        queueClass: 'RESEARCH',
        companyId: 'company-1',
        costEstimate: { provider: 'anthropic', estimatedCalls: 1 },
        budget,
        nowMs,
      }),
    ).toBe(true);
    expect(
      shouldDeferForBudget({
        queueClass: 'DISPATCH',
        companyId: 'company-1',
        costEstimate: { provider: 'anthropic', estimatedCalls: 1 },
        budget,
        nowMs,
      }),
    ).toBe(false);
    expect(
      shouldDeferForBudget({
        queueClass: 'RESEARCH',
        companyId: 'company-1',
        costEstimate: {},
        budget,
        nowMs,
      }),
    ).toBe(false);
  });

  it('exports stable budget_queued marker', () => {
    expect(BUDGET_QUEUED_ERROR).toBe('budget_queued');
  });
});

describe('schedule materialization helpers', () => {
  it('parses every:<minutes>, */N cron, and et:HH:MM expressions', () => {
    expect(parseScheduleExpr('every:180')).toEqual({ kind: 'interval', minutes: 180 });
    expect(parseScheduleExpr('*/15 * * * *')).toEqual({ kind: 'interval', minutes: 15 });
    expect(parseScheduleExpr('et:07:30')).toEqual({ kind: 'daily_et', hour: 7, minute: 30 });
    expect(parseScheduleExpr('0 9 * * *')).toBeNull();
  });

  it('computes due windows from last materialized anchor', () => {
    const clock = createFixedClock(new Date('2026-07-17T13:00:00.000Z').getTime());
    const schedule = {
      cronExpr: 'every:60',
      lastMaterializedWindow: new Date('2026-07-17T12:00:00.000Z'),
      createdAt: new Date('2026-07-17T10:00:00.000Z'),
    };
    expect(isScheduleDue(schedule, clock.nowMs())).toEqual({
      due: true,
      windowStartMs: new Date('2026-07-17T13:00:00.000Z').getTime(),
    });
  });

  it('marks et:HH:MM due once per America/New_York day after the wall clock', () => {
    // 2026-07-17 08:00 EDT = 12:00 UTC
    const afterTrigger = new Date('2026-07-17T12:00:00.000Z').getTime();
    const schedule = {
      cronExpr: 'et:07:30',
      lastMaterializedWindow: null,
      createdAt: new Date('2026-07-16T12:00:00.000Z'),
    };
    const due = isScheduleDue(schedule, afterTrigger);
    expect(due.due).toBe(true);
    const again = isScheduleDue(
      { ...schedule, lastMaterializedWindow: new Date(due.windowStartMs) },
      afterTrigger,
    );
    expect(again.due).toBe(false);
  });

  it('builds stable schedule window keys', () => {
    const key = scheduleWindowKey('schedule-id', new Date('2026-07-17T12:00:00.000Z').getTime());
    expect(key).toBe('schedule-id:2026-07-17T12:00:00.000Z');
  });
});
