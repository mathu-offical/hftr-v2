import { describe, expect, it } from 'vitest';
import {
  COMPANY_SECTOR_FOCUS_MAX,
  CompanySectorFocuses,
  CompanyUniverseExcludes,
  SECTOR_FOCUS_GROUP_DEFS,
  SECTOR_FOCUS_PRESETS,
  addSectorGroup,
  expandSectorGroupsToFocuses,
  groupsFromSectorFocuses,
  overlapPeerLabels,
  parseUniverseExcludeDraft,
  removeSectorGroup,
  toggleSectorFocusInGroups,
} from './sector-focus';

describe('sector-focus groups (D-106)', () => {
  it('expands groups to all group presets', () => {
    const labels = expandSectorGroupsToFocuses(['technology', 'alt']);
    expect(labels.length).toBeGreaterThan(4);
    expect(labels).toContain('Semiconductors');
    expect(labels).toContain('Crypto & digital assets');
    expect(labels.every((label) => CompanySectorFocuses.safeParse([label]).success)).toBe(true);
  });

  it('allows full catalog size for company focuses', () => {
    expect(COMPANY_SECTOR_FOCUS_MAX).toBe(SECTOR_FOCUS_PRESETS.length);
    const all = SECTOR_FOCUS_PRESETS.map((p) => p.label);
    const parsed = CompanySectorFocuses.safeParse(all);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toHaveLength(all.length);
  });

  it('add/remove group and refine-down toggle', () => {
    let focuses = addSectorGroup([], 'finance');
    expect(groupsFromSectorFocuses(focuses)).toEqual(['finance']);
    focuses = toggleSectorFocusInGroups(focuses, 'Insurance', ['finance']);
    expect(focuses).not.toContain('Insurance');
    focuses = removeSectorGroup(focuses, 'finance');
    expect(focuses).toEqual([]);
  });

  it('documents overlap peers for confirmation signals', () => {
    const peers = overlapPeerLabels('Semiconductors');
    expect(peers.length).toBeGreaterThan(0);
    expect(SECTOR_FOCUS_GROUP_DEFS.map((g) => g.id)).toContain('materials');
    expect(SECTOR_FOCUS_GROUP_DEFS.map((g) => g.id)).toContain('communication');
  });

  it('parses universe excludes as uppercase unique symbols', () => {
    expect(parseUniverseExcludeDraft('aapl, msft; goog')).toEqual(['AAPL', 'MSFT', 'GOOG']);
    const parsed = CompanyUniverseExcludes.safeParse(['aapl', 'AAPL', 'msft']);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(['AAPL', 'MSFT']);
  });
});
