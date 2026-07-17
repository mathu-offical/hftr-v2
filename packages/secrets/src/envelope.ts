import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { CredentialPurpose, type CredentialPurpose as CredentialPurposeT } from '@hftr/contracts';

/**
 * Versioned AES-256-GCM credential envelope.
 * Plaintext exists only inside encrypt/decrypt; never log or persist decrypted values.
 */

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENVELOPE_VERSION = 1;
const LOCAL_DEV_SALT = 'hftr-v2-local-dev-settings-encryption-salt';

const PURPOSE_ENV: Record<CredentialPurposeT, string> = {
  llm_settings: 'SETTINGS_ENCRYPTION_KEY',
  broker_credentials: 'CREDENTIALS_ENCRYPTION_KEY',
  research_settings: 'SETTINGS_ENCRYPTION_KEY',
};

let warnedMissing: Partial<Record<CredentialPurposeT, boolean>> = {};

function resolveKey(purpose: CredentialPurposeT): Buffer {
  const envName = PURPOSE_ENV[purpose];
  const raw = process.env[envName];
  if (raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
    throw new Error(`${envName} must be 32 bytes (64-char hex or 44-char base64)`);
  }

  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'production' || process.env.VERCEL_ENV === 'production') {
    throw new Error(`encryption_key_missing:${envName}`);
  }
  if (process.env.VERCEL_ENV === 'preview') {
    throw new Error(`encryption_key_missing:${envName}`);
  }

  if (!warnedMissing[purpose]) {
    console.warn(
      `[secrets] ${envName} unset — using deterministic local fallback for purpose=${purpose}`,
    );
    warnedMissing[purpose] = true;
  }

  const fallbackSource = `${process.env.CRON_SECRET ?? LOCAL_DEV_SALT}:${purpose}`;
  return createHash('sha256').update(fallbackSource).digest();
}

export interface EncryptedEnvelope {
  /** base64(iv || tag || ciphertext) with version prefix `v1:` */
  ciphertext: string;
  hint: string;
  purpose: CredentialPurposeT;
  version: number;
}

export function encryptSecret(
  plain: string,
  purpose: CredentialPurposeT = 'llm_settings',
): EncryptedEnvelope {
  CredentialPurpose.parse(purpose);
  const key = resolveKey(purpose);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, encrypted]).toString('base64');
  const hint = plain.length >= 4 ? plain.slice(-4) : plain;
  return {
    ciphertext: `v${ENVELOPE_VERSION}:${blob}`,
    hint,
    purpose,
    version: ENVELOPE_VERSION,
  };
}

export function decryptSecret(
  ciphertext: string,
  purpose: CredentialPurposeT = 'llm_settings',
): string {
  CredentialPurpose.parse(purpose);
  const key = resolveKey(purpose);
  const raw = ciphertext.startsWith(`v${ENVELOPE_VERSION}:`)
    ? ciphertext.slice(`v${ENVELOPE_VERSION}:`.length)
    : ciphertext;
  const buf = Buffer.from(raw, 'base64');
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('invalid_ciphertext');
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const data = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Run a callback with a decrypted secret, then drop the local reference. */
export async function withDecryptedSecret<T>(
  ciphertext: string,
  purpose: CredentialPurposeT,
  fn: (plain: string) => Promise<T> | T,
): Promise<T> {
  const plain = decryptSecret(ciphertext, purpose);
  try {
    return await fn(plain);
  } finally {
    // Best-effort: JS strings are immutable; avoid retaining extra refs.
  }
}
