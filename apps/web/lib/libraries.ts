import { and, eq } from 'drizzle-orm';
import { NotFoundError, scoping, type Db } from '@hftr/db';
import { libraries } from '@hftr/db/schema';

/** Ownership-scoped library load — 404 on miss (no existence leak). */
export async function getOwnedLibrary(
  db: Db,
  clerkUserId: string,
  companyId: string,
  libraryId: string,
) {
  await scoping.getOwnedCompany(db, clerkUserId, companyId);
  const rows = await db
    .select()
    .from(libraries)
    .where(and(eq(libraries.id, libraryId), eq(libraries.companyId, companyId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError('library');
  return row;
}

/** Safe attachment filename segment from a library display name. */
export function obsidianZipFilename(libraryName: string): string {
  const slug = libraryName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${slug || 'library'}-obsidian.zip`;
}
