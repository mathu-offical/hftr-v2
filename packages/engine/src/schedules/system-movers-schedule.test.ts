import { describe, expect, it } from 'vitest';
import { parseScheduleExpr, SYSTEM_MOVERS_CADENCE_MINUTES } from './materialize';

describe('system movers schedule cadence', () => {
  it('parses daily every:1440 interval used by ensureSystemMoversSchedule', () => {
    expect(SYSTEM_MOVERS_CADENCE_MINUTES).toBe(1440);
    expect(parseScheduleExpr(`every:${SYSTEM_MOVERS_CADENCE_MINUTES}`)).toEqual({
      kind: 'interval',
      minutes: 1440,
    });
  });
});
