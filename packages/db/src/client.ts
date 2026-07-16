import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema/index';

export type Db = NeonHttpDatabase<typeof schema>;

let cached: Db | null = null;

/**
 * Lazily construct the drizzle client so importing this package never throws
 * when DATABASE_URL is absent (e.g. during static builds and unit tests).
 */
export function getDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set (see .env.example)');
  }
  cached = drizzle(neon(url), { schema });
  return cached;
}
