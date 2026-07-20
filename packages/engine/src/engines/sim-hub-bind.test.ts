import { describe, expect, it } from 'vitest';
import { SimulationEngineBinding } from '@hftr/contracts';

describe('sim hub bind helpers (D-216)', () => {
  it('accepts linked gate/training bindings with parent execution id', () => {
    const parsed = SimulationEngineBinding.parse({
      role: 'training',
      placement: 'post',
      parentExecutionEngineId: '11111111-1111-4111-8111-111111111111',
      mimicParent: true,
    });
    expect(parsed.parentExecutionEngineId).toBe('11111111-1111-4111-8111-111111111111');
    expect(parsed.role).toBe('training');
  });

  it('rejects linked sims without parentExecutionEngineId', () => {
    const bad = SimulationEngineBinding.safeParse({
      role: 'gate',
      placement: 'pre',
      mimicParent: true,
    });
    expect(bad.success).toBe(false);
  });
});
