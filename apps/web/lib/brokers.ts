import { and, eq, isNull } from 'drizzle-orm';
import type { AdapterCapabilities, BrokerConnectionSummary } from '@hftr/contracts';
import {
  AdapterCapabilities as AdapterCapabilitiesSchema,
  normalizeAdapterServiceCapabilities,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { brokerConnections, companies } from '@hftr/db/schema';
import { NotFoundError } from '@hftr/db';

export async function getOwnedBrokerConnection(db: Db, clerkUserId: string, connectionId: string) {
  const rows = await db
    .select()
    .from(brokerConnections)
    .where(
      and(eq(brokerConnections.id, connectionId), eq(brokerConnections.clerkUserId, clerkUserId)),
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new NotFoundError('broker_connection');
  }
  return row;
}

export async function summarizeBrokerConnections(
  db: Db,
  clerkUserId: string,
): Promise<BrokerConnectionSummary[]> {
  const rows = await db
    .select({
      id: brokerConnections.id,
      venue: brokerConnections.venue,
      mode: brokerConnections.mode,
      status: brokerConnections.status,
      keyHint: brokerConnections.keyHint,
      capabilities: brokerConnections.capabilities,
      lastVerifiedAt: brokerConnections.lastVerifiedAt,
      createdAt: brokerConnections.createdAt,
      updatedAt: brokerConnections.updatedAt,
      boundCompanyId: companies.id,
    })
    .from(brokerConnections)
    .leftJoin(companies, eq(companies.brokerConnectionId, brokerConnections.id))
    .where(eq(brokerConnections.clerkUserId, clerkUserId));

  return rows.map((row) => {
    const capabilities = row.capabilities
      ? AdapterCapabilitiesSchema.parse(row.capabilities)
      : null;
    return {
      id: row.id,
      venue: row.venue,
      mode: row.mode,
      status: row.status,
      keyHint: row.keyHint,
      capabilities,
      serviceCapabilities: normalizeAdapterServiceCapabilities(capabilities),
      lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
      boundCompanyId: row.boundCompanyId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function assertConnectionUnbound(
  db: Db,
  connectionId: string,
  exceptCompanyId?: string,
): Promise<void> {
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.brokerConnectionId, connectionId), isNull(companies.archivedAt)))
    .limit(1);
  const bound = rows[0];
  if (!bound) return;
  if (exceptCompanyId && bound.id === exceptCompanyId) return;
  throw new Error('broker_connection_already_bound');
}

export function parseStoredCapabilities(raw: unknown): AdapterCapabilities | null {
  if (!raw) return null;
  return AdapterCapabilitiesSchema.parse(raw);
}
