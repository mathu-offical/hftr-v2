/**
 * Job payloads must never carry operator secrets (D-074).
 * Reject known credential field names at enqueue time (fail-closed).
 */

/** Field names that must never appear in `jobs.payload`. */
export const FORBIDDEN_JOB_PAYLOAD_SECRET_KEYS = [
  'braveApiKey',
  'marketNewsApiKey',
  'finnhubApiKey',
  'polygonApiKey',
  'fredApiKey',
  'alphaVantageApiKey',
  'twelveDataApiKey',
  'marketstackApiKey',
  'alpacaKeyId',
  'alpacaSecret',
  'apiKey',
  'apiSecret',
  'secret',
  'privateKeyPem',
  'ciphertext',
  'authorization',
  'xApiKey',
] as const;

const FORBIDDEN_SET = new Set<string>(FORBIDDEN_JOB_PAYLOAD_SECRET_KEYS);

/**
 * Return a shallow copy of `payload` with known secret fields removed.
 * Use for dead-letter retry of legacy rows that may still hold plaintext keys.
 */
export function stripSecretsFromJobPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  for (const key of FORBIDDEN_JOB_PAYLOAD_SECRET_KEYS) {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      delete next[key];
    }
  }
  return next;
}

/**
 * Throws if `payload` (top-level only) contains a known secret field name.
 * Nested objects are not walked — research/broker enqueues use flat payloads.
 */
export function assertNoSecretsInJobPayload(payload: Record<string, unknown>): void {
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_SET.has(key)) {
      throw new Error(`job_payload_secret_forbidden:${key}`);
    }
  }
}
