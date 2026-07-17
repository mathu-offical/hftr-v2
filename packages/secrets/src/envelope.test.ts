import { afterEach, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, withDecryptedSecret } from './envelope';

const HEX_KEY = 'a'.repeat(64);

afterEach(() => {
  delete process.env.SETTINGS_ENCRYPTION_KEY;
  delete process.env.CREDENTIALS_ENCRYPTION_KEY;
  delete process.env.NODE_ENV;
  delete process.env.VERCEL_ENV;
});

describe('credential envelope', () => {
  it('round-trips llm settings secrets', () => {
    process.env.SETTINGS_ENCRYPTION_KEY = HEX_KEY;
    const enc = encryptSecret('sk-ant-test-key-1234', 'llm_settings');
    expect(enc.ciphertext.startsWith('v1:')).toBe(true);
    expect(enc.hint).toBe('1234');
    expect(decryptSecret(enc.ciphertext, 'llm_settings')).toBe('sk-ant-test-key-1234');
  });

  it('isolates purposes with different keys', () => {
    process.env.SETTINGS_ENCRYPTION_KEY = HEX_KEY;
    process.env.CREDENTIALS_ENCRYPTION_KEY = 'b'.repeat(64);
    const enc = encryptSecret('broker-secret', 'broker_credentials');
    expect(() => decryptSecret(enc.ciphertext, 'llm_settings')).toThrow();
    expect(decryptSecret(enc.ciphertext, 'broker_credentials')).toBe('broker-secret');
  });

  it('supports legacy ciphertext without version prefix', () => {
    process.env.SETTINGS_ENCRYPTION_KEY = HEX_KEY;
    const enc = encryptSecret('legacy-key-abcd', 'llm_settings');
    const unversioned = enc.ciphertext.slice(3); // strip v1:
    expect(decryptSecret(unversioned, 'llm_settings')).toBe('legacy-key-abcd');
  });

  it('withDecryptedSecret yields plaintext to the callback', async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = HEX_KEY;
    const enc = encryptSecret('callback-secret', 'llm_settings');
    const out = await withDecryptedSecret(enc.ciphertext, 'llm_settings', (plain) =>
      plain.toUpperCase(),
    );
    expect(out).toBe('CALLBACK-SECRET');
  });

  it('fails closed in production without keys', () => {
    process.env.NODE_ENV = 'production';
    expect(() => encryptSecret('x', 'llm_settings')).toThrow(/encryption_key_missing:SETTINGS_ENCRYPTION_KEY/);
  });
});
