import { describe, expect, it } from 'vitest';
import type { ServiceCoverageSummary } from './summarize-company-service-coverage';

/** Pure gap aggregation for directory cards (D-090). */
function summarizeFromMaps(args: {
  moduleTypes: string[];
  requiredByType: Record<string, string[]>;
  boundByModuleIndex: Map<number, Set<string>>;
}): ServiceCoverageSummary {
  const missingRequired = new Set<string>();
  let modulesWithRequiredGaps = 0;
  let boundCapabilityCount = 0;

  args.moduleTypes.forEach((type, index) => {
    const required = args.requiredByType[type] ?? [];
    const bound = args.boundByModuleIndex.get(index) ?? new Set<string>();
    boundCapabilityCount += bound.size;
    const gaps = required.filter((cap) => !bound.has(cap));
    if (gaps.length > 0) {
      modulesWithRequiredGaps += 1;
      for (const cap of gaps) missingRequired.add(cap);
    }
  });

  return {
    moduleCount: args.moduleTypes.length,
    modulesWithRequiredGaps,
    missingRequiredCapabilities: [...missingRequired].sort() as ServiceCoverageSummary['missingRequiredCapabilities'],
    boundCapabilityCount,
  };
}

describe('summarizeCompanyServiceCoverage (pure)', () => {
  it('reports required gaps and bound counts', () => {
    const summary = summarizeFromMaps({
      moduleTypes: ['trading', 'math'],
      requiredByType: {
        trading: ['market_quotes', 'trade_execution'],
        math: [],
      },
      boundByModuleIndex: new Map([[0, new Set(['market_quotes'])]]),
    });
    expect(summary.modulesWithRequiredGaps).toBe(1);
    expect(summary.missingRequiredCapabilities).toEqual(['trade_execution']);
    expect(summary.boundCapabilityCount).toBe(1);
  });
});
