'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

interface StatRow {
  status: string;
  queueClass: string;
  count: number;
}

/**
 * Text-first queue readout in the top bar: "queue idle" or
 * "queue: 3 pending · 1 active". Polls every 15s; quiet on failure.
 */
export function QueueStatsChip() {
  const [rows, setRows] = useState<StatRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const { stats } = await api<{ stats: StatRow[] }>('/api/queue/stats');
        if (!cancelled) setRows(stats);
      } catch {
        if (!cancelled) setRows(null);
      }
    }
    void tick();
    const t = setInterval(tick, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!rows) return null;
  const total = (status: string) =>
    rows.filter((r) => r.status === status).reduce((n, r) => n + r.count, 0);
  const pending = total('pending');
  const active = total('active');
  const dead = total('dead');

  const label =
    pending + active === 0 ? 'queue idle' : `queue: ${pending} pending · ${active} active`;

  return (
    <span className="status-chip font-mono" title="Background job queue">
      {label}
      {dead > 0 && <span className="text-[var(--color-block)]"> · {dead} dead</span>}
    </span>
  );
}
