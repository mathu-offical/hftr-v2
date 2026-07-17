import { listResolvedEngineTemplates } from '@hftr/contracts';
import { loadSessionConstraints } from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  return withAuth(async () => {
    const sessionIds = new Set(loadSessionConstraints().keys());
    return { templates: listResolvedEngineTemplates(sessionIds) };
  });
}
