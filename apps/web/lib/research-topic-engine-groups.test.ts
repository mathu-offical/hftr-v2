import { describe, expect, it } from 'vitest';
import {
  dedupeLibrariesForScrollUi,
  groupTopicsByResearchEngine,
  researchTopicEngineChip,
} from './research-topic-engine-groups';

describe('research-topic-engine-groups', () => {
  it('groups topics by engine instance and labels chips', () => {
    const engA = '11111111-1111-4111-8111-111111111111';
    const engB = '22222222-2222-4222-8222-222222222222';
    const groups = groupTopicsByResearchEngine([
      {
        moduleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        engineInstanceId: engA,
        engineLabel: 'Research Alpha',
        researchModuleName: 'Desk A',
        title: 'Current awareness',
      },
      {
        moduleId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        engineInstanceId: engB,
        engineLabel: 'Research Beta',
        researchModuleName: 'Desk B',
        title: 'Current awareness',
      },
      {
        moduleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        engineInstanceId: engA,
        engineLabel: 'Research Alpha',
        researchModuleName: 'Desk A',
        title: 'Sector · Semis',
      },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.label).sort()).toEqual(['Research Alpha', 'Research Beta']);
    expect(groups.find((g) => g.label === 'Research Alpha')?.topics).toHaveLength(2);
    expect(
      researchTopicEngineChip({
        moduleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        engineInstanceId: engA,
        engineLabel: 'Research Alpha',
        researchModuleName: 'Desk A',
      }),
    ).toBe('Research Alpha');
  });

  it('falls back to research module name when engine unbound', () => {
    const groups = groupTopicsByResearchEngine([
      {
        moduleId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        engineInstanceId: null,
        engineLabel: null,
        researchModuleName: 'Standalone research',
        title: 'Current awareness',
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('Standalone research');
    expect(groups[0]?.groupKey).toBe('module:cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  });

  it('dedupes shared company libraries in scroll UI but keeps hubs distinct', () => {
    const id1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const id2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const hub1 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const hub2 = '99999999-9999-4999-8999-999999999999';
    const out = dedupeLibrariesForScrollUi([
      {
        id: id1,
        name: 'Seeded trading mechanisms',
        topicScope: 'compile_time_mechanisms',
      },
      {
        id: id2,
        name: 'Seeded trading mechanisms',
        topicScope: 'compile_time_mechanisms',
      },
      { id: hub1, name: 'Hub A', topicScope: 'engine:data_hub', isEngineDataHub: true },
      { id: hub2, name: 'Hub B', topicScope: 'engine:data_hub', isEngineDataHub: true },
    ]);
    expect(out.filter((l) => l.topicScope === 'compile_time_mechanisms')).toHaveLength(1);
    expect(out.filter((l) => l.isEngineDataHub)).toHaveLength(2);
  });
});
