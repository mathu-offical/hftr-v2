import { describe, expect, it } from 'vitest';
import type {
  ResearchGraphArticleOrbit,
  ResearchGraphFolderStar,
  ResearchGraphNode,
} from '@hftr/contracts';
import {
  buildConceptArticleIndex,
  buildConceptFolderIndex,
  buildTagSatelliteNodes,
  similarityBandForLink,
} from './galaxy-hierarchy';

const conceptA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const conceptB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const conceptC = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const libId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const topicLarge = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const topicSmall = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const moduleId = '11111111-1111-4111-8111-111111111111';

describe('galaxy-hierarchy', () => {
  it('buildConceptFolderIndex first-wins', () => {
    const folders: ResearchGraphFolderStar[] = [
      {
        folderKey: 'first_folder',
        libraryId: libId,
        label: 'First',
        mass: 3,
        memberConceptIds: [conceptA, conceptB],
      },
      {
        folderKey: 'second_folder',
        libraryId: libId,
        label: 'Second',
        mass: 5,
        memberConceptIds: [conceptA],
      },
    ];
    const index = buildConceptFolderIndex(folders);
    expect(index.get(conceptA)?.folderKey).toBe('first_folder');
    expect(index.get(conceptB)?.folderKey).toBe('first_folder');
    expect(index.get(conceptA)?.mass).toBe(3);
  });

  it('buildConceptArticleIndex prefers smallest article', () => {
    const articles: ResearchGraphArticleOrbit[] = [
      {
        topicId: topicLarge,
        title: 'Large',
        libraryId: libId,
        folderKey: null,
        memberConceptIds: [conceptA, conceptB, conceptC],
      },
      {
        topicId: topicSmall,
        title: 'Small',
        libraryId: libId,
        folderKey: null,
        memberConceptIds: [conceptA],
      },
    ];
    const index = buildConceptArticleIndex(articles);
    expect(index.get(conceptA)).toBe(topicSmall);
    expect(index.get(conceptB)).toBe(topicLarge);
    expect(index.get(conceptC)).toBe(topicLarge);
  });

  it('similarityBandForLink returns low when missing nodes', () => {
    const node: ResearchGraphNode = {
      id: conceptA,
      moduleId,
      title: 'Test',
      body: 'body',
      tags: [],
      sourceClass: 'operator',
      status: 'active',
    };
    expect(similarityBandForLink(undefined, node)).toBe('low');
    expect(similarityBandForLink(node, undefined)).toBe('low');
    expect(similarityBandForLink(undefined, undefined)).toBe('low');
  });

  it('buildTagSatelliteNodes respects maxPerConcept / maxTotal and skips catalog tags', () => {
    const concepts = [
      {
        id: conceptA,
        moduleId,
        title: 'Concept A',
        body: '',
        tags: ['strategy_families', 'custom_tag_1', 'custom_tag_2', 'baseline_sector'],
        sourceClass: 'operator' as const,
        status: 'active',
        primaryLibraryId: libId,
        x: 10,
        y: 20,
        z: 0,
      },
      {
        id: conceptB,
        moduleId,
        title: 'Concept B',
        body: '',
        tags: ['guardrail_packages', 'another_tag'],
        sourceClass: 'operator' as const,
        status: 'active',
        primaryLibraryId: libId,
      },
    ];

    const sats = buildTagSatelliteNodes(concepts, { maxPerConcept: 2, maxTotal: 100 });
    expect(sats).toHaveLength(3);
    expect(sats.every((s) => s.__kind === 'tag-sat')).toBe(true);
    expect(
      sats.every(
        (s) => !['strategy_families', 'guardrail_packages', 'baseline_sector'].includes(s.tags[0]!),
      ),
    ).toBe(true);
    expect(sats.filter((s) => s.__parentConceptId === conceptA)).toHaveLength(2);
    expect(sats.filter((s) => s.__parentConceptId === conceptB)).toHaveLength(1);

    const capped = buildTagSatelliteNodes(concepts, { maxPerConcept: 1, maxTotal: 2 });
    expect(capped).toHaveLength(2);
    expect(capped[0]?.__parentConceptId).toBe(conceptA);
    expect(capped[1]?.__parentConceptId).toBe(conceptB);
  });
});
