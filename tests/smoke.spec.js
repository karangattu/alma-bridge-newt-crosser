const { test, expect } = require('@playwright/test');

test('loads the splash screen and starts the game', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveTitle('Newt Crosser');
  await expect(page.getByPlaceholder('Enter your name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Learn more at bioblitz\.club\/newts/i })).toBeVisible();

  await page.getByPlaceholder('Enter your name').fill('Smoke');
  await page.getByRole('button', { name: 'Play' }).click();

  await expect.poll(async () => page.evaluate(() => {
    const splash = document.getElementById('splash');
    return {
      splashOpacity: splash ? getComputedStyle(splash).opacity : null,
      splashPointerEvents: splash ? getComputedStyle(splash).pointerEvents : null,
      canvasCount: document.querySelectorAll('#game-wrapper canvas').length,
      hasGame: Boolean(window._game),
    };
  })).toEqual({
    splashOpacity: '0',
    splashPointerEvents: 'none',
    canvasCount: 1,
    hasGame: true,
  });

  await expect(page.locator('#game-wrapper canvas')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});
