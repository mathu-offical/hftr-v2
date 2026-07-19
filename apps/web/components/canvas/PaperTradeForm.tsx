'use client';

import { useEffect, useState } from 'react';
import { api, RequestError } from '@/lib/client';
import { simHonestyChips } from '@/lib/sim-honesty-label';
import { dollars } from '@/components/panels/format';

/** Fired after a trade attempt so the activity panel refetches. */
export const ACTIVITY_REFRESH_EVENT = 'hftr:activity-refresh';

type QuotePreview = {
  symbol: string;
  usedLive: boolean;
  priorSessionMark: boolean;
  markCents: string | null;
  honestyTags: string[];
  impactProxyLikely: boolean;
};

/**
 * Operator paper-trade form (inspector, trading modules only). Submits to the
 * hardened trade route; execution runs through the DISPATCH queue and the
 * deterministic engine — this form never talks to an adapter directly.
 * Pre-trade honesty preview uses the same MarketModel quote path (D-192).
 */
export function PaperTradeForm(props: { companyId: string; moduleId: string; disabled: boolean }) {
  const [symbol, setSymbol] = useState('AAPL');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('10');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<QuotePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    const sym = symbol.trim().toUpperCase();
    if (!/^[A-Z.]{1,12}$/.test(sym) || props.disabled) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const qty = Number(quantity);
    const qtyParam = Number.isInteger(qty) && qty >= 1 ? qty : 1;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      api<QuotePreview>(
        `/api/companies/${props.companyId}/modules/${props.moduleId}/trade/quote-preview?symbol=${encodeURIComponent(sym)}&quantity=${qtyParam}`,
      )
        .then((data) => {
          if (cancelled) return;
          setPreview(data);
          setPreviewError(null);
        })
        .catch(() => {
          if (cancelled) return;
          setPreview(null);
          setPreviewError('Mark preview unavailable');
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [symbol, quantity, props.companyId, props.moduleId, props.disabled]);

  async function submit() {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      setMessage('Quantity must be a whole number.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/modules/${props.moduleId}/trade`, {
        method: 'POST',
        body: {
          symbol: symbol.trim().toUpperCase(),
          actionVerb: side,
          orderType: 'market',
          quantity: qty,
        },
      });
      setMessage('Order dispatched — see Activity.');
      window.dispatchEvent(new Event(ACTIVITY_REFRESH_EVENT));
    } catch (err) {
      setMessage(
        err instanceof RequestError && err.code === 'module_not_active'
          ? 'Set the module to active first.'
          : 'Trade rejected.',
      );
    } finally {
      setBusy(false);
    }
  }

  const honesty = simHonestyChips([
    ...(preview?.honestyTags ?? []),
    ...(preview?.impactProxyLikely ? ['square_root_impact_proxy'] : []),
  ]);

  return (
    <div className="space-y-2.5 border-t border-[var(--color-line)] pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-[var(--color-ink-dim)]">Paper trade</span>
        <span className="text-[10px] text-[var(--color-ink-faint)]">
          Paper capital · live marks when entitled
        </span>
      </div>
      <div className="flex gap-1.5">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`flex-1 rounded-md border px-2 py-1 text-xs capitalize ${
              side === s
                ? s === 'buy'
                  ? 'border-[var(--color-ok)] text-[var(--color-ok)]'
                  : 'border-[var(--color-block)] text-[var(--color-block)]'
                : 'border-[var(--color-line)] text-[var(--color-ink-dim)]'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          maxLength={12}
          placeholder="Symbol"
          aria-label="Symbol"
          className="w-full min-w-0 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-sm uppercase outline-none focus:border-[var(--color-accent)]"
        />
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          inputMode="numeric"
          placeholder="Qty"
          aria-label="Quantity"
          className="w-20 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      {(honesty.length > 0 || preview?.markCents || previewError) && (
        <div
          className="space-y-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5"
          data-testid="paper-trade-honesty-preview"
          aria-live="polite"
        >
          {preview?.markCents != null && (
            <p className="font-mono text-[10px] text-[var(--color-ink-dim)]">
              Mark {dollars(preview.markCents)}
              {preview.priorSessionMark ? ' · prior session' : ''}
            </p>
          )}
          {honesty.length > 0 && (
            <div
              className="flex flex-wrap gap-1"
              aria-label={`Expected simulation honesty: ${honesty.map((c) => c.label).join(', ')}`}
            >
              {honesty.map((chip) => (
                <span
                  key={chip.kind}
                  className="rounded border border-[var(--color-line)] px-1 text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]"
                >
                  {chip.label}
                </span>
              ))}
            </div>
          )}
          {previewError && (
            <p className="text-[10px] text-[var(--color-ink-faint)]">{previewError}</p>
          )}
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy || props.disabled}
        className="w-full rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
      >
        {busy ? 'Dispatching…' : 'Submit paper order'}
      </button>
      {props.disabled && (
        <p className="text-xs text-[var(--color-ink-faint)]">Activate the module to trade.</p>
      )}
      {message && <p className="text-xs text-[var(--color-ink-dim)]">{message}</p>}
    </div>
  );
}
