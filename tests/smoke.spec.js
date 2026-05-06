const { test, expect } = require('@playwright/test');

test('loads the splash screen and starts the game', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveTitle('Newt Crosser');
  await expect(page.getByPlaceholder('Your name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(page.getByRole('link', { name: /bioblitz\.club\/newts/i })).toBeVisible();

  await page.getByPlaceholder('Your name').fill('Smoke');
  await page.getByRole('button', { name: 'Play' }).click();
  await page.getByRole('button', { name: 'Got It!' }).click();

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

test('shows game over and leaderboard before allowing replay after final life', async ({ page }) => {
  await page.addInitScript(() => {
    window.tutorialShown = true;
  });

  await page.goto('/');
  await page.getByPlaceholder('Your name').fill('FinalLife');
  await page.getByRole('button', { name: 'Play' }).click();

  await expect.poll(async () => page.evaluate(() => Boolean(window._game))).toBe(true);

  await page.evaluate(() => {
    window.leaderboardEntries = [
      { name: 'Ada', score: 7 },
      { name: 'Grace', score: 5 },
    ];
    const scene = window._game.scene.getScene('Game');
    scene.score = 3;
    scene.lives = 1;
    scene.updateHUD();
    scene.onHit();
  });

  await page.mouse.click(50, 50);

  await expect.poll(async () => page.evaluate(() => {
    const scene = window._game.scene.getScene('Game');
    const gameOverTexts = scene.goContainer.list
      .filter((child) => child.text)
      .map((child) => child.text);

    return {
      isOver: scene.isOver,
      lives: scene.lives,
      score: scene.score,
      gameOverVisible: scene.goContainer.visible,
      hasGameOverTitle: gameOverTexts.includes('GAME OVER'),
      hasLeaderboardTitle: gameOverTexts.includes('TOP SCORES'),
    };
  })).toEqual({
    isOver: true,
    lives: 0,
    score: 3,
    gameOverVisible: true,
    hasGameOverTitle: true,
    hasLeaderboardTitle: true,
  });
});
