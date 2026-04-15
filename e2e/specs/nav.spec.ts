import { expect, test } from '@playwright/test';

test.describe('Navigation suite', () => {
  test('Navigation bar', async ({ page }) => {
    await page.goto('http://localhost:3080/', { timeout: 5000 });

    await page.getByTestId('nav-user').click();
    const navSettings = await page.getByTestId('nav-user').isVisible();
    expect(navSettings).toBeTruthy();
  });

  test('Settings modal', async ({ page }) => {
    await page.goto('http://localhost:3080/', { timeout: 5000 });
    await page.getByTestId('nav-user').click();
    await page.getByText('Settings').click();

    const modal = await page.getByRole('dialog', { name: 'Settings' }).isVisible();
    expect(modal).toBeTruthy();

    const modalTitle = await page.getByRole('heading', { name: 'Settings' }).textContent();
    expect(modalTitle?.length).toBeGreaterThan(0);
    expect(modalTitle).toEqual('Settings');

    const modalTabList = await page.getByRole('tablist', { name: 'Settings' }).isVisible();
    expect(modalTabList).toBeTruthy();

    const chatTabPanel = await page.getByRole('tabpanel', { name: 'Chat' }).isVisible();
    expect(chatTabPanel).toBeTruthy();

    const modalClearConvos = await page.getByRole('button', { name: 'Clear' }).isVisible();
    expect(modalClearConvos).toBeTruthy();

    await expect(page.getByTestId('font-size-selector')).toBeVisible();
  });
});
