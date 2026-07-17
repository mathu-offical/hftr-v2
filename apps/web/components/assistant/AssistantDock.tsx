'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantEdit, AssistantMessage, AssistantToolResultSummary } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function humanizeTool(tool: string): string {
  return tool.replace(/_/g, ' ');
}

function proposalSummary(proposal: AssistantEdit['proposal']): string {
  switch (proposal.tool) {
    case 'create_module':
      return `Create ${proposal.type} module "${proposal.name}"`;
    case 'update_module_config':
    case 'patch_module_config':
      return `Update module config (${Object.keys(proposal.configPatch).join(', ')})`;
    case 'link_modules':
      return `Link modules (${proposal.linkKind})`;
    case 'set_policy':
      return `Set policy on module ${proposal.moduleId.slice(0, 8)}…`;
    case 'allocate_funds':
      return proposal.amountCents
        ? `Allocate funds (${proposal.fromKind} → ${proposal.toKind})`
        : 'Allocate funds (amount from your message — confirm to parse)';
    case 'create_watchlist':
      return `Create watchlist (${(proposal.symbols ?? []).length} symbols)`;
    case 'trigger_tier':
      return `Trigger tier job on module ${proposal.moduleId.slice(0, 8)}…`;
    case 'rename_module':
      return `Rename module → ${proposal.name}`;
    case 'add_watchlist_item':
      return `Watch ${proposal.symbol.toUpperCase()} (${proposal.bias ?? 'neutral'})`;
    default: {
      const _exhaustive: never = proposal;
      return _exhaustive;
    }
  }
}

function ProposalCard(props: {
  proposal: AssistantEdit;
  companyId: string;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const p = props.proposal.proposal;

  async function resolve(action: 'confirm' | 'reject') {
    setBusy(true);
    try {
      await api(
        `/api/companies/${props.companyId}/assistant/proposals/${props.proposal.id}/${action}`,
        { method: 'POST' },
      );
      props.onResolved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-[var(--color-warn)]/40 bg-[var(--color-surface-2)] p-2.5">
      <p className="text-[11px] font-medium text-[var(--color-ink)]">
        Pending {humanizeTool(props.proposal.tool)}
      </p>
      <p className="mt-1 font-mono text-[10px] text-[var(--color-ink-dim)]">{proposalSummary(p)}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void resolve('confirm')}
          className="rounded border border-[var(--color-ok)] px-2 py-0.5 text-[11px] text-[var(--color-ok)] hover:bg-[var(--color-ok)]/10 disabled:opacity-50"
        >
          Confirm
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void resolve('reject')}
          className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[11px] hover:bg-[var(--color-surface-3)] disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </li>
  );
}

function roleLabel(role: AssistantMessage['role']): string {
  switch (role) {
    case 'user':
      return 'You';
    case 'assistant':
      return 'Assistant';
    case 'system':
      return 'System';
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

function ToolResultsSummary({ results }: { results: AssistantToolResultSummary[] }) {
  return (
    <div className="mt-2 space-y-1.5">
      {results.map((r, i) => (
        <div
          key={`${r.tool}-${i}`}
          className="rounded border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2 py-1.5"
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">
              {r.tool.replace(/_/g, ' ')}
            </p>
            {r.status === 'failed' && (
              <span className="text-[10px] font-medium text-[var(--color-block)]">Failed</span>
            )}
          </div>
          <p className="text-[11px] text-[var(--color-ink-dim)]">{r.summary}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Docked read-only assistant pill (ui-spec section 5). Expands to a chat column
 * overlay; history persists via the company assistant API.
 */
export function AssistantDock(props: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [proposals, setProposals] = useState<AssistantEdit[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadProposals = useCallback(async () => {
    try {
      const data = await api<{ proposals: AssistantEdit[] }>(
        `/api/companies/${props.companyId}/assistant/proposals`,
      );
      setProposals(data.proposals);
    } catch {
      setProposals([]);
    }
  }, [props.companyId]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setError(null);
    try {
      const data = await api<{ messages: AssistantMessage[] }>(
        `/api/companies/${props.companyId}/assistant`,
      );
      setMessages(data.messages);
    } catch (err: unknown) {
      setError(
        err instanceof RequestError && err.status === 401
          ? 'Sign in to use the assistant.'
          : 'Could not load assistant history.',
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [props.companyId]);

  useEffect(() => {
    if (open) {
      void loadHistory();
      void loadProposals();
    }
  }, [open, loadHistory, loadProposals]);

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || historyLoading) return;
    setInput('');
    setLoading(true);
    setError(null);
    try {
      const data = await api<{
        userMessage: AssistantMessage;
        assistantMessage: AssistantMessage;
      }>(`/api/companies/${props.companyId}/assistant`, {
        method: 'POST',
        body: { message: text },
      });
      setMessages((prev) => [...prev, data.userMessage, data.assistantMessage]);
      void loadProposals();
    } catch (err: unknown) {
      setInput(text);
      if (err instanceof RequestError) {
        if (err.status === 400) {
          setError('Message must be between 1 and 2000 characters.');
        } else if (err.status === 429) {
          setError('Too many messages — wait a minute and try again.');
        } else {
          setError('Could not send message.');
        }
      } else {
        setError('Could not send message.');
      }
    } finally {
      setLoading(false);
    }
  }, [historyLoading, input, loading, props.companyId]);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void send();
    },
    [send],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-2 text-xs font-medium text-[var(--color-ink)] shadow-lg hover:bg-[var(--color-surface-2)]"
        aria-label="Open read-only assistant"
      >
        Assistant
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-40 flex max-h-[min(32rem,calc(100vh-2rem))] w-full max-w-sm flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] shadow-xl"
      role="dialog"
      aria-modal="false"
      aria-label="Read-only assistant chat"
    >
      <header className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
        <div>
          <h2 className="text-sm font-medium text-[var(--color-ink)]">Assistant</h2>
          <p className="text-[10px] text-[var(--color-ink-faint)]">Read-only · no model calls</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close assistant"
          className="rounded px-2 py-1 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          ×
        </button>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
        aria-live="polite"
        aria-busy={historyLoading || loading}
      >
        {historyLoading && messages.length === 0 && (
          <p className="py-4 text-xs text-[var(--color-ink-faint)]">Loading history…</p>
        )}

        {!historyLoading && messages.length === 0 && proposals.length === 0 && (
          <div className="py-4 text-xs text-[var(--color-ink-faint)]">
            <p>
              Ask about company summary, modules, executions, positions, trends, or queue status.
            </p>
            <p className="mt-1">Messages are saved. Do not paste credentials.</p>
          </div>
        )}

        {proposals.length > 0 && (
          <ul className="mb-3 space-y-2" aria-label="Pending assistant proposals">
            {proposals.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                companyId={props.companyId}
                onResolved={() => void loadProposals()}
              />
            ))}
          </ul>
        )}

        <ul className="space-y-3">
          {messages.map((m) => (
            <li key={m.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-medium text-[var(--color-ink)]">
                  {roleLabel(m.role)}
                </span>
                <time
                  dateTime={m.createdAt}
                  className="font-mono text-[10px] text-[var(--color-ink-faint)]"
                >
                  {formatTime(m.createdAt)}
                </time>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-ink-dim)]">
                {m.content}
              </p>
              {m.toolResults && m.toolResults.length > 0 && (
                <ToolResultsSummary results={m.toolResults} />
              )}
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <p className="border-t border-[var(--color-line)] px-3 py-1.5 text-[11px] text-[var(--color-block)]">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-[var(--color-line)] p-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading || historyLoading}
          maxLength={2000}
          placeholder="Ask a read-only question…"
          aria-label="Assistant message"
          className="min-w-0 flex-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2 py-1.5 text-xs text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || historyLoading || !input.trim()}
          aria-label="Send message"
          className="rounded border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-3)] disabled:opacity-50"
        >
          {loading ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
