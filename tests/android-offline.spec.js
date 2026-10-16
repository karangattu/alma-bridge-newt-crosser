const { test, expect } = require('@playwright/test');

test('Android bundle starts without online resources and keeps personal bests after reopening', async ({ page }) => {
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });

  await page.goto('/dist/android-web/index.html');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.getByPlaceholder('Your name').fill('TabletNewt');
  await page.locator('#skipTutCheck').check();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => page.evaluate(() => window._game?.scene.getScene('Game')?.newt?.texture.key)).toBe('newt_sheet');
  expect(await page.evaluate(() => window._game.scene.getScene('Game').cleanerSp.texture.getFrameNames().length)).toBe(16);

  await page.evaluate(async () => {
    await submitScore(9);
    await submitScore(3);
    playerName = ' tabletnewt ';
    await submitScore(5);
  });
  await page.reload();
  await expect(page.locator('#hiScore')).toHaveText('9 · TabletNewt');
  expect(await page.evaluate(() => leaderboardEntries)).toEqual([{ name: 'TabletNewt', score: 9 }]);
  expect(await page.evaluate(() => document.fonts.check('700 16px Inter'))).toBe(true);
  await expect.poll(() => page.evaluate(() => document.getElementById('introVideo').readyState)).toBeGreaterThanOrEqual(1);
  await page.evaluate(() => document.getElementById('introVideo').play());
  await expect.poll(() => page.evaluate(() => document.getElementById('introVideo').currentTime)).toBeGreaterThan(0);
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});
