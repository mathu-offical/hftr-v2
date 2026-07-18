import { describe, expect, it } from 'vitest';
import { SystemTopicScope } from '@hftr/contracts';
import { leakLint } from '../calc/leak-lint';
import { validateDocumentShape } from '../research/document-shape';
import { SYSTEM_LIBRARY_REGISTRY } from './system-library-registry';

describe('SYSTEM_LIBRARY_REGISTRY', () => {
  it('covers all six system topic scopes', () => {
    const scopes = new Set(SYSTEM_LIBRARY_REGISTRY.map((entry) => entry.topicScope));
    expect(scopes).toEqual(
      new Set([
        SystemTopicScope.MOVERS,
        SystemTopicScope.EXECUTION_LOGS,
        SystemTopicScope.DAILY_SUMMARIES,
        SystemTopicScope.RUNTIME_POLICIES,
        SystemTopicScope.TREND_LISTS,
        SystemTopicScope.SECTOR_NEWS,
      ]),
    );
  });

  it('includes movers lenses plus daily movers report placeholder', () => {
    const movers = SYSTEM_LIBRARY_REGISTRY.find((e) => e.topicScope === SystemTopicScope.MOVERS);
    expect(movers?.placeholderSeeds).toHaveLength(4);
    const kinds = movers!.placeholderSeeds.map((seed) => seed.docKind);
    expect(kinds.filter((k) => k === 'movers_lens')).toHaveLength(3);
    expect(kinds).toContain('movers_report');
    expect(movers!.placeholderSeeds.some((s) => s.title === 'daily_movers_report')).toBe(true);
  });

  it('leak-lints and validates shape for every placeholder seed', () => {
    for (const entry of SYSTEM_LIBRARY_REGISTRY) {
      for (const seed of entry.placeholderSeeds) {
        const lint = leakLint(seed.body, []);
        expect(lint.ok, `leak on ${seed.title}`).toBe(true);
        expect(seed.body).not.toMatch(/\d/);

        const shape = validateDocumentShape({
          kind: seed.docKind,
          body: seed.body,
          tags: [...entry.kindTags],
          sourceRef: seed.sourceRef,
        });
        expect(shape.ok, `${seed.title}: ${shape.failedChecks.join(', ')}`).toBe(true);
      }
    }
  });

  it('schedules movers, sector news, and daily summaries', () => {
    const scheduled = SYSTEM_LIBRARY_REGISTRY.filter((e) => e.scheduleKind).map(
      (e) => e.topicScope,
    );
    expect(scheduled).toEqual(
      expect.arrayContaining([
        SystemTopicScope.MOVERS,
        SystemTopicScope.SECTOR_NEWS,
        SystemTopicScope.DAILY_SUMMARIES,
      ]),
    );
  });
});
