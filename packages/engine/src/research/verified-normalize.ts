import { createHash } from 'node:crypto';
import {
  leakLint,
  type EvidencePackage,
  type NormalizedViewKind,
  type QualitativeBand,
  type SystemNormalizedViewItem,
  type ValidationGateResult,
  type VerifiedNormalizedBundle,
} from '@hftr/contracts';
import { tokenizeQualitativeText, tokenOverlapRatio } from './relevance';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const DEFAULT_TTL_BY_BAND: Record<QualitativeBand, number> = {
  low: 6 * MS_PER_HOUR,
  medium: MS_PER_DAY,
  high: MS_PER_DAY,
};

export interface CorroborateAndNormalizeInput {
  evidence: EvidencePackage[];
  kind: NormalizedViewKind;
  subjectKey: string;
  title: string;
  nowMs: number;
  ttlMs?: number;
  topicScope?: string;
  topicSectors?: readonly string[];
}

function redactLeakText(text: string): string {
  let out = text
    .replace(/\$\s?\d[\d.,]*/g, '[redacted]')
    .replace(/\d[\d.,]*\s?%/g, '[redacted]')
    .replace(/\b\d{2,}\b/g, '[redacted]')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '[redacted]');
  const lint = leakLint(out, []);
  if (lint.ok) return out.trim();
  out = out.replace(/\d/g, '');
  return out.replace(/\s+/g, ' ').trim();
}

function qualitativeHeadline(pkg: EvidencePackage): string {
  const raw = `${pkg.title}: ${pkg.summary}`.trim();
  const redacted = redactLeakText(raw);
  return redacted.length > 0 ? redacted.slice(0, 300) : pkg.title.slice(0, 300);
}

function corroborationBandFromDomains(domainCount: number): QualitativeBand {
  if (domainCount >= 3) return 'high';
  if (domainCount === 2) return 'medium';
  return 'low';
}

function computeSealId(parts: {
  kind: NormalizedViewKind;
  subjectKey: string;
  title: string;
  digests: string[];
}): string {
  const payload = [
    parts.kind,
    parts.subjectKey,
    parts.title,
    ...[...parts.digests].sort(),
  ].join('|');
  const hex = createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 32);
  return `sha256-${hex}`;
}

function sectorScopeGate(
  evidence: EvidencePackage[],
  topicScope: string,
  topicSectors: readonly string[],
): ValidationGateResult {
  const scopeTokens = [
    ...tokenizeQualitativeText(topicScope),
    ...topicSectors.flatMap((sector) => tokenizeQualitativeText(sector)),
  ];
  if (scopeTokens.length === 0) {
    return {
      gateId: 'sector_scope',
      passed: true,
      scoreBand: 'medium',
      reason: 'no sector scope configured',
    };
  }

  let bestRatio = 0;
  for (const pkg of evidence) {
    const corpus = tokenizeQualitativeText(`${pkg.title} ${pkg.summary}`);
    bestRatio = Math.max(bestRatio, tokenOverlapRatio(scopeTokens, corpus));
  }

  const passed = bestRatio >= 0.08;
  const scoreBand: QualitativeBand =
    bestRatio >= 0.2 ? 'high' : bestRatio >= 0.08 ? 'medium' : 'low';
  return {
    gateId: 'sector_scope',
    passed,
    scoreBand,
    reason: passed ? 'topic overlap acceptable' : 'low sector overlap',
  };
}

function sourceCredibilityGate(evidence: EvidencePackage[]): ValidationGateResult {
  const restricted = evidence.filter((pkg) => pkg.legalUseClass === 'RESTRICTED');
  if (restricted.length > 0) {
    return {
      gateId: 'source_credibility',
      passed: false,
      scoreBand: 'low',
      reason: `${restricted.length} restricted package(s)`,
    };
  }

  const reviewRequired = evidence.filter((pkg) => pkg.legalUseClass === 'REVIEW_REQUIRED');
  if (reviewRequired.length > 0) {
    return {
      gateId: 'source_credibility',
      passed: true,
      scoreBand: 'medium',
      reason: 'review required on some sources',
    };
  }

  return {
    gateId: 'source_credibility',
    passed: true,
    scoreBand: 'high',
    reason: 'sources credible',
  };
}

function corroborationGate(domainCount: number): ValidationGateResult {
  const band = corroborationBandFromDomains(domainCount);
  return {
    gateId: 'corroboration',
    passed: domainCount >= 2,
    scoreBand: band,
    reason:
      domainCount >= 3
        ? 'three or more independent domains'
        : domainCount === 2
          ? 'two independent domains'
          : 'single source domain',
  };
}

function buildViewItems(evidence: EvidencePackage[]): SystemNormalizedViewItem[] {
  return evidence.slice(0, 24).map((pkg) => ({
    headline: qualitativeHeadline(pkg),
    strengthBand: 'medium' as const,
  }));
}

/**
 * Deterministic multi-source normalize + seal (D-072). Returns null when evidence is empty
 * or credibility gate fails closed on RESTRICTED packages.
 */
export function corroborateAndNormalize(
  input: CorroborateAndNormalizeInput,
): VerifiedNormalizedBundle | null {
  if (input.evidence.length === 0) return null;

  const domains = new Set(input.evidence.map((pkg) => pkg.sourceKind));
  const corroborationBand = corroborationBandFromDomains(domains.size);
  const digests = [...new Set(input.evidence.map((pkg) => pkg.digest))];

  const credibility = sourceCredibilityGate(input.evidence);
  if (!credibility.passed) return null;

  const sector = sectorScopeGate(
    input.evidence,
    input.topicScope ?? '',
    input.topicSectors ?? [],
  );
  const corroboration = corroborationGate(domains.size);
  const gatesSnapshot: ValidationGateResult[] = [sector, credibility, corroboration];

  const view = {
    kind: input.kind,
    subjectKey: input.subjectKey,
    title: input.title,
    items: buildViewItems(input.evidence),
    sourceDigests: digests,
    metricRefs: [] as string[],
  };

  const sealId = computeSealId({
    kind: input.kind,
    subjectKey: input.subjectKey,
    title: input.title,
    digests,
  });

  const ttlMs = input.ttlMs ?? DEFAULT_TTL_BY_BAND[corroborationBand];
  const verifiedAt = new Date(input.nowMs).toISOString();
  const expiresAt = new Date(input.nowMs + ttlMs).toISOString();

  return {
    sealId,
    view,
    corroborationBand,
    sourceDigests: digests,
    verifiedAt,
    expiresAt,
    gatesSnapshot,
    reportConceptId: null,
  };
}

/** TTL + non-empty digest guard for seal reuse. */
export function isSealValid(
  bundle: VerifiedNormalizedBundle,
  nowMs: number,
): boolean {
  if (bundle.sourceDigests.length === 0) return false;
  const expiresMs = Date.parse(bundle.expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) return false;
  return bundle.sealId.length >= 8;
}
