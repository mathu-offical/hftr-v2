import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  createAlpacaPaperAdapter,
  createAlpacaClient,
  createKalshiDemoAdapter,
  fetchAlpacaAccountId,
} from '@hftr/adapters';
import { brokerConnections, companies } from '@hftr/db/schema';
import type { Db } from '@hftr/db';
import type { AdapterCapabilities, ConnectionStatus } from '@hftr/contracts';
import { autoDisarmCompaniesForBroker, resolveCompanyServiceBindings } from '@hftr/engine';
import { ApiError, withAuth } from '@/lib/api';
import { getOwnedBrokerConnection } from '@/lib/brokers';
import { decryptSecret } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().uuid() });
type Ctx = { params: Promise<{ id: string }> };

function parseAlpacaCredentials(plain: string): { keyId: string; secret: string } {
  const parsed = JSON.parse(plain) as { keyId: string; secret: string };
  if (!parsed.keyId || !parsed.secret) {
    throw new ApiError(500, 'invalid_stored_credentials');
  }
  return parsed;
}

function parseKalshiCredentials(plain: string): {
  apiKeyId: string;
  privateKeyPem: string;
  demoMode: boolean;
} {
  const parsed = JSON.parse(plain) as {
    apiKeyId: string;
    privateKeyPem: string;
    demoMode?: boolean;
  };
  if (!parsed.apiKeyId || !parsed.privateKeyPem) {
    throw new ApiError(500, 'invalid_stored_credentials');
  }
  return {
    apiKeyId: parsed.apiKeyId,
    privateKeyPem: parsed.privateKeyPem,
    demoMode: parsed.demoMode ?? true,
  };
}

async function persistVerifyResult(
  db: Db,
  clerkUserId: string,
  id: string,
  status: ConnectionStatus,
  capabilities: AdapterCapabilities | null,
  venueAccountId: string | null,
) {
  if (status !== 'connected') {
    await autoDisarmCompaniesForBroker(db, id, 'broker_verify_failed');
  }

  const updated = await db
    .update(brokerConnections)
    .set({
      status,
      capabilities,
      lastVerifiedAt: new Date(),
      venueAccountId,
      updatedAt: new Date(),
    })
    .where(eq(brokerConnections.id, id))
    .returning({
      id: brokerConnections.id,
      status: brokerConnections.status,
      capabilities: brokerConnections.capabilities,
      lastVerifiedAt: brokerConnections.lastVerifiedAt,
      venueAccountId: brokerConnections.venueAccountId,
    });

  // Re-resolve module service bindings for all of the user's active companies (D-090).
  const owned = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.clerkUserId, clerkUserId), isNull(companies.archivedAt)));
  for (const company of owned) {
    await resolveCompanyServiceBindings(db, clerkUserId, company.id);
  }

  return updated[0]!;
}

export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { id } = Params.parse(await ctx.params);
    const connection = await getOwnedBrokerConnection(db, clerkUserId, id);

    if (connection.status === 'revoked') {
      throw new ApiError(400, 'broker_connection_revoked');
    }
    if (connection.mode === 'live') {
      throw new ApiError(400, 'live_gate_blocked');
    }

    const plain = decryptSecret(connection.ciphertext, 'broker_credentials');
    const nowMs = () => Date.now();

    if (connection.venue === 'alpaca') {
      const creds = parseAlpacaCredentials(plain);
      const adapter = createAlpacaPaperAdapter({
        keyId: creds.keyId,
        secret: creds.secret,
        nowMs,
      });
      const status = await adapter.verifyConnection();
      const capabilities = adapter.capabilities();
      let venueAccountId: string | null = null;
      if (status === 'connected') {
        const client = createAlpacaClient({ keyId: creds.keyId, secret: creds.secret });
        venueAccountId = await fetchAlpacaAccountId(client);
      }

      return persistVerifyResult(db, clerkUserId, id, status, capabilities, venueAccountId);
    }

    if (connection.venue === 'kalshi') {
      const creds = parseKalshiCredentials(plain);
      if (!creds.demoMode) {
        throw new ApiError(400, 'live_gate_blocked');
      }
      const adapter = createKalshiDemoAdapter({
        apiKeyId: creds.apiKeyId,
        privateKeyPem: creds.privateKeyPem,
        demoMode: true,
        nowMs,
      });
      const status = await adapter.verifyConnection();
      const capabilities = adapter.capabilities();
      return persistVerifyResult(db, clerkUserId, id, status, capabilities, null);
    }

    throw new ApiError(400, 'unsupported_venue');
  });
}
