import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createAlpacaPaperAdapter, fetchAlpacaAccountId, createAlpacaClient } from '@hftr/adapters';
import { brokerConnections } from '@hftr/db/schema';
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
    const creds = parseAlpacaCredentials(plain);

    if (connection.venue === 'alpaca') {
      const adapter = createAlpacaPaperAdapter({
        keyId: creds.keyId,
        secret: creds.secret,
        nowMs: () => Date.now(),
      });
      const status = await adapter.verifyConnection();
      const capabilities = adapter.capabilities();
      let venueAccountId: string | null = null;
      if (status === 'connected') {
        const client = createAlpacaClient({ keyId: creds.keyId, secret: creds.secret });
        venueAccountId = await fetchAlpacaAccountId(client);
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

      return updated[0]!;
    }

    throw new ApiError(400, 'unsupported_venue');
  });
}
