import { describe, expect, it } from 'vitest';
import { assertNoSecretsInJobPayload, stripSecretsFromJobPayload } from './payload-secrets';

describe('assertNoSecretsInJobPayload', () => {
  it('allows identity + intent payloads', () => {
    expect(() =>
      assertNoSecretsInJobPayload({
        companyId: '00000000-0000-0000-0000-000000000001',
        moduleId: '00000000-0000-0000-0000-000000000002',
        topicScope: 'semiconductors',
        queryText: 'AI supply chain',
      }),
    ).not.toThrow();
  });

  it('rejects research gather key fields', () => {
    expect(() =>
      assertNoSecretsInJobPayload({
        companyId: '00000000-0000-0000-0000-000000000001',
        braveApiKey: 'should-not-be-here',
      }),
    ).toThrow(/job_payload_secret_forbidden:braveApiKey/);
  });

  it('rejects alpaca secret fields', () => {
    expect(() =>
      assertNoSecretsInJobPayload({
        alpacaKeyId: 'PK',
        alpacaSecret: 'secret',
      }),
    ).toThrow(/job_payload_secret_forbidden/);
  });
});

describe('stripSecretsFromJobPayload', () => {
  it('removes forbidden keys and keeps identity fields', () => {
    expect(
      stripSecretsFromJobPayload({
        companyId: 'c1',
        moduleId: 'm1',
        braveApiKey: 'leak',
        alpacaSecret: 'leak',
        topicScope: 'keep',
      }),
    ).toEqual({
      companyId: 'c1',
      moduleId: 'm1',
      topicScope: 'keep',
    });
  });
});
