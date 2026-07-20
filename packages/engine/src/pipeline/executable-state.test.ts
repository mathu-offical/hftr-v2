import { describe, expect, it } from 'vitest';
import {
  evaluateTradingPathExecutableState,
  executableStateAllowsCompose,
} from './executable-state';

describe('executable-state (D-244)', () => {
  const base = {
    leadRef: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    decisionTreeRef: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    tradingModuleId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  };

  it('allows compose when branches exist and session open', () => {
    const state = evaluateTradingPathExecutableState({
      ...base,
      hasBranches: true,
      sessionAllowsOrder: true,
    });
    expect(state.state).toBe('order');
    expect(executableStateAllowsCompose(state)).toBe(true);
  });

  it('blocks empty trees', () => {
    const state = evaluateTradingPathExecutableState({
      ...base,
      hasBranches: false,
      sessionAllowsOrder: true,
    });
    expect(state.state).toBe('blocked');
    expect(executableStateAllowsCompose(state)).toBe(false);
  });

  it('watches when session closed', () => {
    const state = evaluateTradingPathExecutableState({
      ...base,
      hasBranches: true,
      sessionAllowsOrder: false,
    });
    expect(state.state).toBe('watch');
    expect(executableStateAllowsCompose(state)).toBe(false);
  });
});
