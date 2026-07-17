import { eq } from 'drizzle-orm';
import type { BrokerAdapter, Venue } from '@hftr/contracts';
import { resolveBrokerAdapter, type BrokerConnectionResolveInput } from '@hftr/adapters';
import type { Db } from '@hftr/db';
import { brokerConnections, companies } from '@hftr/db/schema';
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

export async function resolveExecutionContext(
  db: Db,
  clock: Clock,
  companyId: string,
): Promise<ResolvedExecutionContext> {
  const companyRows = await db
    .select({
      mode: companies.mode,
      brokerConnectionId: companies.brokerConnectionId,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const company = companyRows[0];
  if (!company) {
    throw new Error('company_not_found');
  }

  if (company.mode === 'live') {
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
      connectionInput = {
        venue: conn.venue,
        mode: conn.mode,
        status: conn.status,
        credentials: parseStoredCredentials(plain),
      };
    }
  }

  const virtualBalanceCents = await getCompanyBalanceCents(db, companyId);
  const adapter = resolveBrokerAdapter({
    connection: connectionInput,
    nowMs: () => clock.nowMs(),
    paperSim: {
      getQuote: (symbol) => getSyntheticQuote(symbol, clock),
      startingCashCents: Number(virtualBalanceCents),
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
