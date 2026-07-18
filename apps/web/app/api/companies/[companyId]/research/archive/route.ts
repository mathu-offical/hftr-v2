import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ArchiveResearchInput, leakLint } from '@hftr/contracts';
import { NotFoundError, scoping } from '@hftr/db';
import { concepts, researchTopics } from '@hftr/db/schema';
import {
  archiveAllRuntimeResearch,
  bumpConceptConfidence,
  bumpTopicConfidence,
  clearArchive,
  listArchive,
  restoreConcept,
  restoreLibrary,
  restoreTopic,
  SEEDED_TOPIC_TITLE,
  isSeededTopicTitle,
  softArchiveConcept,
  softArchiveLibrary,
  softArchiveTopic,
  verifyResearchObject,
} from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

function mapArchiveError(err: unknown): never {
  if (!(err instanceof Error)) throw err;
  switch (err.message) {
    case 'concept_not_found':
    case 'topic_not_found':
    case 'library_not_found':
      throw new NotFoundError(err.message.replace(/_not_found$/, ''));
    case 'concept_catalog_seed_protected':
    case 'topic_seeded_protected':
    case 'library_seeded_protected':
      throw new ApiError(403, 'seed_protected', { reason: err.message });
    case 'concept_archived':
    case 'topic_archived':
      throw new ApiError(409, 'object_archived', { reason: err.message });
    case 'object_kind_required':
    case 'object_id_required':
    case 'refine_body_required':
    case 'refine_synopsis_required':
    case 'leak_lint_failed':
      throw new ApiError(400, err.message);
    default:
      throw err;
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const archive = await listArchive(db, companyId);
    return {
      concepts: archive.concepts.map((c) => ({
        ...c,
        archivedAt: c.archivedAt?.toISOString() ?? null,
      })),
      topics: archive.topics.map((t) => ({
        ...t,
        archivedAt: t.archivedAt?.toISOString() ?? null,
      })),
      libraries: archive.libraries.map((l) => ({
        ...l,
        archivedAt: l.archivedAt?.toISOString() ?? null,
      })),
    };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, ArchiveResearchInput);
    const now = new Date();

    try {
      switch (input.action) {
        case 'archive_runtime': {
          const counts = await archiveAllRuntimeResearch(db, companyId, now);
          return { ok: true, action: input.action, counts };
        }
        case 'clear_archive': {
          const counts = await clearArchive(db, companyId);
          return { ok: true, action: input.action, counts };
        }
        case 'archive_object': {
          if (!input.objectKind) throw new Error('object_kind_required');
          if (!input.objectId) throw new Error('object_id_required');
          switch (input.objectKind) {
            case 'concept': {
              const result = await softArchiveConcept(db, companyId, input.objectId, now);
              return { ok: true, action: input.action, ...result };
            }
            case 'topic': {
              const result = await softArchiveTopic(db, companyId, input.objectId, now);
              return { ok: true, action: input.action, ...result };
            }
            case 'library': {
              const result = await softArchiveLibrary(db, companyId, input.objectId, now);
              return { ok: true, action: input.action, ...result };
            }
            default: {
              const _exhaustive: never = input.objectKind;
              throw new Error(`unknown_object_kind:${String(_exhaustive)}`);
            }
          }
        }
        case 'restore_object': {
          if (!input.objectKind) throw new Error('object_kind_required');
          if (!input.objectId) throw new Error('object_id_required');
          switch (input.objectKind) {
            case 'concept': {
              const result = await restoreConcept(db, companyId, input.objectId, now);
              return { ok: true, action: input.action, ...result };
            }
            case 'topic': {
              const result = await restoreTopic(db, companyId, input.objectId, now);
              return { ok: true, action: input.action, ...result };
            }
            case 'library': {
              const result = await restoreLibrary(db, companyId, input.objectId, now);
              return { ok: true, action: input.action, ...result };
            }
            default: {
              const _exhaustive: never = input.objectKind;
              throw new Error(`unknown_object_kind:${String(_exhaustive)}`);
            }
          }
        }
        case 'verify_object': {
          if (!input.objectKind || input.objectKind === 'library') {
            throw new Error('object_kind_required');
          }
          if (!input.objectId) throw new Error('object_id_required');
          const result = await verifyResearchObject(
            db,
            companyId,
            input.objectKind,
            input.objectId,
            now,
          );
          return { ok: true, action: input.action, ...result };
        }
        case 'refine_object': {
          if (!input.objectKind || input.objectKind === 'library') {
            throw new Error('object_kind_required');
          }
          if (!input.objectId) throw new Error('object_id_required');
          switch (input.objectKind) {
            case 'concept': {
              if (input.body === undefined) throw new Error('refine_body_required');
              const lint = leakLint({ body: input.body }, []);
              if (!lint.ok) throw new Error('leak_lint_failed');
              const [row] = await db
                .select({
                  id: concepts.id,
                  status: concepts.status,
                  sourceClass: concepts.sourceClass,
                })
                .from(concepts)
                .where(and(eq(concepts.id, input.objectId), eq(concepts.companyId, companyId)))
                .limit(1);
              if (!row) throw new Error('concept_not_found');
              if (row.status === 'archived') throw new Error('concept_archived');
              if (row.sourceClass === 'catalog_seed') {
                throw new Error('concept_catalog_seed_protected');
              }
              await db
                .update(concepts)
                .set({ body: input.body, updatedAt: now })
                .where(and(eq(concepts.id, input.objectId), eq(concepts.companyId, companyId)));
              const confidenceBand = await bumpConceptConfidence(db, input.objectId, 'up', now);
              return { ok: true, action: input.action, confidenceBand };
            }
            case 'topic': {
              if (input.synopsisMd === undefined) throw new Error('refine_synopsis_required');
              const lint = leakLint({ synopsisMd: input.synopsisMd }, []);
              if (!lint.ok) throw new Error('leak_lint_failed');
              const [row] = await db
                .select({
                  id: researchTopics.id,
                  status: researchTopics.status,
                  title: researchTopics.title,
                })
                .from(researchTopics)
                .where(
                  and(
                    eq(researchTopics.id, input.objectId),
                    eq(researchTopics.companyId, companyId),
                  ),
                )
                .limit(1);
              if (!row) throw new Error('topic_not_found');
              if (row.status === 'archived') throw new Error('topic_archived');
              if (isSeededTopicTitle(row.title)) throw new Error('topic_seeded_protected');
              await db
                .update(researchTopics)
                .set({ synopsisMd: input.synopsisMd, updatedAt: now })
                .where(
                  and(
                    eq(researchTopics.id, input.objectId),
                    eq(researchTopics.companyId, companyId),
                  ),
                );
              const confidenceBand = await bumpTopicConfidence(db, input.objectId, 'up', now);
              return { ok: true, action: input.action, confidenceBand };
            }
            default: {
              const _exhaustive: never = input.objectKind;
              throw new Error(`unknown_object_kind:${String(_exhaustive)}`);
            }
          }
        }
        default: {
          const _exhaustive: never = input.action;
          throw new Error(`unknown_action:${String(_exhaustive)}`);
        }
      }
    } catch (err) {
      mapArchiveError(err);
    }
  });
}
