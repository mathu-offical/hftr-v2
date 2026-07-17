import { z } from 'zod';

/** Encryption purpose — maps to distinct env keys and never cross-decrypts. */
export const CredentialPurpose = z.enum([
  'llm_settings',
  'broker_credentials',
  'research_settings',
]);
export type CredentialPurpose = z.infer<typeof CredentialPurpose>;
