import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const LOCAL_DEV_SALT = 'hftr-v2-local-dev-settings-encryption-salt';

let warnedMissingKey = false;

function resolveEncryptionKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
    throw new Error('SETTINGS_ENCRYPTION_KEY must be 32 bytes (64-char hex or 44-char base64)');
  }

  if (!warnedMissingKey) {
    console.warn(
      '[secrets] SETTINGS_ENCRYPTION_KEY is unset — using deterministic local fallback. Set a 32-byte key for preview/prod.',
    );
    warnedMissingKey = true;
  }

  const fallbackSource = process.env.CRON_SECRET ?? LOCAL_DEV_SALT;
  return createHash('sha256').update(fallbackSource).digest();
}

export function encryptSecret(plain: string): { ciphertext: string; hint: string } {
  const key = resolveEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, encrypted]).toString('base64');
  const hint = plain.length >= 4 ? plain.slice(-4) : plain;
  return { ciphertext: blob, hint };
}

export function decryptSecret(ciphertext: string): string {
  const key = resolveEncryptionKey();
  const buf = Buffer.from(ciphertext, 'base64');
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
