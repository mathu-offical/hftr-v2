import type { ResearchModuleConfig } from '@hftr/contracts';
import { z } from 'zod';

export const CuriosityLevel = z.enum(['conservative', 'balanced', 'exploratory']);
export type CuriosityLevel = z.infer<typeof CuriosityLevel>;

const CURIOSITY_MAX_EVIDENCE: Record<CuriosityLevel, number> = {
  conservative: 4,
  balanced: 8,
  exploratory: 16,
};

/** Apply module curiosity band to evidence cap (conservative 4 / balanced 8 / exploratory 16). */
export function resolveCuriosityMaxEvidence(
  curiosity: CuriosityLevel,
  requestedMax?: number,
): number {
  const cap = CURIOSITY_MAX_EVIDENCE[curiosity];
  if (requestedMax === undefined) return cap;
  return Math.min(Math.max(1, requestedMax), cap);
}

export function curiosityFromConfig(
  config: z.infer<typeof ResearchModuleConfig>,
): CuriosityLevel {
  return CuriosityLevel.parse(config.curiosity);
}
