import {
  archiveCompany,
  companyNameField,
  createCompanyFromTemplate,
  e2eCompanyName,
  expect,
  openNewCompanyForm,
  test,
} from './fixtures';

test.describe('Service settings & operating observability', () => {
  test.setTimeout(90_000);

  test('user settings modal and company operating tab surfaces', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    await openNewCompanyForm(page);
    await companyNameField(page).fill(e2eCompanyName('settings-ops'));
    await page.getByLabel(/Philosophy/).fill('E2E settings and operating observability check.');
    await createCompanyFromTemplate(page, /Blank/, { skipSetup: false });
    const companyId = page.url().split('/').pop()!;
    createdCompanyIds.push(companyId);

    await page.getByRole('button', { name: 'Open user settings' }).click();
    await expect(page.getByRole('dialog', { name: 'User settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'LLM providers' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Brokers' })).toBeVisible();

    await expect(page.getByText('Anthropic (Claude)')).toBeVisible();
    await expect(page.getByText('Mistral')).toBeVisible();
    await expect(page.getByText('Groq')).toBeVisible();
    await expect(page.getByText('Cerebras')).toBeVisible();
    await expect(page.getByText('Fireworks')).toBeVisible();
    await expect(page.getByText('OpenRouter')).toBeVisible();

    await page.getByRole('button', { name: 'Brokers' }).click();
    await expect(page.getByText('Alpaca paper')).toBeVisible();
    await expect(page.getByLabel('Alpaca key ID')).toBeVisible();
    await expect(page.getByLabel('Alpaca secret')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save credentials' })).toBeVisible();

    await page.getByRole('button', { name: 'Close settings' }).click();

    await page.getByRole('button', { name: 'Company ▾' }).click();
    await page.getByRole('button', { name: 'LLM / operating' }).click();

    await expect(page.getByText('Trading capital caps')).toBeVisible();
    await page.waitForResponse(
      (response) => response.url().includes(`/api/companies/${companyId}/broker`) && response.ok(),
    );
    await expect(page.getByText('Virtual cap')).toBeVisible();
    await expect(page.getByText('Provider health')).toBeVisible();
    await expect(page.getByText('LLM privacy & models')).toBeVisible();
    await expect(page.getByText('Broker connection')).toBeVisible();
    await expect(page.getByText('Recent LLM calls')).toBeVisible();
    await expect(page.getByText('No broker bound — paper sim.')).toBeVisible();

    const brokerRes = await request.get(`/api/companies/${companyId}/broker`);
    expect(brokerRes.ok()).toBeTruthy();
    const brokerJson = (await brokerRes.json()) as {
      bound: boolean;
      virtualBalanceCents: string;
      effectiveCapCents: string;
      liveGateBlocked: boolean;
    };
    expect(brokerJson.bound).toBe(false);
    expect(brokerJson.virtualBalanceCents).toBeTruthy();
    expect(brokerJson.effectiveCapCents).toBe(brokerJson.virtualBalanceCents);
    expect(brokerJson.liveGateBlocked).toBe(false);

    await page.getByRole('button', { name: 'Close ▲' }).click();
    await archiveCompany(request, companyId);
    createdCompanyIds.length = 0;
  });
});
