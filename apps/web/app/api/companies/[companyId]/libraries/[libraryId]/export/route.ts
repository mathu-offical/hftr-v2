import { and, asc, eq, inArray } from 'drizzle-orm';
import JSZip from 'jszip';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { ConceptLinkRelation } from '@hftr/contracts';
import { getDb } from '@hftr/db';
import {
  conceptLinks,
  concepts,
  libraryConcepts,
  researchTopics,
  topicConcepts,
} from '@hftr/db/schema';
import { exportObsidianNotes, exportObsidianTopicNotes } from '@hftr/engine';
import { errorResponse } from '@/lib/api';
import { getAuthUserId } from '@/lib/auth';
import { getOwnedLibrary, obsidianZipFilename } from '@/lib/libraries';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid(), libraryId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; libraryId: string }> };

const EXPORT_STATUSES = ['accepted', 'proposed'] as const;

const SOURCE_CLASSES = ['deterministic_placeholder', 'model_generated', 'operator'] as const;
type SourceClass = (typeof SOURCE_CLASSES)[number];

const WEIGHT_BANDS = ['weak', 'typical', 'strong'] as const;
type WeightBand = (typeof WEIGHT_BANDS)[number];

function asSourceClass(value: string): SourceClass {
  if ((SOURCE_CLASSES as readonly string[]).includes(value)) {
    return value as SourceClass;
  }
  return 'deterministic_placeholder';
}

function asConceptLinkRelation(value: string): ConceptLinkRelation {
  const relations: ConceptLinkRelation[] = [
    'supports',
    'contradicts',
    'causes',
    'correlates',
    'mentions',
    'derived_from',
  ];
  return relations.includes(value as ConceptLinkRelation)
    ? (value as ConceptLinkRelation)
    : 'mentions';
}

function asWeightBand(value: string): WeightBand {
  return (WEIGHT_BANDS as readonly string[]).includes(value) ? (value as WeightBand) : 'typical';
}

export async function GET(_req: Request, ctx: Ctx) {
  const clerkUserId = await getAuthUserId();
  if (!clerkUserId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { companyId, libraryId } = Params.parse(await ctx.params);
    const db = getDb();
    const library = await getOwnedLibrary(db, clerkUserId, companyId, libraryId);

    const membershipRows = await db
      .select({
        conceptId: libraryConcepts.conceptId,
        title: concepts.title,
        body: concepts.body,
        tags: concepts.tags,
        sourceClass: concepts.sourceClass,
        sourceRef: concepts.sourceRef,
      })
      .from(libraryConcepts)
      .innerJoin(concepts, eq(concepts.id, libraryConcepts.conceptId))
      .where(
        and(
          eq(libraryConcepts.libraryId, libraryId),
          inArray(libraryConcepts.curationStatus, [...EXPORT_STATUSES]),
        ),
      )
      .limit(500);

    const conceptIds = membershipRows.map((row) => row.conceptId);
    const linkRows =
      conceptIds.length === 0
        ? []
        : await db
            .select({
              fromConceptId: conceptLinks.fromConceptId,
              toConceptId: conceptLinks.toConceptId,
              relation: conceptLinks.relation,
              weightBand: conceptLinks.weightBand,
            })
            .from(conceptLinks)
            .where(
              and(
                eq(conceptLinks.companyId, companyId),
                inArray(conceptLinks.fromConceptId, conceptIds),
                inArray(conceptLinks.toConceptId, conceptIds),
              ),
            )
            .limit(1000);

    const notes = exportObsidianNotes({
      concepts: membershipRows.map((row) => ({
        id: row.conceptId,
        title: row.title,
        body: row.body,
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
        sourceClass: asSourceClass(row.sourceClass),
        sourceRef: row.sourceRef,
      })),
      links: linkRows.map((link) => ({
        fromConceptId: link.fromConceptId,
        toConceptId: link.toConceptId,
        relation: asConceptLinkRelation(link.relation),
        weightBand: asWeightBand(link.weightBand),
      })),
      libraryName: library.name,
    });

    // D-040: include topic articles that reference any exported concept.
    const topicNotes =
      conceptIds.length === 0
        ? []
        : await (async () => {
            const memberships = await db
              .select({
                topicId: topicConcepts.topicId,
                conceptId: topicConcepts.conceptId,
                sortOrder: topicConcepts.sortOrder,
                title: concepts.title,
                topicTitle: researchTopics.title,
                synopsisMd: researchTopics.synopsisMd,
                status: researchTopics.status,
                priority: researchTopics.priority,
              })
              .from(topicConcepts)
              .innerJoin(researchTopics, eq(researchTopics.id, topicConcepts.topicId))
              .innerJoin(concepts, eq(concepts.id, topicConcepts.conceptId))
              .where(
                and(
                  eq(researchTopics.companyId, companyId),
                  inArray(topicConcepts.conceptId, conceptIds),
                ),
              )
              .orderBy(asc(topicConcepts.sortOrder))
              .limit(2000);

            const byTopic = new Map<
              string,
              {
                id: string;
                title: string;
                synopsisMd: string;
                status: string;
                priority: string;
                memberTitles: string[];
              }
            >();
            for (const row of memberships) {
              let bucket = byTopic.get(row.topicId);
              if (!bucket) {
                bucket = {
                  id: row.topicId,
                  title: row.topicTitle,
                  synopsisMd: row.synopsisMd ?? '',
                  status: row.status,
                  priority: row.priority,
                  memberTitles: [],
                };
                byTopic.set(row.topicId, bucket);
              }
              if (!bucket.memberTitles.includes(row.title)) {
                bucket.memberTitles.push(row.title);
              }
            }

            return exportObsidianTopicNotes({
              topics: [...byTopic.values()],
              folder: 'topics',
            });
          })();

    const zip = new JSZip();
    for (const note of notes) {
      zip.file(note.filename, note.markdown);
    }
    for (const note of topicNotes) {
      zip.file(note.filename, note.markdown);
    }

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    const filename = obsidianZipFilename(library.name);
    return new NextResponse(Buffer.from(zipBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
