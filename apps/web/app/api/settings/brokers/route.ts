import { ApiError, withAuth } from '@/lib/api';
import { summarizeBrokerConnections } from '@/lib/brokers';

export const dynamic = 'force-dynamic';

export async function GET() {
  return withAuth(async ({ db, clerkUserId }) => {
    const connections = await summarizeBrokerConnections(db, clerkUserId);
    return { connections };
  });
}
