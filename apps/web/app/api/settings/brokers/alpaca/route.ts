import { UpsertAlpacaConnectionInput } from '@hftr/contracts';
import { brokerConnections } from '@hftr/db/schema';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { summarizeBrokerConnections } from '@/lib/brokers';
import { encryptSecret } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

function serializeAlpacaCredentials(keyId: string, secret: string): string {
  return JSON.stringify({ keyId, secret });
}

export async function GET() {
  return withAuth(async ({ db, clerkUserId }) => {
    const connections = await summarizeBrokerConnections(db, clerkUserId);
    const alpaca = connections.find((c) => c.venue === 'alpaca' && c.mode === 'paper') ?? null;
    return { connection: alpaca };
  });
}

export async function PUT(req: Request) {
  return withAuth(async ({ db, clerkUserId }) => {
    const input = await parseBody(req, UpsertAlpacaConnectionInput);
    if (input.mode !== 'paper') {
      throw new ApiError(400, 'live_gate_blocked');
    }

    let encrypted;
    try {
      encrypted = encryptSecret(
        serializeAlpacaCredentials(input.keyId, input.secret),
        'broker_credentials',
      );
    } catch {
      throw new ApiError(500, 'encryption_failed');
    }

    const rows = await db
      .insert(brokerConnections)
      .values({
        clerkUserId,
        venue: 'alpaca',
        mode: 'paper',
        ciphertext: encrypted.ciphertext,
        keyHint: encrypted.hint,
        status: 'unverified',
      })
      .onConflictDoUpdate({
        target: [brokerConnections.clerkUserId, brokerConnections.venue, brokerConnections.mode],
        set: {
          ciphertext: encrypted.ciphertext,
          keyHint: encrypted.hint,
          status: 'unverified',
          capabilities: null,
          lastVerifiedAt: null,
          venueAccountId: null,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: brokerConnections.id,
        keyHint: brokerConnections.keyHint,
        status: brokerConnections.status,
      });

    return rows[0]!;
  });
}
