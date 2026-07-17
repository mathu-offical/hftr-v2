/**
 * Web app re-export of shared credential envelopes.
 * Prefer importing `@hftr/secrets` directly in new code.
 */
export {
  encryptSecret,
  decryptSecret,
  withDecryptedSecret,
  type EncryptedEnvelope,
} from '@hftr/secrets';
