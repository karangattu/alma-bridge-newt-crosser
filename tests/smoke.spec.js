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
  await page.locator('#tutBtn').click();

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

test('runs through the interactive tutorial successfully', async ({ page }) => {
  await page.goto('/');

  await page.getByPlaceholder('Your name').fill('TutorialNewt');
  await page.getByRole('button', { name: 'Play' }).click();

  await expect(page.locator('#tutorial')).toBeVisible();
  await expect(page.locator('#tutTitle')).toHaveText('Step 1: Move forward');

  await page.waitForTimeout(500);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#tutTitle')).toHaveText('Step 2: Steer left & right');

  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#tutTitle')).toHaveText('Step 3: Dodge vehicles');

  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowUp');
  }

  await expect(page.locator('#tutTitle')).toHaveText('You did it!');
  await page.getByRole('button', { name: 'Start Game' }).click();

  const localStorageTutorial = await page.evaluate(() => localStorage.getItem('tutorialCompleted'));
  expect(localStorageTutorial).toBe('true');
  await expect(page.locator('#tutorial')).toBeHidden();
});

test('allows skipping the tutorial from the splash screen checkbox', async ({ page }) => {
  await page.goto('/');

  await page.getByPlaceholder('Your name').fill('Skipper');
  await page.locator('#skipTutCheck').check();
  await page.getByRole('button', { name: 'Play' }).click();

  await expect.poll(async () => page.evaluate(() => Boolean(window._game))).toBe(true);
  await expect(page.locator('#tutorial')).toBeHidden();

  const localStorageTutorial = await page.evaluate(() => localStorage.getItem('tutorialCompleted'));
  expect(localStorageTutorial).toBe('true');
});

test('volunteer cleaning logic is triggered on hit and cleans the splat', async ({ page }) => {
  await page.addInitScript(() => {
    window.tutorialCompleted = true;
  });

  await page.goto('/');
  await page.getByPlaceholder('Your name').fill('CleanerTest');
  await page.getByRole('button', { name: 'Play' }).click();

  await expect.poll(async () => page.evaluate(() => Boolean(window._game))).toBe(true);

  await page.evaluate(() => {
    const scene = window._game.scene.getScene('Game');
    scene.lives = 3;
    scene.updateHUD();
    scene.newt.x = 100;
    scene.onHit();
  });

  await expect.poll(async () => page.evaluate(() => {
    const scene = window._game.scene.getScene('Game');
    return {
      splatCount: scene.splats.length,
      cleanerState: scene.cleanerState
    };
  })).toEqual({
    splatCount: 1,
    cleanerState: 'entering'
  });

  await expect.poll(async () => page.evaluate(() => {
    const scene = window._game.scene.getScene('Game');
    return {
      splatCount: scene.splats.length,
      cleanerState: scene.cleanerState
    };
  }), { timeout: 15000 }).toEqual({
    splatCount: 0,
    cleanerState: 'exiting'
  });
});

test('renders Alma Bridge Road text markings on the road itself', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Your name').fill('RoadLabelTest');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(async () => page.evaluate(() => Boolean(window._game))).toBe(true);

  const roadTextExists = await page.evaluate(() => {
    const scene = window._game.scene.getScene('Game');
    const texts = scene.children.list
      .filter(child => child.type === 'Text')
      .map(child => child.text);
    return texts.includes('ALMA BRIDGE ROAD');
  });

  expect(roadTextExists).toBe(true);
});



