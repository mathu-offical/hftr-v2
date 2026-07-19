import { describe, expect, it } from 'vitest';
import {
  folderSimilarityRestMul,
  seedFolderRelationPairCount,
  seedFolderSimilarityBand,
} from './galaxy-folder-similarity';

describe('galaxy-folder-similarity (D-164)', () => {
  it('scores curated catalog pairs as high/medium', () => {
    expect(seedFolderSimilarityBand('strategy_families', 'compound_strategies')).toBe('high');
    expect(seedFolderSimilarityBand('guardrail_packages', 'compliance_packages')).toBe('high');
    expect(seedFolderSimilarityBand('strategy_families', 'sector_seeds')).toBe('medium');
    expect(seedFolderRelationPairCount()).toBeGreaterThan(10);
  });

  it('defaults unspecified or runtime pairs to low', () => {
    expect(seedFolderSimilarityBand('compliance_packages', 'trend_lead_patterns')).toBe('low');
    expect(seedFolderSimilarityBand('runtime', 'strategy_families')).toBe('low');
    expect(seedFolderSimilarityBand('strategy_families', 'strategy_families')).toBe('high');
  });

  it('maps bands to rest multipliers (high closer than low)', () => {
    expect(folderSimilarityRestMul('high')).toBeLessThan(folderSimilarityRestMul('medium'));
    expect(folderSimilarityRestMul('medium')).toBeLessThan(folderSimilarityRestMul('low'));
  });
});
