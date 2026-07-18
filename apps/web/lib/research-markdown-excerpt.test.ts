import { describe, expect, it } from 'vitest';
import {
  excerptResearchMarkdownBody,
  stripLeadingMarkdownH1,
} from './research-markdown-excerpt';

describe('stripLeadingMarkdownH1', () => {
  it('removes a leading title heading', () => {
    expect(stripLeadingMarkdownH1('# Opening range\n\n## Overview\n\nBody.')).toBe(
      '## Overview\n\nBody.',
    );
  });
});

describe('excerptResearchMarkdownBody', () => {
  it('prefers overview prose and skips GFM tables', () => {
    const md = `# Title

## Overview

Opening range breakout is a session structure pattern.

## Identity

| Field | Value |
| --- | --- |
| Catalog | mechanisms |
| Key | opening_range |

## Tools

- [[sys:tool:orb_guard]] — orb guard
`;
    const excerpt = excerptResearchMarkdownBody(md, 200);
    expect(excerpt).toContain('Opening range breakout');
    expect(excerpt).not.toContain('|');
    expect(excerpt).not.toContain('Catalog');
  });
});
