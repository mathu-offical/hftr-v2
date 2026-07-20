import { describe, expect, it } from 'vitest';
import { moduleFunctionLabel } from './modules';

describe('moduleFunctionLabel hub feed analyzers (D-216)', () => {
  it('labels direct and analyzed hub feeds distinctly', () => {
    expect(
      moduleFunctionLabel('analyzer', {
        emitMode: 'to_library',
        hubFeedClass: 'direct',
      }),
    ).toBe('HubDirect');
    expect(
      moduleFunctionLabel('analyzer', {
        emitMode: 'to_desk_stream',
        hubFeedClass: 'analyzed',
      }),
    ).toBe('HubAnalyzed');
  });

  it('falls back to emitMode labels when hubFeedClass absent', () => {
    expect(moduleFunctionLabel('analyzer', { emitMode: 'to_library' })).toBe('LibEmit');
    expect(moduleFunctionLabel('analyzer', { emitMode: 'verify_loopback' })).toBe('ExecMon');
  });
});
