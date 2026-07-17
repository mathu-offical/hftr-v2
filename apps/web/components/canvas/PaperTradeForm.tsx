'use client';

import { useState } from 'react';
import { api, RequestError } from '@/lib/client';

/** Fired after a trade attempt so the activity panel refetches. */
export const ACTIVITY_REFRESH_EVENT = 'hftr:activity-refresh';

/**
 * Operator paper-trade form (inspector, trading modules only). Submits to the
 * hardened trade route; execution runs through the DISPATCH queue and the
 * deterministic engine — this form never talks to an adapter directly.
 */
export function PaperTradeForm(props: { companyId: string; moduleId: string; disabled: boolean }) {
  const [symbol, setSymbol] = useState('AAPL');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('10');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <div className="space-y-2.5 border-t border-[var(--color-line)] pt-4">
      <span className="text-xs text-[var(--color-ink-dim)]">Paper trade</span>
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
