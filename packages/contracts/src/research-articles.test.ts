import { describe, expect, it } from 'vitest';
import {
  ARTICLE_DISPLAY_TAG_MAX,
  RESEARCH_ARTICLE_TAG,
  articleDisplayTags,
  isResearchArticleConcept,
  isSystemArticleTag,
  withResearchArticleTag,
} from './research-articles';

describe('research-articles (D-127)', () => {
  it('marks system tags including the article marker', () => {
    expect(isSystemArticleTag(RESEARCH_ARTICLE_TAG)).toBe(true);
    expect(isSystemArticleTag('catalog')).toBe(true);
    expect(isSystemArticleTag('sector_tech')).toBe(true);
    expect(isSystemArticleTag('macro')).toBe(false);
  });

  it('detects article concepts via marker tag', () => {
    expect(isResearchArticleConcept(['macro', RESEARCH_ARTICLE_TAG])).toBe(true);
    expect(isResearchArticleConcept(['macro'])).toBe(false);
  });

  it('exposes at most 3 display chips and hides system tags', () => {
    const chips = articleDisplayTags([
      RESEARCH_ARTICLE_TAG,
      'Macro',
      'Rates',
      'Fed',
      'Extra',
      'catalog',
    ]);
    expect(chips).toEqual(['Macro', 'Rates', 'Fed']);
    expect(chips).toHaveLength(ARTICLE_DISPLAY_TAG_MAX);
  });

  it('stamps marker and keeps display tags via withResearchArticleTag', () => {
    expect(withResearchArticleTag(['Alpha', 'Beta', RESEARCH_ARTICLE_TAG])).toEqual([
      RESEARCH_ARTICLE_TAG,
      'Alpha',
      'Beta',
    ]);
  });
});
