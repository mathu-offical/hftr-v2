import { describe, expect, it } from 'vitest';
import { parseSysChipHref, preprocessSysChips } from './research-sys-chips';

describe('research-sys-chips', () => {
  it('rewrites [[sys:kind:id]] into hftr-sys markdown links', () => {
    const out = preprocessSysChips('Use [[sys:tool:momentum_guard]] then [[sys:catalog:strategies]].');
    expect(out).toContain('[tool:momentum_guard](hftr-sys:tool:momentum_guard)');
    expect(out).toContain('[catalog:strategies](hftr-sys:catalog:strategies)');
  });

  it('leaves unknown sys kinds untouched', () => {
    const raw = '[[sys:unknown:x]]';
    expect(preprocessSysChips(raw)).toBe(raw);
  });

  it('parses chip hrefs', () => {
    expect(parseSysChipHref('hftr-sys:lever:size_band')).toEqual({
      kind: 'lever',
      id: 'size_band',
      label: 'size_band',
    });
    expect(parseSysChipHref('https://example.com')).toBeNull();
  });
});
