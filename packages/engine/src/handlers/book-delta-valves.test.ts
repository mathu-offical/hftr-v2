import { describe, expect, it } from 'vitest';
import { getHandler } from './registry';
import './book-delta-valves';

describe('maintenance.book_delta_valves handler', () => {
  it('is registered', () => {
    expect(getHandler('maintenance.book_delta_valves')).toBeTypeOf('function');
  });
});
