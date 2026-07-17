'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LiveGateChecklistItem } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';

const ARM_PHRASE = 'ARM LIVE TRADING';

interface LiveGateStatusResponse {
  checklist: LiveGateChecklistItem[];
  overallPass: boolean;
  liveArmedAt: string | null;
  evidenceFresh: boolean;
}

function gateTone(pass: boolean): string {
  return pass ? 'var(--color-ok)' : 'var(--color-block)';
}

/**
 * Master paper/live switch (ui-ux spec: top app shell). Live trading is gated
 * behind broker connection, checklist pass, fresh evidence, and explicit arming.
 * Never silently enables live.
 */
export function ModeSwitch(props: { companyId: string; mode: string }) {
  const [showGate, setShowGate] = useState(false);
  const [status, setStatus] = useState<LiveGateStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<LiveGateStatusResponse>(
        `/api/companies/${props.companyId}/live-gates/status`,
      );
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [props.companyId]);

  useEffect(() => {
    if (showGate) void load();
  }, [showGate, load]);

  const armed = Boolean(status?.liveArmedAt);

  async function runReview() {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/live-gates/review`, { method: 'POST' });
      setMessage('Checklist evidence saved.');
      await load();
    } catch {
      setMessage('Could not save gate evidence.');
    } finally {
      setBusy(false);
    }
  }

  async function arm() {
    if (confirmText !== ARM_PHRASE) {
      setMessage(`Type exactly: ${ARM_PHRASE}`);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/live-gates/arm`, {
        method: 'POST',
        body: { confirmation: confirmText },
      });
      setMessage('Live armed. Dispatch still requires live broker connection.');
      setConfirmText('');
      await load();
    } catch (err) {
      setMessage(
        err instanceof RequestError ? `Arm blocked (${err.status}).` : 'Could not arm live.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function disarm() {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/companies/${props.companyId}/live-gates/disarm`, { method: 'POST' });
      setMessage('Live disarmed.');
      await load();
    } catch {
      setMessage('Could not disarm.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex items-center rounded-md border border-[var(--color-line)] p-0.5 text-[11px]">
      <span
        className={`rounded px-2 py-0.5 uppercase tracking-wide ${
          props.mode === 'paper' && !armed
            ? 'bg-[var(--color-surface-2)] text-[var(--color-ok)]'
            : 'text-[var(--color-ink-faint)]'
        }`}
      >
        paper
      </span>
      <button
        type="button"
        onClick={() => setShowGate((v) => !v)}
        className={`rounded px-2 py-0.5 uppercase tracking-wide hover:text-[var(--color-ink-dim)] ${
          armed ? 'text-[var(--color-warn)]' : 'text-[var(--color-ink-faint)]'
        }`}
        aria-label="Live trading (gated)"
        aria-expanded={showGate}
      >
        live{armed ? ' · armed' : ''}
      </button>
      {showGate && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-80 max-h-[min(24rem,70vh)] overflow-y-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3 text-xs text-[var(--color-ink-dim)] shadow-xl">
          <p className="mb-1 font-medium text-[var(--color-ink)]">Live trading is gated.</p>
          <p className="mb-2">
            Paper and live share the same engine. Live dispatch requires checklist pass, fresh
            evidence (&lt;24h), and explicit arming — never enabled silently.
          </p>

          {loading && <p className="text-[var(--color-ink-faint)]">Loading checklist…</p>}

          {!loading && status && (
            <ul className="mb-2 space-y-1.5" aria-label="Live gate checklist">
              {status.checklist.map((item) => (
                <li
                  key={item.gateId}
                  className="rounded border border-[var(--color-line)] px-2 py-1"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase text-[var(--color-ink-faint)]">
                      {item.gateId.replace(/_/g, ' ')}
                    </span>
                    <span style={{ color: gateTone(item.pass) }}>
                      {item.pass ? 'pass' : 'fail'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px]">{item.evidence}</p>
                  {!item.pass && item.requiredAction && (
                    <p className="mt-0.5 text-[10px] text-[var(--color-warn)]">
                      {item.requiredAction}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runReview()}
              className="rounded border border-[var(--color-line)] px-2 py-1 hover:bg-[var(--color-surface-2)] disabled:opacity-50"
            >
              Save evidence
            </button>
            {!armed ? (
              <>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={ARM_PHRASE}
                  aria-label="Live arm confirmation phrase"
                  className="min-w-0 flex-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px]"
                />
                <button
                  type="button"
                  disabled={busy || !status?.overallPass || !status.evidenceFresh}
                  onClick={() => void arm()}
                  className="rounded border border-[var(--color-block)] px-2 py-1 text-[var(--color-block)] hover:bg-[var(--color-block)]/10 disabled:opacity-50"
                >
                  Arm
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void disarm()}
                className="rounded border border-[var(--color-warn)] px-2 py-1 text-[var(--color-warn)] hover:bg-[var(--color-warn)]/10 disabled:opacity-50"
              >
                Disarm
              </button>
            )}
          </div>

          {message && <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">{message}</p>}
        </div>
      )}
    </div>
  );
}
