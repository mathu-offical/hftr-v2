import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

/**
 * Applies 0040 repair: drop legacy module_service_bindings_source_check and
 * reinstall XOR allowing user_research_key (D-093). Fixes service-coverage 500.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const sql = neon(url);

  const before = await sql`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.module_service_bindings'::regclass
      AND contype = 'c'
    ORDER BY conname
  `;
  console.log('before constraints', before);

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationPath = resolve(
    here,
    '../migrations/0040_module_service_bindings_source_check_repair.sql',
  );
  const ddl = readFileSync(migrationPath, 'utf8');
  const statements = ddl
    .split(';')
    .map((s) =>
      s
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    console.log('exec', stmt.slice(0, 72).replace(/\s+/g, ' '), '…');
    await sql.query(stmt);
  }

  const after = await sql`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.module_service_bindings'::regclass
      AND contype = 'c'
    ORDER BY conname
  `;
  console.log('after constraints', after);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
