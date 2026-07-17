import { test, expect } from './fixtures';

test.describe('Companies directory', () => {
  test('loads and exposes template choices in the create form', async ({ page }) => {
    await page.goto('/companies');

    await expect(page.getByRole('heading', { name: 'Companies' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New company' })).toBeVisible();

    await page.getByRole('button', { name: 'New company' }).click();

    await expect(page.getByRole('heading', { name: 'New company' })).toBeVisible();
    await expect(page.getByText('Start from')).toBeVisible();

    await expect(page.getByRole('button', { name: /Blank/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Day trading starter/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Trend research lab/ })).toBeVisible();

    await page.getByRole('button', { name: /Day trading starter/ }).click();
    await expect(page.getByRole('heading', { name: 'Template setup' })).toBeVisible();
    await expect(page.getByText(/Required · Capital allocation/)).toBeVisible();
    await expect(page.getByText(/Required · Topic \/ sector/)).toBeVisible();
    await expect(page.getByText(/Required · Target exit/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip setup & open canvas' })).toBeVisible();
  });
});
