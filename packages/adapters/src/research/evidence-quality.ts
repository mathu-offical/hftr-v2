import { createHash } from 'node:crypto';
import type { EvidencePackage } from '@hftr/contracts';

const TRACKING_QUERY_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
]);

/** Normalize URLs for duplicate detection (host lowercased, fragment stripped). */
export function canonicalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();

    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_QUERY_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }

    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    const search = parsed.searchParams.toString();
    return `${parsed.protocol}//${parsed.hostname}${pathname}${search ? `?${search}` : ''}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

function tokenizeForSimHash(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

/** Deterministic 64-bit SimHash as bigint (SHA-256 bit voting per token). */
export function simHash64(text: string): bigint {
  const tokens = tokenizeForSimHash(text);
  const votes = new Int16Array(64);

  for (const token of tokens) {
    const digest = createHash('sha256').update(token, 'utf8').digest();
    for (let bit = 0; bit < 64; bit++) {
      const byte = digest[bit >> 3]!;
      const isSet = ((byte >> (bit & 7)) & 1) === 1;
      votes[bit]! += isSet ? 1 : -1;
    }
  }

  let hash = 0n;
  for (let bit = 0; bit < 64; bit++) {
    if ((votes[bit] ?? 0) > 0) {
      hash |= 1n << BigInt(bit);
    }
  }
  return hash;
}

export function simHash64Hex(text: string): string {
  return simHash64(text).toString(16).padStart(16, '0');
}

function toSimHashBigInt(value: bigint | string): bigint {
  if (typeof value === 'bigint') return value;
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith('0x')) {
    return BigInt(normalized);
  }
  return BigInt(`0x${normalized}`);
}

/** Hamming distance between two 64-bit SimHash values. */
export function hammingDistance(a: bigint | string, b: bigint | string): number {
  let xor = toSimHashBigInt(a) ^ toSimHashBigInt(b);
  let distance = 0;
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}

function evidenceSimHash(pkg: EvidencePackage): bigint {
  const body = [pkg.title, pkg.summary, pkg.externalRef ?? ''].join('\n');
  return simHash64(body);
}

/**
 * Drop near-duplicate evidence packages by SimHash Hamming distance.
 * First occurrence wins; order is preserved.
 */
export function dedupeEvidenceByNearHash(
  packages: EvidencePackage[],
  maxHamming = 3,
): EvidencePackage[] {
  const kept: EvidencePackage[] = [];
  const keptHashes: bigint[] = [];

  for (const pkg of packages) {
    const hash = evidenceSimHash(pkg);
    const isNearDup = keptHashes.some((existing) => hammingDistance(existing, hash) <= maxHamming);
    if (isNearDup) continue;
    kept.push(pkg);
    keptHashes.push(hash);
  }

  return kept;
}
