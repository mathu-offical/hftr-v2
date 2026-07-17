import { describe, expect, it } from 'vitest';
import { leakLint } from './leak-lint';
import {
  AllocateFundsProposal,
  AssistantEditProposal,
  AssistantModelProposalOutput,
  validateAllocateFundsAmount,
} from './assistant-edits';

describe('assistant edit proposals (llm-pipeline §7)', () => {
  const moduleId = '00000000-0000-4000-8000-000000000010';
  const otherModuleId = '00000000-0000-4000-8000-000000000011';
  const messageId = '00000000-0000-4000-8000-000000000099';

  it('parses create_module and rename_module proposals', () => {
    expect(
      AssistantEditProposal.parse({
        tool: 'create_module',
        type: 'research',
        name: 'Macro Desk',
        config: { topicScope: 'macro', curiosity: 'balanced', cadenceMinutes: 180 },
      }),
    ).toMatchObject({ tool: 'create_module', name: 'Macro Desk' });
    expect(
      AssistantEditProposal.parse({
        tool: 'rename_module',
        moduleId,
        name: 'Renamed',
      }),
    ).toMatchObject({ tool: 'rename_module', name: 'Renamed' });
  });

  it('accepts update_module_config and legacy patch_module_config', () => {
    expect(
      AssistantEditProposal.parse({
        tool: 'update_module_config',
        moduleId,
        configPatch: { focus: 'energy' },
      }).tool,
    ).toBe('update_module_config');
    expect(
      AssistantEditProposal.parse({
        tool: 'patch_module_config',
        moduleId,
        configPatch: { focus: 'energy' },
      }).tool,
    ).toBe('patch_module_config');
  });

  it('parses link_modules, set_policy, create_watchlist, trigger_tier', () => {
    expect(
      AssistantEditProposal.parse({
        tool: 'link_modules',
        fromModuleId: moduleId,
        toModuleId: otherModuleId,
        linkKind: 'data_feed',
      }),
    ).toMatchObject({ tool: 'link_modules', linkKind: 'data_feed' });
    expect(
      AssistantEditProposal.parse({
        tool: 'set_policy',
        moduleId,
        policyEnvelopeRef: 'paper_balanced_general_v1',
      }),
    ).toMatchObject({ tool: 'set_policy', policyEnvelopeRef: 'paper_balanced_general_v1' });
    expect(
      AssistantEditProposal.parse({
        tool: 'create_watchlist',
        moduleId,
        symbols: ['SPY'],
      }),
    ).toMatchObject({ tool: 'create_watchlist', symbols: ['SPY'] });
    expect(
      AssistantEditProposal.parse({
        tool: 'trigger_tier',
        moduleId,
      }).tool,
    ).toBe('trigger_tier');
  });

  it('allocate_funds requires amountCents xor amountFrom', () => {
    const apiProposal = {
      tool: 'allocate_funds' as const,
      fromKind: 'company_pool' as const,
      toKind: 'module' as const,
      toModuleId: moduleId,
      amountCents: '50000',
    };
    expect(validateAllocateFundsAmount(AllocateFundsProposal.parse(apiProposal))).toBe(true);
    const spanProposal = {
      tool: 'allocate_funds' as const,
      fromKind: 'company_pool' as const,
      toKind: 'module' as const,
      toModuleId: moduleId,
      amountFrom: { messageId, spanStart: 10, spanEnd: 15 },
    };
    expect(validateAllocateFundsAmount(AllocateFundsProposal.parse(spanProposal))).toBe(true);
    const missing = {
      tool: 'allocate_funds' as const,
      fromKind: 'company_pool' as const,
      toKind: 'module' as const,
      toModuleId: moduleId,
    };
    expect(validateAllocateFundsAmount(AllocateFundsProposal.parse(missing))).toBe(false);
  });

  it('parses model output envelope without raw allocate amounts', () => {
    const out = AssistantModelProposalOutput.parse({
      proposal: {
        tool: 'allocate_funds',
        fromKind: 'company_pool',
        toKind: 'module',
        toModuleId: moduleId,
        amountFrom: { messageId, spanStart: 9, spanEnd: 14 },
      },
      rationale: 'user asked to move funds',
    });
    expect(out.proposal?.tool).toBe('allocate_funds');
    expect(out.proposal && 'amountCents' in out.proposal && out.proposal.amountCents).toBeFalsy();
    expect(leakLint({ rationale: out.rationale, tool: out.proposal?.tool }, []).ok).toBe(true);
  });
});
