import { desc, eq } from 'drizzle-orm';
import type { BrokerAdapter, LiveGateEvidence, Venue } from '@hftr/contracts';
import { LiveGateEvidence as LiveGateEvidenceSchema } from '@hftr/contracts';
import { resolveBrokerAdapter, type BrokerConnectionResolveInput } from '@hftr/adapters';
import type { Db } from '@hftr/db';
import { brokerConnections, companies, liveGateEvidence } from '@hftr/db/schema';
import { decryptSecret } from '@hftr/secrets';
import type { Clock } from '../clock';
import { getCompanyBalanceCents } from './balances';
import { getSyntheticQuote } from './quotes';

export interface ResolvedExecutionContext {
  companyId: string;
  companyMode: 'paper' | 'live';
  brokerConnectionId: string | null;
  adapter: BrokerAdapter;
  venue: Venue;
  virtualBalanceCents: bigint;
}

function parseStoredCredentials(plain: string): unknown {
  return JSON.parse(plain) as unknown;
}

async function loadLiveGateEvidence(
  db: Db,
  companyId: string,
  evidenceId: string | null,
): Promise<LiveGateEvidence | null> {
  if (evidenceId) {
    const rows = await db
      .select({ evidence: liveGateEvidence.evidence })
      .from(liveGateEvidence)
      .where(eq(liveGateEvidence.id, evidenceId))
      .limit(1);
    const row = rows[0];
    if (row) {
      const parsed = LiveGateEvidenceSchema.safeParse(row.evidence);
      return parsed.success ? parsed.data : null;
    }
  }
  const latest = await db
    .select({ evidence: liveGateEvidence.evidence })
    .from(liveGateEvidence)
    .where(eq(liveGateEvidence.companyId, companyId))
    .orderBy(desc(liveGateEvidence.createdAt))
    .limit(1);
  const row = latest[0];
  if (!row) return null;
  const parsed = LiveGateEvidenceSchema.safeParse(row.evidence);
  return parsed.success ? parsed.data : null;
}

export async function resolveExecutionContext(
  db: Db,
  clock: Clock,
  companyId: string,
): Promise<ResolvedExecutionContext> {
  const companyRows = await db
    .select({
      mode: companies.mode,
      brokerConnectionId: companies.brokerConnectionId,
      liveArmedAt: companies.liveArmedAt,
      liveGateEvidenceId: companies.liveGateEvidenceId,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const company = companyRows[0];
  if (!company) {
    throw new Error('company_not_found');
  }

  const nowMs = clock.nowMs();
  const armedAtMs = company.liveArmedAt?.getTime() ?? null;

  if (company.mode === 'live' && !armedAtMs) {
    throw new Error('live_gate_blocked');
  }

  let connectionInput: BrokerConnectionResolveInput | null = null;
  if (company.brokerConnectionId) {
    const connRows = await db
      .select()
      .from(brokerConnections)
      .where(eq(brokerConnections.id, company.brokerConnectionId))
      .limit(1);
    const conn = connRows[0];
    if (conn) {
      const plain = decryptSecret(conn.ciphertext, 'broker_credentials');
      const credentials = parseStoredCredentials(plain);
      connectionInput = {
        venue: conn.venue,
        mode: conn.mode,
        status: conn.status,
        credentials,
        ...(conn.venue === 'kalshi' && typeof credentials === 'object' && credentials !== null
          ? {
              demoMode:
                'demoMode' in credentials
                  ? Boolean((credentials as { demoMode?: boolean }).demoMode)
                  : true,
            }
          : {}),
      };
    }
  }

  if (connectionInput?.mode === 'live' && !armedAtMs) {
    throw new Error('live_gate_blocked');
  }

  const evidence =
    connectionInput?.mode === 'live' || company.mode === 'live'
      ? await loadLiveGateEvidence(db, companyId, company.liveGateEvidenceId)
      : null;

  const virtualBalanceCents = await getCompanyBalanceCents(db, companyId);
  const adapter = resolveBrokerAdapter({
    connection: connectionInput,
    nowMs: () => clock.nowMs(),
    paperSim: {
      getQuote: (symbol) => getSyntheticQuote(symbol, clock),
      startingCashCents: Number(virtualBalanceCents),
    },
    liveArming: {
      armedAtMs,
      evidence,
      nowMs,
    },
  });

  return {
    companyId,
    companyMode: company.mode,
    brokerConnectionId: company.brokerConnectionId,
    adapter,
    venue: adapter.venue,
    virtualBalanceCents,
  };
}
