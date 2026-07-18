import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyLinkGraph } from '../graph/module-links';

const loadCompanyLinkGraph = vi.fn<() => Promise<CompanyLinkGraph>>();
const resolveInboundLibraryModules = vi.fn();

vi.mock('../graph/module-links', () => ({
  loadCompanyLinkGraph: () => loadCompanyLinkGraph(),
  resolveInboundLibraryModules: (...args: unknown[]) => resolveInboundLibraryModules(...args),
}));

import { mirrorAdmittedSeedsToTrendLinkedLibraries } from './bootstrap';

const COMPANY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MECH_LIB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EVIDENCE_LIB_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONCEPT_A = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CONCEPT_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const NOW = new Date('2026-07-18T12:00:00.000Z');

type SelectResult = Array<Record<string, unknown>>;

function mockDb(handlers: {
  admittedConcepts?: SelectResult;
  targetLibraries?: SelectResult;
}) {
  const inserts: Array<{ libraryId: string; conceptId: string; curationStatus: string }> = [];
  let selectCall = 0;

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => {
          selectCall += 1;
          if (selectCall === 1) {
            return handlers.admittedConcepts ?? [];
          }
          return handlers.targetLibraries ?? [];
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((row: { libraryId: string; conceptId: string; curationStatus: string }) => {
        inserts.push(row);
        return {
          onConflictDoUpdate: vi.fn(async () => undefined),
        };
      }),
    })),
  };

  return { db: db as unknown as Parameters<typeof mirrorAdmittedSeedsToTrendLinkedLibraries>[0], inserts };
}

describe('mirrorAdmittedSeedsToTrendLinkedLibraries', () => {
  beforeEach(() => {
    loadCompanyLinkGraph.mockReset();
    resolveInboundLibraryModules.mockReset();
  });

  it('returns 0 when no trend modules have inbound library feeds', async () => {
    loadCompanyLinkGraph.mockResolvedValue({
      edges: [],
      modulesById: new Map([
        ['t1', { id: 't1', type: 'trend', status: 'active', config: {} }],
      ]),
    });
    resolveInboundLibraryModules.mockReturnValue([]);

    const { db } = mockDb({});
    const written = await mirrorAdmittedSeedsToTrendLinkedLibraries(
      db,
      COMPANY_ID,
      MECH_LIB_ID,
      NOW,
    );

    expect(written).toBe(0);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('returns 0 when mechanisms library has no admitted concepts', async () => {
    loadCompanyLinkGraph.mockResolvedValue({
      edges: [],
      modulesById: new Map([
        ['t1', { id: 't1', type: 'trend', status: 'active', config: {} }],
        ['lib1', { id: 'lib1', type: 'library', status: 'active', config: {} }],
      ]),
    });
    resolveInboundLibraryModules.mockReturnValue([
      { id: 'lib1', type: 'library', status: 'active', config: {} },
    ]);

    const { db } = mockDb({ admittedConcepts: [], targetLibraries: [] });
    const written = await mirrorAdmittedSeedsToTrendLinkedLibraries(
      db,
      COMPANY_ID,
      MECH_LIB_ID,
      NOW,
    );

    expect(written).toBe(0);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('mirrors admitted seeds into trend-linked libraries and skips mechanisms library', async () => {
    loadCompanyLinkGraph.mockResolvedValue({
      edges: [],
      modulesById: new Map([
        ['t1', { id: 't1', type: 'trend', status: 'active', config: {} }],
        ['lib-evidence', { id: 'lib-evidence', type: 'library', status: 'active', config: {} }],
      ]),
    });
    resolveInboundLibraryModules.mockReturnValue([
      { id: 'lib-evidence', type: 'library', status: 'active', config: {} },
    ]);

    const { db, inserts } = mockDb({
      admittedConcepts: [{ conceptId: CONCEPT_A }, { conceptId: CONCEPT_B }],
      targetLibraries: [
        { id: EVIDENCE_LIB_ID, moduleId: 'lib-evidence' },
        { id: MECH_LIB_ID, moduleId: 'lib-seeded' },
      ],
    });

    const written = await mirrorAdmittedSeedsToTrendLinkedLibraries(
      db,
      COMPANY_ID,
      MECH_LIB_ID,
      NOW,
    );

    expect(written).toBe(2);
    expect(inserts).toEqual([
      { libraryId: EVIDENCE_LIB_ID, conceptId: CONCEPT_A, curationStatus: 'auto_admitted' },
      { libraryId: EVIDENCE_LIB_ID, conceptId: CONCEPT_B, curationStatus: 'auto_admitted' },
    ]);
    expect(inserts.every((row) => row.libraryId !== MECH_LIB_ID)).toBe(true);
  });
});
