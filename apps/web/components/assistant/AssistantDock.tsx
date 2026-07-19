'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dock, X } from 'lucide-react';
import type { AssistantEdit, AssistantMessage, AssistantToolResultSummary } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import { LlmAvailabilityChips } from '@/components/shell/LlmConnectionStatus';

const MIN_W = 280;
const MIN_H = 240;
const VIEW_PAD = 8;
/** Leave room for the right edge rail (w-12) + gutter. */
const RIGHT_RAIL_GUTTER = 56;
/** Match historic FAB inset (bottom-4). */
const BOTTOM_GUTTER = 16;

type AssistantGeometry = { x: number; y: number; w: number; h: number };

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Canonical far-right, bottom-of-window anchor (D-150 / D-154). */
function dockedGeometry(size?: Pick<AssistantGeometry, 'w' | 'h'>): AssistantGeometry {
  if (typeof window === 'undefined') {
    return { x: 80, y: 80, w: size?.w ?? 384, h: size?.h ?? 480 };
  }
  const w = size?.w ?? Math.min(384, Math.max(MIN_W, window.innerWidth - 72));
  const h = size?.h ?? Math.min(480, Math.max(MIN_H, Math.round(window.innerHeight * 0.55)));
  return clampGeometry({
    x: window.innerWidth - w - RIGHT_RAIL_GUTTER,
    y: window.innerHeight - h - BOTTOM_GUTTER,
    w,
    h,
  });
}

function defaultGeometry(): AssistantGeometry {
  return dockedGeometry();
}

function clampGeometry(g: AssistantGeometry): AssistantGeometry {
  if (typeof window === 'undefined') return g;
  const maxW = Math.max(MIN_W, window.innerWidth - VIEW_PAD * 2);
  const maxH = Math.max(MIN_H, window.innerHeight - VIEW_PAD * 2);
  const w = Math.min(maxW, Math.max(MIN_W, g.w));
  const h = Math.min(maxH, Math.max(MIN_H, g.h));
  const x = Math.min(window.innerWidth - VIEW_PAD - w, Math.max(VIEW_PAD, g.x));
  const y = Math.min(window.innerHeight - VIEW_PAD - h, Math.max(VIEW_PAD, g.y));
  return { x, y, w, h };
}

function readGeometry(key: string): AssistantGeometry | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const o = parsed as Record<string, unknown>;
    if (
      typeof o.x !== 'number' ||
      typeof o.y !== 'number' ||
      typeof o.w !== 'number' ||
      typeof o.h !== 'number'
    ) {
      return null;
    }
    return clampGeometry({ x: o.x, y: o.y, w: o.w, h: o.h });
  } catch {
    return null;
  }
}

function writeGeometry(key: string, value: AssistantGeometry): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota / private mode
  }
}

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
 * Read-only assistant chat (ui-spec §5 / D-146 / D-150 / D-154).
 * AST rail opens a fixed overlay layered above the main RightPanel; panel is
 * draggable (header) and resizable (edges/corners) within the viewport.
 * Shell **Dock** snaps back to the far-right bottom anchor.
 */
export function AssistantDock(props: {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { open, onOpenChange } = props;
  const geometryKey = props.companyId ? `hftr:${props.companyId}:assistant:geometry` : null;
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [proposals, setProposals] = useState<AssistantEdit[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geometry, setGeometry] = useState<AssistantGeometry>(defaultGeometry);
  const [geometryReady, setGeometryReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!geometryKey) {
      setGeometry(clampGeometry(defaultGeometry()));
      setGeometryReady(true);
      return;
    }
    setGeometry(readGeometry(geometryKey) ?? clampGeometry(defaultGeometry()));
    setGeometryReady(true);
  }, [geometryKey]);

  useEffect(() => {
    if (!geometryKey || !geometryReady) return;
    writeGeometry(geometryKey, geometry);
  }, [geometryKey, geometry, geometryReady]);

  useEffect(() => {
    const onResize = () => setGeometry((g) => clampGeometry(g));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
    if (!open) return;
    void loadHistory();
    void loadProposals();
  }, [open, loadHistory, loadProposals]);

  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, proposals]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const dockToAnchor = useCallback(() => {
    // Preserve current size; snap position to far-right bottom (leave rail gutter).
    const { w, h } = geometryRef.current;
    setGeometry(dockedGeometry({ w, h }));
  }, []);

  const beginDrag = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = geometryRef.current;
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // some environments reject capture on synthetic events
    }

    const onMove = (ev: PointerEvent) => {
      setGeometry(
        clampGeometry({
          ...origin,
          x: origin.x + (ev.clientX - startX),
          y: origin.y + (ev.clientY - startY),
        }),
      );
    };
    const onUp = (ev: PointerEvent) => {
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  const beginResize = useCallback((edge: ResizeEdge, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = geometryRef.current;
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let { x, y, w, h } = origin;
      if (edge.includes('e')) w = origin.w + dx;
      if (edge.includes('s')) h = origin.h + dy;
      if (edge.includes('w')) {
        w = origin.w - dx;
        x = origin.x + dx;
      }
      if (edge.includes('n')) {
        h = origin.h - dy;
        y = origin.y + dy;
      }
      if (w < MIN_W) {
        if (edge.includes('w')) x = origin.x + origin.w - MIN_W;
        w = MIN_W;
      }
      if (h < MIN_H) {
        if (edge.includes('n')) y = origin.y + origin.h - MIN_H;
        h = MIN_H;
      }
      setGeometry(clampGeometry({ x, y, w, h }));
    };
    const onUp = (ev: PointerEvent) => {
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

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
  }, [historyLoading, input, loading, loadProposals, props.companyId]);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void send();
    },
    [send],
  );

  if (!open || !mounted) return null;

  const resizeHandle = (edge: ResizeEdge, className: string) => (
    <div
      key={edge}
      role="separator"
      aria-orientation={edge === 'n' || edge === 's' ? 'horizontal' : 'vertical'}
      aria-label={`Resize assistant ${edge}`}
      onPointerDown={(e) => beginResize(edge, e)}
      className={`absolute z-10 touch-none ${className}`}
    />
  );

  return createPortal(
    <aside
      data-testid="assistant-rail-panel"
      className="fixed z-50 flex flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] shadow-2xl"
      style={{
        left: geometry.x,
        top: geometry.y,
        width: geometry.w,
        height: geometry.h,
      }}
      role="dialog"
      aria-modal="false"
      aria-label="Read-only assistant chat"
    >
      {resizeHandle('n', 'left-2 right-2 top-0 h-1.5 cursor-ns-resize')}
      {resizeHandle('s', 'left-2 right-2 bottom-0 h-1.5 cursor-ns-resize')}
      {resizeHandle('e', 'top-2 bottom-2 right-0 w-1.5 cursor-ew-resize')}
      {resizeHandle('w', 'top-2 bottom-2 left-0 w-1.5 cursor-ew-resize')}
      {resizeHandle('ne', 'right-0 top-0 h-3 w-3 cursor-nesw-resize')}
      {resizeHandle('nw', 'left-0 top-0 h-3 w-3 cursor-nwse-resize')}
      {resizeHandle('se', 'bottom-0 right-0 h-3 w-3 cursor-nwse-resize')}
      {resizeHandle('sw', 'bottom-0 left-0 h-3 w-3 cursor-nesw-resize')}

      <header
        onPointerDown={beginDrag}
        className="flex shrink-0 cursor-grab items-center justify-between border-b border-[var(--color-line)] px-3 py-2 active:cursor-grabbing"
      >
        <div className="pointer-events-none">
          <h2 className="text-sm font-medium text-[var(--color-ink)]">Assistant</h2>
          <p className="text-[10px] text-[var(--color-ink-faint)]">
            Read-only · drag · resize · dock
          </p>
          <div className="pointer-events-auto">
            <LlmAvailabilityChips tiers={['assistant']} className="mt-1" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={dockToAnchor}
            aria-label="Dock assistant to bottom-right"
            title="Dock to bottom-right"
            className="rounded p-1.5 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <Dock size={14} strokeWidth={1.85} aria-hidden />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onOpenChange(false)}
            aria-label="Close assistant"
            title="Close"
            className="rounded p-1.5 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <X size={14} strokeWidth={1.85} aria-hidden />
          </button>
        </div>
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

      <form onSubmit={onSubmit} className="flex shrink-0 gap-2 border-t border-[var(--color-line)] p-2">
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
    </aside>,
    document.body,
  );
}
