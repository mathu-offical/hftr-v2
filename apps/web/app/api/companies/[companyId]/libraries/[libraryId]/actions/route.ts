import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { LibraryLibrarianActionInput } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { concepts, libraryConcepts, modules } from '@hftr/db/schema';
import {
  bumpConceptConfidence,
  createSystemClock,
  drainQueues,
  enqueue,
  estimateLlmJobCost,
} from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { getOwnedLibrary } from '@/lib/libraries';
import { createWebModelGateway } from '@/lib/model-gateway';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Params = z.object({ companyId: z.string().uuid(), libraryId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; libraryId: string }> };

/**
 * Librarian / research actions on a company custom library (D-127).
 * Curate → enqueue LIBRARY_RESEARCH; Verify → accept proposed memberships;
 * Refresh → client-side signal (optional light re-curate when module provided).
 */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, libraryId } = Params.parse(await ctx.params);
    const library = await getOwnedLibrary(db, clerkUserId, companyId, libraryId);
    const input = await parseBody(req, LibraryLibrarianActionInput);
    const clock = createSystemClock();
    const now = new Date(clock.nowMs());

    switch (input.action) {
      case 'refresh': {
        return {
          action: 'refresh' as const,
          libraryId,
          refreshed: true,
        };
      }
      case 'verify': {
        const proposed = await db
          .select({ conceptId: libraryConcepts.conceptId })
          .from(libraryConcepts)
          .innerJoin(concepts, eq(concepts.id, libraryConcepts.conceptId))
          .where(
            and(
              eq(libraryConcepts.libraryId, libraryId),
              eq(libraryConcepts.curationStatus, 'proposed'),
              eq(concepts.companyId, companyId),
              eq(concepts.status, 'active'),
            ),
          );
        let verifiedCount = 0;
        for (const row of proposed) {
          await db
            .update(libraryConcepts)
            .set({ curationStatus: 'accepted', updatedAt: now })
            .where(
              and(
                eq(libraryConcepts.libraryId, libraryId),
                eq(libraryConcepts.conceptId, row.conceptId),
              ),
            );
          await bumpConceptConfidence(db, row.conceptId, 'verify', now);
          verifiedCount += 1;
        }
        return {
          action: 'verify' as const,
          libraryId,
          verifiedCount,
        };
      }
      case 'curate': {
        let moduleId = input.moduleId ?? null;
        if (!moduleId) {
          const [researchMod] = await db
            .select({ id: modules.id })
            .from(modules)
            .where(
              and(
                eq(modules.companyId, companyId),
                eq(modules.type, 'research'),
                eq(modules.status, 'active'),
              ),
            )
            .limit(1);
          moduleId = researchMod?.id ?? null;
        }
        if (!moduleId) throw new ApiError(422, 'no_research_module');
        await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);

        const queryText = `Curate and refresh library ${library.name}`;
        await enqueue(db, clock, {
          queueClass: 'LIBRARY_RESEARCH',
          kind: 'research.curate',
          costEstimate: estimateLlmJobCost('research.curate'),
          payload: {
            companyId,
            moduleId,
            topicScope: library.name,
            queryText,
            mode: 'manual',
          },
          idempotencyKey: `lib-curate-${libraryId}-${randomUUID()}`,
          priority: 'NORMAL',
          companyId,
          moduleId,
        });
        const drained = await drainQueues(db, clock, {
          workerId: `inline:${clerkUserId.slice(0, 12)}`,
          budgetMs: 12_000,
          batchSize: 3,
          modelGateway: createWebModelGateway(db, clerkUserId),
        });
        return {
          action: 'curate' as const,
          libraryId,
          queued: true,
          drained,
        };
      }
      default: {
        const _exhaustive: never = input.action;
        throw new ApiError(422, `unknown_action:${String(_exhaustive)}`);
      }
    }
  });
}
