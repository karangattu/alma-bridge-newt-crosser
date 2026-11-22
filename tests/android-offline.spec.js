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
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Newt Crosser', level: 1 })).toBeVisible();
  await expect.poll(() => page.locator('.cover-art').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await page.getByText('Set leaderboard name').click();
  await page.getByLabel('Name on the leaderboard').fill('TabletNewt');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window._game?.scene.getScene('Game')?.newt?.texture.key)).toBe('newt_sheet');
  expect(await page.evaluate(() => window._game.scene.getScene('Game').cleanerSp.texture.getFrameNames().length)).toBe(16);
  const art = await page.evaluate(() => {
    const scene = window._game.scene.getScene('Game');
    const traffic = new Set(scene.vehPool.flatMap(type => type.variants.map(variant => variant.key)));
    const vehicle = scene.vehicles.getChildren()[0];
    window.trafficFrames = new Set([vehicle.frame.name]);
    vehicle.on('animationupdate', (_animation, frame) => window.trafficFrames.add(frame.textureFrame));
    return {
      backgrounds: ['asphalt', 'reservoir', 'forest'].every(key => scene.textures.exists(key)),
      newtFrames: scene.newt.texture.getFrameNames().length,
      trafficFrames: Array.from(traffic, key => scene.anims.get(key).frames.length),
      trafficPlaying: vehicle.anims.isPlaying,
    };
  });
  expect(art).toEqual({
    backgrounds: true,
    newtFrames: 8,
    trafficFrames: Array(12).fill(4),
    trafficPlaying: true,
  });
  await expect.poll(() => page.evaluate(() => window.trafficFrames.size)).toBe(4);

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
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.locator('#tutTitle')).toHaveText('Move forward');
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});
