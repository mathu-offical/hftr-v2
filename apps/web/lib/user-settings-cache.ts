/**
 * User settings modal cache (D-172).
 *
 * Separates **existence** (which credentials are configured — keyHint rows /
 * broker summaries) from **verification** badges. Existence persists across
 * modal open/close. Verification is retained while verified / format-ok and
 * only re-probed when unknown, failed, or explicitly invalidated (save/delete/
 * failed handshake).
 *
 * Never stores plaintext keys or ciphertext — hints and status only.
 */

import type {
  BrokerConnectionSummary,
  LlmProvider,
  ResearchKeyProvider,
} from '@hftr/contracts';

export type SettingsTab = 'llm' | 'research' | 'brokers';

/** Operator-visible verify outcome for a key row (text-first; color reinforces). */
export type KeyVerifyUiStatus = 'idle' | 'verified' | 'verified_deferred' | 'failed' | 'unknown';

export type SettingsLlmKeyRow = {
  provider: LlmProvider;
  keyHint: string;
  retentionAttested: 'none' | 'org_zdr';
  updatedAt: string;
};

export type SettingsResearchKeyRow = {
  provider: ResearchKeyProvider;
  keyHint: string;
  updatedAt: string;
};

export type SettingsVerifyKey = LlmProvider | ResearchKeyProvider;

export type UserSettingsCacheSnapshot = {
  llmKeys: SettingsLlmKeyRow[];
  researchKeys: SettingsResearchKeyRow[];
  alpaca: BrokerConnectionSummary | null;
  kalshi: BrokerConnectionSummary | null;
  verify: Partial<Record<SettingsVerifyKey, KeyVerifyUiStatus>>;
  tab: SettingsTab;
  existenceFetchedAt: number | null;
};

const emptySnapshot = (): UserSettingsCacheSnapshot => ({
  llmKeys: [],
  researchKeys: [],
  alpaca: null,
  kalshi: null,
  verify: {},
  tab: 'llm',
  existenceFetchedAt: null,
});

let snapshot: UserSettingsCacheSnapshot = emptySnapshot();

export function peekUserSettingsCache(): UserSettingsCacheSnapshot {
  return {
    ...snapshot,
    llmKeys: [...snapshot.llmKeys],
    researchKeys: [...snapshot.researchKeys],
    verify: { ...snapshot.verify },
  };
}

export function setSettingsTab(tab: SettingsTab): void {
  snapshot.tab = tab;
}

export function setLlmExistence(keys: SettingsLlmKeyRow[]): void {
  snapshot.llmKeys = [...keys];
  snapshot.existenceFetchedAt = Date.now();
  pruneVerifyToExisting();
}

export function setResearchExistence(keys: SettingsResearchKeyRow[]): void {
  snapshot.researchKeys = [...keys];
  snapshot.existenceFetchedAt = Date.now();
  pruneVerifyToExisting();
}

export function setBrokerExistence(
  venue: 'alpaca' | 'kalshi',
  connection: BrokerConnectionSummary | null,
): void {
  if (venue === 'alpaca') snapshot.alpaca = connection;
  else snapshot.kalshi = connection;
  snapshot.existenceFetchedAt = Date.now();
}

export function setKeyVerifyStatus(provider: SettingsVerifyKey, status: KeyVerifyUiStatus): void {
  snapshot.verify = { ...snapshot.verify, [provider]: status };
}

export function setKeyVerifyStatuses(
  next: Partial<Record<SettingsVerifyKey, KeyVerifyUiStatus>>,
): void {
  snapshot.verify = { ...snapshot.verify, ...next };
}

/** Mark one or all providers as needing a fresh probe. */
export function invalidateKeyVerify(provider?: SettingsVerifyKey): void {
  if (provider) {
    const next = { ...snapshot.verify };
    delete next[provider];
    snapshot.verify = next;
    return;
  }
  snapshot.verify = {};
}

export function removeLlmExistence(provider: LlmProvider): void {
  snapshot.llmKeys = snapshot.llmKeys.filter((k) => k.provider !== provider);
  invalidateKeyVerify(provider);
}

export function removeResearchExistence(provider: ResearchKeyProvider): void {
  snapshot.researchKeys = snapshot.researchKeys.filter((k) => k.provider !== provider);
  invalidateKeyVerify(provider);
}

/**
 * Merge server existence into the cache without wiping verified badges for
 * unchanged rows (same provider + keyHint + updatedAt).
 * Changed or new rows get `unknown` so they re-probe; removed rows drop verify.
 */
export function mergeExistenceFromServer(input: {
  llm: SettingsLlmKeyRow[];
  research: SettingsResearchKeyRow[];
}): {
  llm: SettingsLlmKeyRow[];
  research: SettingsResearchKeyRow[];
  needsVerify: SettingsVerifyKey[];
} {
  const prevLlm = new Map(snapshot.llmKeys.map((k) => [k.provider, k]));
  const prevResearch = new Map(snapshot.researchKeys.map((k) => [k.provider, k]));
  const verify = { ...snapshot.verify };
  const needsVerify: SettingsVerifyKey[] = [];

  for (const row of input.llm) {
    const prev = prevLlm.get(row.provider);
    const same =
      prev &&
      prev.keyHint === row.keyHint &&
      prev.updatedAt === row.updatedAt &&
      prev.retentionAttested === row.retentionAttested;
    if (!same) {
      verify[row.provider] = 'unknown';
      needsVerify.push(row.provider);
    } else if (needsProbe(verify[row.provider])) {
      needsVerify.push(row.provider);
    }
  }

  for (const row of input.research) {
    const prev = prevResearch.get(row.provider);
    const same = prev && prev.keyHint === row.keyHint && prev.updatedAt === row.updatedAt;
    if (!same) {
      verify[row.provider] = 'unknown';
      needsVerify.push(row.provider);
    } else if (needsProbe(verify[row.provider])) {
      needsVerify.push(row.provider);
    }
  }

  const keep = new Set<string>([
    ...input.llm.map((k) => k.provider),
    ...input.research.map((k) => k.provider),
  ]);
  for (const key of Object.keys(verify) as SettingsVerifyKey[]) {
    if (!keep.has(key)) delete verify[key];
  }

  snapshot.llmKeys = [...input.llm];
  snapshot.researchKeys = [...input.research];
  snapshot.verify = verify;
  snapshot.existenceFetchedAt = Date.now();

  return {
    llm: snapshot.llmKeys,
    research: snapshot.researchKeys,
    needsVerify: [...new Set(needsVerify)],
  };
}

export function providersNeedingVerify(
  llm: SettingsLlmKeyRow[],
  research: SettingsResearchKeyRow[],
): SettingsVerifyKey[] {
  const out: SettingsVerifyKey[] = [];
  for (const row of llm) {
    if (needsProbe(snapshot.verify[row.provider])) out.push(row.provider);
  }
  for (const row of research) {
    if (needsProbe(snapshot.verify[row.provider])) out.push(row.provider);
  }
  return out;
}

export function needsProbe(status: KeyVerifyUiStatus | undefined): boolean {
  return status !== 'verified' && status !== 'verified_deferred';
}

function pruneVerifyToExisting(): void {
  const keep = new Set<string>([
    ...snapshot.llmKeys.map((k) => k.provider),
    ...snapshot.researchKeys.map((k) => k.provider),
  ]);
  const next: Partial<Record<SettingsVerifyKey, KeyVerifyUiStatus>> = {};
  for (const [k, v] of Object.entries(snapshot.verify) as [SettingsVerifyKey, KeyVerifyUiStatus][]) {
    if (keep.has(k)) next[k] = v;
  }
  snapshot.verify = next;
}

/** Test helper — reset module singleton. */
export function __resetUserSettingsCacheForTests(): void {
  snapshot = emptySnapshot();
}
