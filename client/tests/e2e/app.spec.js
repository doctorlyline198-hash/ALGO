import { test, expect } from '@playwright/test';

const TIMEFRAME_SPAM_SEQUENCE = ['1s', '5s', '15s', '30s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'];

async function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push({ text: message.text(), location: message.location() });
    }
  });
  return errors;
}

test.describe('UI stress smoke tests', () => {
  test('indicator toggling and timeframe thrash emits no console errors', async ({ page }) => {
    const consoleErrors = await collectConsoleErrors(page);

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByText(/Streaming real-time candles/i)).toBeVisible();

  const indicatorButton = page.getByRole('button', { name: /^Indicators/i });
  await expect(indicatorButton).toBeVisible();

    await indicatorButton.click();
    const indicatorPanel = page.locator('.menu-panel').filter({ has: page.getByText('Indicators') });
    const indicatorCheckboxes = indicatorPanel.getByRole('checkbox');
    const toggleCount = Math.min(await indicatorCheckboxes.count(), 6);

    expect(toggleCount).toBeGreaterThan(0);

    for (let i = 0; i < toggleCount; i += 1) {
      const checkbox = indicatorCheckboxes.nth(i);
      await checkbox.click();
      await checkbox.click();
    }

    for (let i = 0; i < toggleCount; i += 1) {
      await indicatorCheckboxes.nth(i).check({ force: true });
    }

    await page.getByRole('button', { name: 'Close panel' }).click();
    await expect(indicatorPanel).toBeHidden();

    const timeframeTrigger = page.getByRole('button', { name: /Timeframes/i });
    for (let i = 0; i < TIMEFRAME_SPAM_SEQUENCE.length; i += 1) {
      const label = TIMEFRAME_SPAM_SEQUENCE[i];
      await timeframeTrigger.click();
      const row = page.locator('.dropdown-row', { hasText: label });
      const checkbox = row.getByRole('checkbox');
      if (await checkbox.isDisabled()) {
        await page.keyboard.press('Escape');
        continue;
      }
      await checkbox.check({ force: true });
      const setDefaultButton = row.getByRole('button', { name: 'Set default' });
      if (await setDefaultButton.isEnabled()) {
        await setDefaultButton.click();
      }
      await page.waitForTimeout(150);
      await page.keyboard.press('Escape');
    }

    const searchInput = page.getByPlaceholder('Search contract');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('MNQZ5');
    await searchInput.press('Enter');
    await page.waitForTimeout(200);
    await searchInput.fill('MGCZ5');
    await searchInput.press('Enter');

    await expect(consoleErrors).toHaveLength(0);
  });
});
