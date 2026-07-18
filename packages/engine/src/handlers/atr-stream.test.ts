import { describe, expect, it } from 'vitest';
import { getHandler } from './registry';
import './atr-stream';

describe('maintenance.atr_stream handler', () => {
  it('is registered', () => {
    expect(getHandler('maintenance.atr_stream')).toBeTypeOf('function');
  });
});
