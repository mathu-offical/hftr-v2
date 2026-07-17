#!/usr/bin/env node
/**
 * Opt-in credentialed smoke against Alpaca paper API.
 * Never logs secret values. Does not touch live trading endpoints.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `smoke-alpaca-paper — opt-in Alpaca paper API smoke

Usage:
  node scripts/smoke-alpaca-paper.mjs [--help]
  pnpm smoke:alpaca-paper

Environment (automation path):
  ALPACA_PAPER_SMOKE=1            Required to run (otherwise exits 0 with skip)
  ALPACA_PAPER_KEY                Paper API key ID (alias: ALPACA_PAPER_KEY_ID)
  ALPACA_PAPER_SECRET             Paper API secret
  ALPACA_PAPER_SUBMIT=1           Optional: submit+cancel one tiny SPY paper market order

App-saved credentials (User Settings → Brokers → Alpaca) are encrypted at rest and
cannot be read by this script. For the full encrypt → verify → bind → dispatch spine,
follow agent-docs/ops/runbook.md § Alpaca paper smoke (manual UI path).

Exits 0 on skip; non-zero when smoke tests fail.
`;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

if (process.env.ALPACA_PAPER_SMOKE !== '1') {
  console.log('skip: set ALPACA_PAPER_SMOKE=1 to run credentialed Alpaca paper smoke');
  process.exit(0);
}

const keyId = process.env.ALPACA_PAPER_KEY ?? process.env.ALPACA_PAPER_KEY_ID ?? '';
const secret = process.env.ALPACA_PAPER_SECRET ?? '';

if (keyId.length < 8 || secret.length < 8) {
  console.log(
    'skip: set ALPACA_PAPER_KEY (or ALPACA_PAPER_KEY_ID) and ALPACA_PAPER_SECRET for automation',
  );
  console.log(
    '      app-saved credentials require the manual UI path — see agent-docs/ops/runbook.md',
  );
  process.exit(0);
}

const result = spawnSync(
  'pnpm',
  ['--filter', '@hftr/adapters', 'exec', 'vitest', 'run', 'src/alpaca/paper-smoke.test.ts'],
  { cwd: root, stdio: 'inherit', env: process.env },
);

process.exit(result.status ?? 1);
