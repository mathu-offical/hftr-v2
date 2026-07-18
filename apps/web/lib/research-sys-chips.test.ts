import { describe, expect, it } from 'vitest';
import { parseSysChipHref, preprocessSysChips } from './research-sys-chips';

describe('research-sys-chips', () => {
  it('rewrites [[sys:kind:id]] into hftr-sys markdown links', () => {
    const out = preprocessSysChips('Use [[sys:tool:momentum_guard]] then [[sys:catalog:strategies]].');
    expect(out).toContain('[tool:momentum guard](hftr-sys:tool:momentum_guard)');
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
      label: 'size band',
    });
    expect(parseSysChipHref('hftr-sys:field:or_high')).toEqual({
      kind: 'field',
      id: 'or_high',
      label: 'or high',
    });
    expect(parseSysChipHref('https://example.com')).toBeNull();
  });
});
