import { UpsertKalshiConnectionInput } from '@hftr/contracts';
import { brokerConnections } from '@hftr/db/schema';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { summarizeBrokerConnections } from '@/lib/brokers';
import { encryptSecret } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

function serializeKalshiCredentials(
  apiKeyId: string,
  privateKeyPem: string,
  demoMode: boolean,
): string {
  return JSON.stringify({ apiKeyId, privateKeyPem, demoMode });
}

export async function GET() {
  return withAuth(async ({ db, clerkUserId }) => {
    const connections = await summarizeBrokerConnections(db, clerkUserId);
    const kalshi = connections.find((c) => c.venue === 'kalshi' && c.mode === 'paper') ?? null;
    return { connection: kalshi };
  });
}

export async function PUT(req: Request) {
  return withAuth(async ({ db, clerkUserId }) => {
    const input = await parseBody(req, UpsertKalshiConnectionInput);
    if (input.mode !== 'paper' || !input.demoMode) {
      throw new ApiError(400, 'live_gate_blocked');
    }

    let encrypted;
    try {
      encrypted = encryptSecret(
        serializeKalshiCredentials(input.apiKeyId, input.privateKeyPem, true),
        'broker_credentials',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      throw new ApiError(
        msg.startsWith('encryption_key_missing:') ? 503 : 500,
        msg.startsWith('encryption_key_missing:') ? 'encryption_key_missing' : 'encryption_failed',
      );
    }

    const rows = await db
      .insert(brokerConnections)
      .values({
        clerkUserId,
        venue: 'kalshi',
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
