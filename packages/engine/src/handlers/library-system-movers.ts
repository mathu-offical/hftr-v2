import { and, eq } from 'drizzle-orm';
import { EvidencePackage, SystemTopicScope } from '@hftr/contracts';
import { z } from 'zod';
import {
  gatherAlpacaBarsEvidence,
  normalizeToEvidencePackage,
  resolveBrokerAdapter,
} from '@hftr/adapters';
import { decryptSecret } from '@hftr/secrets';
import { brokerConnections, companies, modules } from '@hftr/db/schema';
import { ensureSystemLibrary } from '../libraries/ensure-system-library';
import { getSystemLibraryEntry } from '../libraries/system-library-registry';
import { corroborateAndNormalize } from '../research/verified-normalize';
import { persistVerifiedBundle } from '../research/seal-persist';
import { loadLatestValidSeal } from '../research/seal-load';
import { registerHandler } from './registry';

const SystemMoversPayload = z.object({
  companyId: z.string().uuid(),
});

/** Liquid universe for paper movers scan — qualitative ranking only. */
const DEFAULT_MOVERS_UNIVERSE = ['SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META'] as const;

function buildMoversReportBody(opts: {
  corroborationBand: string;
  itemHeadlines: string[];
  feedClass: string;
}): string {
  const notes =
    opts.itemHeadlines.length > 0
      ? opts.itemHeadlines.map((h) => `- ${h}`).join('\n')
      : '- No multi-source leadership cluster sealed this window; lenses remain authoritative.';

  return [
    '# Daily movers report',
    '',
    '## Scan window',
    '',
    `Paper scan via ${opts.feedClass} with corroboration band ${opts.corroborationBand}.`,
    'Values stay on the ValueRef path; this report is qualitative only.',
    '',
    '## Leadership notes',
    '',
    notes,
    '',
    'Cross-check [[relative_strength_leaders]] before admitting sympathy names.',
    '',
    '## Related lenses',
    '',
    'Pair with [[volume_expansion_watch]] and [[sector_rotation_signal]] when rotation context matters.',
  ].join('\n');
}

async function loadAlpacaPaperCredentials(
  db: Parameters<typeof ensureSystemLibrary>[0],
  companyId: string,
): Promise<{ keyId: string; secret: string } | null> {
  const [company] = await db
    .select({ brokerConnectionId: companies.brokerConnectionId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company?.brokerConnectionId) return null;

  const [conn] = await db
    .select()
    .from(brokerConnections)
    .where(
      and(
        eq(brokerConnections.id, company.brokerConnectionId),
        eq(brokerConnections.venue, 'alpaca'),
        eq(brokerConnections.mode, 'paper'),
        eq(brokerConnections.status, 'connected'),
      ),
    )
    .limit(1);
  if (!conn) return null;

  try {
    const plain = decryptSecret(conn.ciphertext, 'broker_credentials');
    const credentials = JSON.parse(plain) as { keyId?: string; secret?: string; apiKeyId?: string; apiSecret?: string };
    const keyId = credentials.keyId ?? credentials.apiKeyId;
    const secret = credentials.secret ?? credentials.apiSecret;
    if (!keyId?.trim() || !secret?.trim()) return null;
    // Confirm adapter resolves without throwing
    resolveBrokerAdapter({
      connection: {
        venue: 'alpaca',
        mode: 'paper',
        status: 'connected',
        credentials,
      },
      nowMs: () => Date.now(),
      paperSim: {
        getQuote: () => {
          throw new Error('unused');
        },
        startingCashCents: 0,
      },
    });
    return { keyId: keyId.trim(), secret: secret.trim() };
  } catch {
    return null;
  }
}

registerHandler('library.system_movers', async ({ db, clock, job }) => {
  const payload = SystemMoversPayload.parse(job.payload);
  const now = new Date(clock.nowMs());
  const nowMs = clock.nowMs();

  const libraryId = await ensureSystemLibrary(db, payload.companyId, SystemTopicScope.MOVERS, now, {
    refreshPlaceholders: true,
  });

  const entry = getSystemLibraryEntry(SystemTopicScope.MOVERS);
  if (!entry) return;

  const subjectKey = 'daily';
  const existing = await loadLatestValidSeal(db, {
    companyId: payload.companyId,
    kind: 'movers_board',
    subjectKey,
    nowMs,
  });
  if (existing) {
    return;
  }

  const companyModules = await db
    .select({ id: modules.id, type: modules.type })
    .from(modules)
    .where(eq(modules.companyId, payload.companyId));
  const ownerModuleId =
    companyModules.find((m) => m.type === 'research')?.id ??
    companyModules.find((m) => m.type === 'librarian')?.id ??
    companyModules.find((m) => m.type === 'library')?.id ??
    companyModules.find((m) => m.type === 'math')?.id;
  if (!ownerModuleId) return;

  const evidence: EvidencePackage[] = [];
  const creds = await loadAlpacaPaperCredentials(db, payload.companyId);
  let feedClass = 'system_movers_rank';

  if (creds) {
    for (const symbol of DEFAULT_MOVERS_UNIVERSE.slice(0, 6)) {
      try {
        const pkgs = await gatherAlpacaBarsEvidence({
          query: symbol,
          credentials: creds,
        });
        evidence.push(...pkgs);
        if (pkgs[0]?.feedClass) feedClass = pkgs[0].feedClass;
      } catch {
        // Soft-fail per symbol; placeholders already refreshed.
      }
    }
  }

  evidence.push(
    normalizeToEvidencePackage({
      sourceKind: 'catalog',
      feedClass: 'system_movers_rank',
      title: 'Cross-sectional leadership scan',
      summary:
        'Model-free relative strength and participation ranking across the paper movers universe. Bands only.',
      externalRef: null,
      authorityClass: 'DETERMINISTIC',
      legalUseClass: 'ALLOWED',
      expiresAt: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
    }),
  );

  const bundle = corroborateAndNormalize({
    evidence,
    kind: 'movers_board',
    subjectKey,
    title: 'Daily movers board',
    nowMs,
    topicScope: SystemTopicScope.MOVERS,
  });
  if (!bundle) return;

  const itemHeadlines = bundle.view.items
    .map((item) => item.headline ?? item.symbolOrSector ?? '')
    .filter((h) => h.length > 0)
    .slice(0, 8);

  const reportBody = buildMoversReportBody({
    corroborationBand: bundle.corroborationBand,
    itemHeadlines,
    feedClass,
  });

  await persistVerifiedBundle({
    db,
    companyId: payload.companyId,
    moduleId: ownerModuleId,
    bundle,
    reportBody,
    reportTitle: 'daily_movers_report',
    libraryId,
    ownerModuleId,
    tags: entry.kindTags,
    now,
  });
});
