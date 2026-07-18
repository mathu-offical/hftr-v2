import { describe, expect, it } from 'vitest';
import {
  collectSectorSeedTargets,
  resolveSectorSeedTargetFromLabel,
  sectorFolderTag,
} from './sector-focus-seed-map';

describe('sector-focus-seed-map', () => {
  it('maps Semiconductors to technology + semiconductors subsector', () => {
    expect(resolveSectorSeedTargetFromLabel('Semiconductors')).toEqual({
      sectorKey: 'technology',
      subsectorKey: 'semiconductors',
    });
  });

  it('collects unique sector keys from focus labels', () => {
    const { sectorKeys, subsectorKeysBySector } = collectSectorSeedTargets([
      'Semiconductors',
      'Cybersecurity',
      'Banks & financials',
    ]);
    expect(sectorKeys.sort()).toEqual(['financials', 'technology']);
    expect([...subsectorKeysBySector.get('technology')!].sort()).toEqual([
      'cybersecurity',
      'semiconductors',
    ]);
  });

  it('builds sector folder tags', () => {
    expect(sectorFolderTag('technology')).toBe('sector_technology');
  });
});
