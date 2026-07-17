import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENVIRONMENT_REQUIREMENTS } from './env';
import { HandoffEnvelope } from './foundation';
import { allowedLinkKinds, MODULE_CONFIG_SCHEMAS, ModuleType } from './modules';
import { ValueRefHandle, CalcRequest } from './numeric';
import { ActionInstruction } from './pipeline';
import { COMPANY_TEMPLATES, ENGINE_TEMPLATES } from './templates';

describe('env manifest', () => {
  it('matches .env.example exactly', () => {
    const example = readFileSync(join(__dirname, '../../../.env.example'), 'utf8');
    const exampleVars = new Set(
      example
        .split('\n')
        .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l))
        .map((l) => l.split('=')[0]!),
    );
    const manifestVars = new Set(ENVIRONMENT_REQUIREMENTS.map((r) => r.name));
    expect([...manifestVars].sort()).toEqual([...exampleVars].sort());
  });
});

describe('HandoffEnvelope', () => {
  it('round-trips a valid envelope', () => {
    const envelope = {
      contractVersion: '1.0.0',
      producerRunId: null,
      companyId: '00000000-0000-4000-8000-000000000001',
      moduleId: null,
      authorityClass: 'DETERMINISTIC',
      mutationClass: 'IMMUTABLE',
      queueClass: 'DISPATCH',
      priorityBand: 'CRITICAL',
      timeoutClass: 'SHORT',
      idempotencyKey: 'abcdefgh',
      replayHash: null,
      controlSnapshotRef: null,
      causationRefs: [],
      expiresAt: null,
    };
    expect(HandoffEnvelope.parse(envelope)).toMatchObject(envelope);
  });
});

describe('link rules', () => {
  it('allows library → trend data_feed and rejects reverse directive', () => {
    expect(allowedLinkKinds('library', 'trend')).toContain('data_feed');
    expect(allowedLinkKinds('trend', 'library')).toHaveLength(0);
  });

  it('has a config schema for every module type', () => {
    for (const type of ModuleType.options) {
      expect(MODULE_CONFIG_SCHEMAS[type]).toBeDefined();
    }
  });
});

describe('NRA typing', () => {
  it('rejects raw numbers where ValueRefHandle is required', () => {
    expect(ValueRefHandle.safeParse({ ref: 'nv_abc' }).success).toBe(true);
    expect(ValueRefHandle.safeParse(42).success).toBe(false);
    expect(ValueRefHandle.safeParse({ ref: 'raw_42' }).success).toBe(false);
  });

  it('ActionInstruction quantity must be a ref, never a number', () => {
    const parsed = ActionInstruction.shape.quantityRef.safeParse(100);
    expect(parsed.success).toBe(false);
  });

  it('parses a nested calc expression', () => {
    const req = {
      kind: 'expr',
      expr: {
        op: 'mul',
        args: [
          { op: 'ref', ref: 'nv_a' },
          { op: 'ref', ref: 'nv_b' },
        ],
      },
      outputKind: 'usd_cents',
      outputUnit: 'USD_cents',
    };
    expect(CalcRequest.safeParse(req).success).toBe(true);
  });
});

describe('company templates', () => {
  it('every template module config passes its module-type schema', () => {
    for (const template of Object.values(COMPANY_TEMPLATES)) {
      for (const m of template.modules) {
        const result = MODULE_CONFIG_SCHEMAS[m.type].safeParse(m.config);
        expect(result.success, `${template.id}/${m.name}`).toBe(true);
      }
      for (const l of template.links) {
        expect(template.modules[l.fromIndex]).toBeDefined();
        expect(template.modules[l.toIndex]).toBeDefined();
      }
    }
  });
});

describe('engine templates', () => {
  it('available engines have valid configs, legal links, and resolvable inputs', () => {
    for (const engine of ENGINE_TEMPLATES) {
      if (!engine.available) {
        expect(engine.unavailableReason, engine.id).toBeTruthy();
        continue;
      }
      expect(engine.modules.length, engine.id).toBeGreaterThan(0);
      for (const m of engine.modules) {
        const result = MODULE_CONFIG_SCHEMAS[m.type].safeParse(m.config);
        expect(result.success, `${engine.id}/${m.name}`).toBe(true);
      }
      for (const l of engine.links) {
        const from = engine.modules[l.fromIndex];
        const to = engine.modules[l.toIndex];
        expect(from, `${engine.id} link from`).toBeDefined();
        expect(to, `${engine.id} link to`).toBeDefined();
        expect(
          allowedLinkKinds(from!.type, to!.type),
          `${engine.id}: ${from!.type}->${to!.type}`,
        ).toContain(l.linkKind);
      }
      for (const input of engine.inputs) {
        expect(engine.modules[input.target.moduleIndex], `${engine.id}/${input.key}`).toBeDefined();
      }
    }
  });
});
