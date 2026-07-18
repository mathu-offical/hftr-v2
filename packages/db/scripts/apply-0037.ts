import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const sql = neon(url);
  const before = await sql`select to_regclass('public.engine_utility_links') as reg`;
  console.log('before', before);
  if (before[0]?.reg) {
    console.log('table exists');
    return;
  }
  const ddl = readFileSync(
    new URL('../migrations/0037_engine_utility_links.sql', import.meta.url),
    'utf8',
  );
  for (const stmt of ddl
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    await sql.query(stmt, []);
    console.log('ran', stmt.slice(0, 72).replace(/\s+/g, ' '));
  }
  const after = await sql`select to_regclass('public.engine_utility_links') as reg`;
  console.log('after', after);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
