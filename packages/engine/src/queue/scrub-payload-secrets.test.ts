import { describe, expect, it } from 'vitest';
import { FORBIDDEN_JOB_PAYLOAD_SECRET_KEYS } from './payload-secrets';

describe('scrubSecretsFromJobPayloads helpers', () => {
  it('forbidden keys cover research + broker secret field names', () => {
    expect(FORBIDDEN_JOB_PAYLOAD_SECRET_KEYS).toContain('braveApiKey');
    expect(FORBIDDEN_JOB_PAYLOAD_SECRET_KEYS).toContain('alpacaSecret');
    expect(FORBIDDEN_JOB_PAYLOAD_SECRET_KEYS).toContain('privateKeyPem');
  });

  it('stripping forbidden keys leaves identity fields', () => {
    const payload: Record<string, unknown> = {
      companyId: 'c1',
      moduleId: 'm1',
      braveApiKey: 'leak',
      alpacaSecret: 'leak',
    };
    for (const key of FORBIDDEN_JOB_PAYLOAD_SECRET_KEYS) {
      delete payload[key];
    }
    expect(payload).toEqual({ companyId: 'c1', moduleId: 'm1' });
  });
});
