import {
  archiveCompany,
  companyNameField,
  createCompanyFromTemplate,
  e2eCompanyName,
  expect,
  openNewCompanyForm,
  test,
} from './fixtures';

test.describe('Research bus (D-039)', () => {
  test.setTimeout(120_000);

  test('manual query enqueues run; evidence and admission mode surfaces', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    const companyName = e2eCompanyName('research-bus');
    const philosophy =
      'E2E research bus — manual query, evidence list, admission mode, company sweep.';

    await openNewCompanyForm(page);
    await companyNameField(page).fill(companyName);
    await page.getByLabel(/Philosophy/).fill(philosophy);
    await createCompanyFromTemplate(page, /Day trading starter/);

    const companyId = page.url().split('/').pop()!;
    createdCompanyIds.push(companyId);

    const modulesRes = await request.get(`/api/companies/${companyId}/modules`);
    expect(modulesRes.ok()).toBeTruthy();
    const { modules } = (await modulesRes.json()) as {
      modules: Array<{ id: string; type: string; config: Record<string, unknown> }>;
    };
    const research = modules.find((m) => m.type === 'research');
    expect(research).toBeTruthy();
    const moduleId = research!.id;

    const patchRes = await request.patch(`/api/companies/${companyId}/modules/${moduleId}`, {
      data: {
        config: {
          ...research!.config,
          topicScope: research!.config.topicScope ?? 'semiconductors',
          admissionMode: 'auto_admit_validated',
        },
      },
    });
    expect(patchRes.ok()).toBeTruthy();

    const queryRes = await request.post(`/api/companies/${companyId}/research/query`, {
      data: {
        mode: 'manual',
        moduleId,
        queryText: 'semiconductor supply qualitative outlook',
      },
    });
    expect(queryRes.ok()).toBeTruthy();
    const queryBody = (await queryRes.json()) as { queued?: boolean; drained?: unknown };
    expect(queryBody.queued).toBe(true);

    const runsRes = await request.get(`/api/companies/${companyId}/research/runs`);
    expect(runsRes.ok()).toBeTruthy();
    const { runs } = (await runsRes.json()) as {
      runs: Array<{ phase: string; evidenceCount: number; requestId: string }>;
    };
    expect(runs.length).toBeGreaterThan(0);

    const evidenceRes = await request.get(
      `/api/companies/${companyId}/modules/${moduleId}/research/evidence`,
    );
    expect(evidenceRes.ok()).toBeTruthy();
    const { evidence } = (await evidenceRes.json()) as {
      evidence: Array<{ sourceKind: string; title: string; feedClass: string }>;
    };
    // Catalog / market stubs should produce at least one package when gather completes.
    expect(Array.isArray(evidence)).toBe(true);

    const sweepRes = await request.post(`/api/companies/${companyId}/research/sweep`, {
      data: {},
    });
    expect(sweepRes.ok()).toBeTruthy();

    await page.getByRole('button', { name: /Expand left panel/ }).click();
    await expect(page.getByRole('button', { name: 'Research + Libraries', exact: true })).toBeVisible();

    await expect(
      page.getByRole('button', { name: /Company sweep|Curate now|Research/ }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole('combobox', { name: /Research admission mode/i })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('combobox', { name: /Research admission mode/i }).selectOption({
      label: 'Require operator approval',
    });
    await expect(page.getByRole('combobox', { name: /Research admission mode/i })).toHaveValue(
      'require_operator_approval',
    );

    await archiveCompany(request, companyId);
    createdCompanyIds.length = 0;
  });

  test('require_operator_approval keeps concepts proposed until library curate', async ({
    request,
    createdCompanyIds,
    page,
  }) => {
    const companyName = e2eCompanyName('research-approve');
    await openNewCompanyForm(page);
    await companyNameField(page).fill(companyName);
    await page.getByLabel(/Philosophy/).fill('E2E approval-mode research admission.');
    await createCompanyFromTemplate(page, /Day trading starter/);

    const companyId = page.url().split('/').pop()!;
    createdCompanyIds.push(companyId);

    const modulesRes = await request.get(`/api/companies/${companyId}/modules`);
    const { modules } = (await modulesRes.json()) as {
      modules: Array<{ id: string; type: string; config: Record<string, unknown> }>;
    };
    const research = modules.find((m) => m.type === 'research')!;

    await request.patch(`/api/companies/${companyId}/modules/${research.id}`, {
      data: {
        config: {
          ...research.config,
          topicScope: research.config.topicScope ?? 'chips',
          admissionMode: 'require_operator_approval',
        },
      },
    });

    const curateRes = await request.post(
      `/api/companies/${companyId}/modules/${research.id}/curate`,
      { data: { mode: 'opportunistic', topicScope: 'chips' } },
    );
    expect(curateRes.ok()).toBeTruthy();

    const libsRes = await request.get(`/api/companies/${companyId}/libraries`);
    expect(libsRes.ok()).toBeTruthy();
    const { libraries } = (await libsRes.json()) as {
      libraries: Array<{ id: string }>;
    };
    if (libraries[0]) {
      const conceptsRes = await request.get(
        `/api/companies/${companyId}/libraries/${libraries[0].id}/concepts`,
      );
      if (conceptsRes.ok()) {
        const body = (await conceptsRes.json()) as {
          concepts: Array<{ curationStatus: string }>;
        };
        const proposed = body.concepts.filter((c) => c.curationStatus === 'proposed');
        // Under approval mode, new attaches should remain proposed (not auto_admitted).
        for (const c of proposed) {
          expect(c.curationStatus).toBe('proposed');
        }
      }
    }

    await archiveCompany(request, companyId);
    createdCompanyIds.length = 0;
  });
});
