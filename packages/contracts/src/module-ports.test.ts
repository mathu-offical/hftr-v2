import { describe, expect, it } from 'vitest';
import {
  assertLegalArtifactWire,
  assertLinkArtifactKinds,
  isLegalArtifactFlow,
  moduleConsumesArtifact,
  moduleProducesArtifact,
  portsForModuleType,
  resolveArtifactKindsForLink,
} from './module-ports';

describe('module-ports (D-240)', () => {
  it('declares ports for trading spine types', () => {
    expect(portsForModuleType('trading').length).toBeGreaterThan(3);
    expect(moduleProducesArtifact('trend', 'lead_package')).toBe(true);
    expect(moduleConsumesArtifact('trading', 'lead_package')).toBe(true);
  });

  it('allows lead → tree → plan → instruction flows', () => {
    expect(isLegalArtifactFlow('lead_package', 'decision_tree')).toBe(true);
    expect(isLegalArtifactFlow('decision_tree', 'executable_state')).toBe(true);
    expect(isLegalArtifactFlow('order_composition_plan', 'action_instruction')).toBe(true);
  });

  it('fail-closed on illegal producer/consumer pairs', () => {
    const bad = assertLegalArtifactWire({
      fromType: 'research',
      toType: 'trading',
      fromKind: 'research_article',
      toKind: 'action_instruction',
    });
    expect(bad.ok).toBe(false);
    const good = assertLegalArtifactWire({
      fromType: 'trend',
      toType: 'trading',
      fromKind: 'lead_package',
      toKind: 'lead_package',
    });
    expect(good.ok).toBe(true);
  });

  it('resolves directive trend→trading to lead_package', () => {
    expect(
      resolveArtifactKindsForLink({
        fromType: 'trend',
        toType: 'trading',
        linkKind: 'directive',
      }),
    ).toEqual({ fromKind: 'lead_package', toKind: 'lead_package' });
    expect(
      assertLinkArtifactKinds({
        fromType: 'trend',
        toType: 'trading',
        linkKind: 'directive',
      }).ok,
    ).toBe(true);
  });

  it('allows holding_fund→fund_router fund_route (D-229)', () => {
    expect(
      assertLinkArtifactKinds({
        fromType: 'holding_fund',
        toType: 'fund_router',
        linkKind: 'fund_route',
      }).ok,
    ).toBe(true);
  });

  it('allows verification trading→analyzer via action_instruction', () => {
    expect(
      assertLinkArtifactKinds({
        fromType: 'trading',
        toType: 'analyzer',
        linkKind: 'verification',
      }).ok,
    ).toBe(true);
  });
});
