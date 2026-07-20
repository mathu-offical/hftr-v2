import { describe, expect, it } from 'vitest';
import {
  assertLegalArtifactWire,
  isLegalArtifactFlow,
  moduleConsumesArtifact,
  moduleProducesArtifact,
  portsForModuleType,
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
});
