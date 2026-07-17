import {
  type ConceptValidationResult,
  type EvidencePackage,
  type ValidationGateId,
  type ValidationGateResult,
  leakLint,
} from '@hftr/contracts';
import { scoreRelevanceBand, titleSimilarity, tokenizeQualitativeText } from './relevance';

const DUPLICATE_TITLE_THRESHOLD = 0.75;

export interface ValidateEvidencePackagesInput {
  evidencePackages: EvidencePackage[];
  queryText: string;
  topicScope: string;
  existingConceptTitles: string[];
  nowMs: number;
  /** When set, only these gates must pass for overallPass (default: all gates). */
  requiredGateIds?: ValidationGateId[];
}

function hasDigitRunHeuristic(text: string): boolean {
  return /\d{2,}/.test(text) || /\$\s?\d/.test(text) || /\d\s?%/.test(text);
}

function checkLeak(text: string): boolean {
  const lint = leakLint({ summary: text }, []);
  if (!lint.ok) return false;
  return !hasDigitRunHeuristic(text);
}

function gateResult(
  gateId: ValidationGateId,
  passed: boolean,
  scoreBand: 'low' | 'medium' | 'high',
  reason: string,
): ValidationGateResult {
  return { gateId, passed, scoreBand, reason };
}

/**
 * Model-free ConceptValidationResult builder for gather → validate phase.
 * overallPass: all gates pass, or only requiredGateIds when configured.
 */
export function validateEvidencePackages(
  input: ValidateEvidencePackagesInput,
): ConceptValidationResult {
  const corpusTexts = input.evidencePackages.flatMap((pkg) => [pkg.title, pkg.summary]);
  const { band: relevanceBand, bestRatio } = scoreRelevanceBand({
    queryText: input.queryText,
    topicScope: input.topicScope,
    corpusTexts:
      corpusTexts.length > 0
        ? corpusTexts
        : input.existingConceptTitles.map((t) => t),
  });

  const relevancePassed =
    input.evidencePackages.length > 0
      ? relevanceBand !== 'low' || bestRatio > 0
      : bestRatio > 0 || tokenizeQualitativeText(input.topicScope).length === 0;

  const duplicateHits: string[] = [];
  for (const pkg of input.evidencePackages) {
    for (const existing of input.existingConceptTitles) {
      if (titleSimilarity(pkg.title, existing) >= DUPLICATE_TITLE_THRESHOLD) {
        duplicateHits.push(existing);
      }
    }
  }
  const duplicatePassed = duplicateHits.length === 0;

  const entitlementFailed = input.evidencePackages.filter(
    (pkg) => pkg.legalUseClass === 'RESTRICTED',
  );
  const sourceEntitlementPassed = entitlementFailed.length === 0;

  const leakFailed = input.evidencePackages.filter(
    (pkg) => !checkLeak(`${pkg.title} ${pkg.summary}`),
  );
  const leakRecheckPassed = leakFailed.length === 0;

  const coherencePassed = input.evidencePackages.length >= 1;

  const now = input.nowMs;
  const stale = input.evidencePackages.filter((pkg) => {
    if (!pkg.expiresAt) return false;
    const expiresMs = Date.parse(pkg.expiresAt);
    return Number.isFinite(expiresMs) && expiresMs <= now;
  });
  const freshnessPassed = stale.length === 0;

  const gates: ValidationGateResult[] = [
    gateResult(
      'relevance',
      relevancePassed,
      relevanceBand,
      relevancePassed ? 'topic overlap acceptable' : 'low topic overlap',
    ),
    gateResult(
      'duplicate',
      duplicatePassed,
      duplicatePassed ? 'high' : 'low',
      duplicatePassed ? 'no duplicate titles' : `similar to: ${duplicateHits.slice(0, 2).join(', ')}`,
    ),
    gateResult(
      'source_entitlement',
      sourceEntitlementPassed,
      sourceEntitlementPassed ? 'high' : 'low',
      sourceEntitlementPassed
        ? 'entitlement allows use'
        : `${entitlementFailed.length} restricted package(s)`,
    ),
    gateResult(
      'leak_recheck',
      leakRecheckPassed,
      leakRecheckPassed ? 'high' : 'low',
      leakRecheckPassed ? 'summaries clean' : `${leakFailed.length} leak hit(s)`,
    ),
    gateResult(
      'coherence',
      coherencePassed,
      coherencePassed ? 'high' : 'low',
      coherencePassed ? 'evidence present' : 'no evidence packages',
    ),
    gateResult(
      'freshness',
      freshnessPassed,
      freshnessPassed ? 'high' : 'low',
      freshnessPassed ? 'within freshness window' : `${stale.length} expired package(s)`,
    ),
  ];

  const overallPass = input.requiredGateIds
    ? gates
        .filter((g) => input.requiredGateIds!.includes(g.gateId))
        .every((g) => g.passed)
    : gates.every((g) => g.passed);

  const artifactRefs = input.evidencePackages.flatMap((pkg) =>
    pkg.artifactRefs.length > 0 ? pkg.artifactRefs : [`evidence:${pkg.digest}`],
  );

  return {
    overallPass,
    gates,
    relevanceBand,
    artifactRefs: [...new Set(artifactRefs)].slice(0, 24),
  };
}
