'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { COMPANY_TEMPLATES, type CompanyTemplateId } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';

/**
 * Company creation flow (product-spec §onboarding): name + philosophy prompt,
 * paper mode with seed credits, and a starting template graph.
 */
export function CreateCompanyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [philosophy, setPhilosophy] = useState('');
  const [seedDollars, setSeedDollars] = useState('10000');
  const [template, setTemplate] = useState<CompanyTemplateId>('blank');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const seed = Math.max(0, Math.round(Number(seedDollars) || 0)) * 100;
      const { company } = await api<{ company: { id: string } }>('/api/companies', {
        method: 'POST',
        body: {
          name,
          philosophyPrompt: philosophy,
          mode: 'paper',
          seedCreditsCents: seed,
          template,
        },
      });
      router.push(`/companies/${company.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof RequestError ? humanize(err) : 'Something went wrong.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        New company
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-lg space-y-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-6"
    >
      <h2 className="text-lg font-medium">New company</h2>

      <label className="block space-y-1.5">
        <span className="text-sm text-[var(--color-ink-dim)]">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
          placeholder="e.g. Momentum Desk"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-[var(--color-ink-dim)]">
          Philosophy — how should this company think?
        </span>
        <textarea
          value={philosophy}
          onChange={(e) => setPhilosophy(e.target.value)}
          required
          rows={4}
          maxLength={4000}
          placeholder="Patient swing trading on large-cap tech. Prefer strong evidence over speed; cut losers fast."
          className="w-full resize-none rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-[var(--color-ink-dim)]">Paper seed credits (USD)</span>
        <input
          value={seedDollars}
          onChange={(e) => setSeedDollars(e.target.value)}
          inputMode="numeric"
          className="w-40 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--color-accent)]"
        />
      </label>

      <div className="space-y-1.5">
        <span className="text-sm text-[var(--color-ink-dim)]">Start from</span>
        <div className="grid grid-cols-1 gap-2">
          {Object.values(COMPANY_TEMPLATES).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplate(t.id)}
              className={`rounded-md border px-3 py-2 text-left text-sm ${
                template === t.id
                  ? 'border-[var(--color-accent)]'
                  : 'border-[var(--color-line)] hover:border-[var(--color-ink-faint)]'
              }`}
            >
              <span className="font-medium">{t.label}</span>
              <span className="block text-xs text-[var(--color-ink-faint)]">{t.description}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-[var(--color-block)]">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create (paper mode)'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function humanize(err: RequestError): string {
  switch (err.code) {
    case 'company_limit_reached':
      return 'You have reached the company limit.';
    case 'invalid_input':
      return err.issues?.map((i) => `${i.path}: ${i.message}`).join('; ') ?? 'Invalid input.';
    default:
      return `Request failed (${err.code}).`;
  }
}
