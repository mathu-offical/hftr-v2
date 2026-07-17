import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AssistantGetResponse,
  AssistantMessage,
  AssistantPostInput,
  AssistantPostResponse,
  AssistantReadTool,
  AssistantToolResultSummary,
  normalizeAssistantToolResultsFromDb,
  parseAssistantToolResultsForPersistence,
} from './assistant';
import { ENVIRONMENT_REQUIREMENTS } from './env';
import { HandoffEnvelope } from './foundation';
import {
  allowedLinkKinds,
  CapitalAllocationInput,
  missingModuleSetupFields,
  MODULE_CONFIG_SCHEMAS,
  ModuleType,
  requiredModuleSetupFields,
} from './modules';
import { ValueRefHandle, CalcRequest } from './numeric';
import { ActionInstruction } from './pipeline';
import {
  DEFAULT_PHILOSOPHY_PROFILE,
  normalizePhilosophyProfile,
  philosophyProfileToLeverState,
  PhilosophyProfile,
  RISK_APPETITE_SIZING_BPS,
} from './philosophy';
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

describe('module inline setup', () => {
  it('requires capital and exit only for capital-bearing nodes', () => {
    expect(requiredModuleSetupFields('trading')).toEqual([
      'capital_allocation',
      'target_exit',
      'topic_sector',
    ]);
    expect(requiredModuleSetupFields('holding_fund')).toEqual([
      'capital_allocation',
      'target_exit',
    ]);
    expect(requiredModuleSetupFields('math')).toEqual([]);
  });

  it('derives missing setup fields without raw numeric values', () => {
    expect(
      missingModuleSetupFields('trading', {
        topicSectors: [],
        capitalAllocationRef: null,
        targetExitRef: 'nv_exit',
      }),
    ).toEqual(['capital_allocation', 'topic_sector']);
  });

  it('validates fixed and percentage allocation strings', () => {
    expect(CapitalAllocationInput.safeParse({ mode: 'amount', value: '1250.50' }).success).toBe(
      true,
    );
    expect(CapitalAllocationInput.safeParse({ mode: 'percentage', value: '25.125' }).success).toBe(
      true,
    );
    expect(CapitalAllocationInput.safeParse({ mode: 'percentage', value: '100.01' }).success).toBe(
      false,
    );
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
        const from =
          l.fromIndex === 'math' ? ({ type: 'math' } as const) : template.modules[l.fromIndex];
        const to = l.toIndex === 'math' ? ({ type: 'math' } as const) : template.modules[l.toIndex];
        expect(from, `${template.id} link from`).toBeDefined();
        expect(to, `${template.id} link to`).toBeDefined();
        expect(
          allowedLinkKinds(from!.type, to!.type),
          `${template.id}: ${from!.type}->${to!.type}`,
        ).toContain(l.linkKind);
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
        const from =
          l.fromIndex === 'math' ? ({ type: 'math' } as const) : engine.modules[l.fromIndex];
        const to = l.toIndex === 'math' ? ({ type: 'math' } as const) : engine.modules[l.toIndex];
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

describe('assistant contracts', () => {
  const messageId = '00000000-0000-4000-8000-000000000001';
  const createdAt = '2026-07-17T12:00:00.000Z';

  it('parses POST input bounds', () => {
    expect(AssistantPostInput.safeParse({ message: 'hi' }).success).toBe(true);
    expect(AssistantPostInput.safeParse({ message: '' }).success).toBe(false);
    expect(AssistantPostInput.safeParse({ message: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('accepts ok and failed summary cards', () => {
    expect(
      AssistantToolResultSummary.parse({
        tool: 'queue_status',
        summary: 'No pending or active jobs for this company',
        status: 'ok',
      }),
    ).toMatchObject({ status: 'ok' });

    expect(
      AssistantToolResultSummary.parse({
        tool: 'positions',
        summary: 'Lookup failed for positions. Try again or rephrase.',
        status: 'failed',
      }),
    ).toMatchObject({ status: 'failed' });
  });

  it('rejects detailed data fields on persistence parse', () => {
    expect(() =>
      parseAssistantToolResultsForPersistence([
        {
          tool: 'company_summary',
          summary: 'Acme · paper · 3 modules',
          data: { seedCreditsCents: '10000' },
        },
      ]),
    ).toThrow();

    expect(
      AssistantToolResultSummary.safeParse({
        tool: 'trends',
        summary: '2 trend candidates',
        extra: 'unexpected',
      }).success,
    ).toBe(false);
  });

  it('strips legacy detailed data when normalizing from db', () => {
    const normalized = normalizeAssistantToolResultsFromDb([
      {
        tool: 'queue_status',
        summary: '0 pending · 0 active jobs',
        data: { stats: [{ status: 'pending', count: 0 }] },
      },
    ]);
    expect(normalized).toEqual([
      { tool: 'queue_status', summary: '0 pending · 0 active jobs', status: 'ok' },
    ]);
    expect(normalized?.[0]).not.toHaveProperty('data');
  });

  it('round-trips GET and POST responses with summary cards only', () => {
    const card = {
      tool: 'capabilities' as const,
      summary: 'company summary, module status, recent executions',
      status: 'ok' as const,
    };
    const message = {
      id: messageId,
      role: 'assistant' as const,
      content: 'Read-only lookup via queue status: none.',
      toolResults: [card],
      createdAt,
    };
    expect(AssistantMessage.parse(message)).toEqual(message);

    const getResponse = AssistantGetResponse.parse({ messages: [message] });
    expect(getResponse.messages).toHaveLength(1);

    const postResponse = AssistantPostResponse.parse({
      userMessage: { ...message, id: '00000000-0000-4000-8000-000000000002', role: 'user' },
      assistantMessage: message,
    });
    expect(postResponse.assistantMessage.toolResults?.[0]?.tool).toBe('capabilities');
  });

  it('enumerates all read tools including capabilities', () => {
    expect(AssistantReadTool.options).toContain('capabilities');
    expect(AssistantReadTool.options).toContain('queue_status');
  });
});

describe('PhilosophyProfile', () => {
  it('round-trips the default profile and maps to lever band settings', () => {
    const profile = PhilosophyProfile.parse(DEFAULT_PHILOSOPHY_PROFILE);
    expect(profile.version).toBe(1);
    expect(RISK_APPETITE_SIZING_BPS.typical).toBe(75);
    const levers = philosophyProfileToLeverState(profile);
    expect(levers.risk_per_trade_pct_band?.mode).toBe('band');
    expect(normalizePhilosophyProfile(null).axes.risk_appetite).toBe('typical');
  });
});
