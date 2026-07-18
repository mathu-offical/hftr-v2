'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  LlmProvider,
  TIER_PROVIDER,
  type LlmBudgetsResponse,
  type LlmProvider as LlmProviderT,
  type LlmTier,
} from '@hftr/contracts';
import { api } from '@/lib/client';

/** Dispatched after User Settings mutates LLM or research keys. */
export const LLM_CREDENTIALS_CHANGED_EVENT = 'hftr:llm-credentials-changed';

export function notifyLlmCredentialsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(LLM_CREDENTIALS_CHANGED_EVENT));
}

export type LlmProviderConnectionStatus = 'configured' | 'unconfigured';

export interface LlmProviderConnection {
  provider: LlmProviderT;
  status: LlmProviderConnectionStatus;
  keyHint: string | null;
}

interface LlmConnectionStatusValue {
  ready: boolean;
  providers: LlmProviderConnection[];
  byProvider: Record<LlmProviderT, LlmProviderConnection>;
  /** Company-scoped budget rows when loaded via llm-budgets; null on directory. */
  budgets: LlmBudgetsResponse['providers'] | null;
  configuredCount: number;
  refresh: () => Promise<void>;
  isProviderConfigured: (provider: LlmProviderT) => boolean;
  isTierConfigured: (tier: LlmTier) => boolean;
}

const LlmConnectionStatusContext = createContext<LlmConnectionStatusValue | null>(null);

function emptyByProvider(): Record<LlmProviderT, LlmProviderConnection> {
  return Object.fromEntries(
    LlmProvider.options.map((provider) => [
      provider,
      { provider, status: 'unconfigured' as const, keyHint: null },
    ]),
  ) as Record<LlmProviderT, LlmProviderConnection>;
}

/**
 * Single shell-level LLM credential connection status. Fetches once (and on
 * settings mutation events). Downstream chips read this — do not re-query keys.
 */
export function LlmConnectionStatusProvider(props: {
  companyId?: string | null;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [byProvider, setByProvider] = useState(emptyByProvider);
  const [budgets, setBudgets] = useState<LlmBudgetsResponse['providers'] | null>(null);

  const refresh = useCallback(async () => {
    try {
      if (props.companyId) {
        const res = await api<LlmBudgetsResponse>(
          `/api/companies/${props.companyId}/llm-budgets`,
        );
        const next = emptyByProvider();
        for (const row of res.providers) {
          next[row.provider] = {
            provider: row.provider,
            status: row.credentialSource === 'user_key' ? 'configured' : 'unconfigured',
            keyHint: null,
          };
        }
        setByProvider(next);
        setBudgets(res.providers);
      } else {
        const data = await api<{
          keys: Array<{ provider: LlmProviderT; keyHint: string }>;
        }>('/api/settings/keys');
        const next = emptyByProvider();
        for (const row of data.keys) {
          next[row.provider] = {
            provider: row.provider,
            status: 'configured',
            keyHint: row.keyHint,
          };
        }
        setByProvider(next);
        setBudgets(null);
      }
    } catch {
      // Quiet — chips stay unconfigured until a successful refresh.
    } finally {
      setReady(true);
    }
  }, [props.companyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onChanged() {
      void refresh();
    }
    window.addEventListener(LLM_CREDENTIALS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(LLM_CREDENTIALS_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const value = useMemo<LlmConnectionStatusValue>(() => {
    const providers = LlmProvider.options.map((p) => byProvider[p]);
    const configuredCount = providers.filter((p) => p.status === 'configured').length;
    return {
      ready,
      providers,
      byProvider,
      budgets,
      configuredCount,
      refresh,
      isProviderConfigured: (provider) => byProvider[provider]?.status === 'configured',
      isTierConfigured: (tier) => {
        if (tier === 'strategic') {
          // Claude preferred; Mistral Large covers strategic when Anthropic is absent (D-067).
          return (
            byProvider.anthropic?.status === 'configured' ||
            byProvider.mistral?.status === 'configured'
          );
        }
        return byProvider[TIER_PROVIDER[tier]]?.status === 'configured';
      },
    };
  }, [byProvider, budgets, ready, refresh]);

  return (
    <LlmConnectionStatusContext.Provider value={value}>
      {props.children}
    </LlmConnectionStatusContext.Provider>
  );
}

export function useLlmConnectionStatus(): LlmConnectionStatusValue {
  const ctx = useContext(LlmConnectionStatusContext);
  if (!ctx) {
    throw new Error('useLlmConnectionStatus requires LlmConnectionStatusProvider');
  }
  return ctx;
}

/** Optional read when a subtree may render outside the provider (tests). */
export function useOptionalLlmConnectionStatus(): LlmConnectionStatusValue | null {
  return useContext(LlmConnectionStatusContext);
}

const TIER_LABEL: Record<LlmTier, string> = {
  strategic: 'strategic',
  tactical: 'tactical',
  execution: 'compile',
  assistant: 'assistant',
};

/**
 * Text-first availability chips for the LLM tiers a surface depends on.
 * Reads shell connection status — never fetches.
 */
export function LlmAvailabilityChips(props: {
  tiers: readonly LlmTier[];
  className?: string;
}) {
  const status = useOptionalLlmConnectionStatus();
  if (!status?.ready) return null;

  const uniqueProviders = [
    ...new Set(props.tiers.map((tier) => TIER_PROVIDER[tier])),
  ] as LlmProviderT[];

  return (
    <ul
      className={`flex flex-wrap gap-1 ${props.className ?? ''}`}
      aria-label="LLM availability"
    >
      {uniqueProviders.map((provider) => {
        const row = status.byProvider[provider];
        const configured = row.status === 'configured';
        const tiersForProvider = props.tiers.filter((t) => TIER_PROVIDER[t] === provider);
        const tierHint = tiersForProvider.map((t) => TIER_LABEL[t]).join('/');
        return (
          <li key={provider}>
            <span
              className={`status-chip text-[10px] uppercase tracking-wider ${
                configured ? 'text-[var(--color-ok)]' : 'text-[var(--color-ink-faint)]'
              }`}
              title={
                configured
                  ? `${provider} configured (${tierHint})`
                  : `${provider} unconfigured — set key in Settings (${tierHint})`
              }
            >
              {provider}:{configured ? 'ok' : 'off'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Compact ribbon readout of overall LLM credential connection status. */
export function LlmRibbonStatusChip() {
  const status = useOptionalLlmConnectionStatus();
  if (!status?.ready) return null;
  const total = LlmProvider.options.length;
  const n = status.configuredCount;
  const allOk = n === total;
  return (
    <span
      className={`status-chip font-mono ${allOk ? '' : 'text-[var(--color-warn)]'}`}
      title="LLM API key connection status (from shell; open Settings to manage)"
    >
      llm: {n}/{total}
      {!allOk && n === 0 ? ' off' : !allOk ? ' partial' : ''}
    </span>
  );
}
