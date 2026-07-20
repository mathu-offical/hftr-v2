import { describe, expect, it } from 'vitest';
import { buildPcbTrace } from './MarketPostureOrthoEdge';

describe('buildPcbTrace', () => {
  it('builds H-V-H hop rail with elbow vias and terminal pads', () => {
    const g = buildPcbTrace({
      sourceX: 0,
      sourceY: 40,
      targetX: 200,
      targetY: 40,
      verticalBridge: false,
      lane: 0,
      stub: 10,
    });
    expect(g.d.startsWith('M ')).toBe(true);
    expect(g.pads).toHaveLength(2);
    expect(g.vias.length).toBeGreaterThanOrEqual(2);
    expect(g.d.includes('L ')).toBe(true);
    const padY = g.pads[0]?.y ?? -1;
    expect(padY % 6).toBe(0);
  });

  it('builds V-H-V rail bridge with bus channel', () => {
    const g = buildPcbTrace({
      sourceX: 100,
      sourceY: 20,
      targetX: 100,
      targetY: 180,
      verticalBridge: true,
      lane: 0,
      stub: 14,
    });
    expect(g.vias.length).toBeGreaterThanOrEqual(3);
    expect(g.labelY).toBeGreaterThan(20);
    expect(g.labelY).toBeLessThan(180);
  });
});
