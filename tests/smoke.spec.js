const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

async function startGameAtGameOver(page, { name = 'FinalLife', score = 3 } = {}) {
  await page.route('**/rest/v1/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));
  await page.goto('/');
  await page.getByPlaceholder('Your name').fill(name);
  await page.getByRole('button', { name: 'Play' }).click();

  await expect.poll(async () => page.evaluate(() => Boolean(window._game))).toBe(true);

  await page.evaluate((finalScore) => {
    window.leaderboardEntries = [
      { name: 'Ada', score: 7 },
      { name: 'Grace', score: 5 },
    ];
    const scene = window._game.scene.getScene('Game');
    scene.score = finalScore;
    scene.lives = 1;
    scene.updateHUD();
    scene.onHit();
  }, score);

  await expect.poll(async () => page.evaluate(() => {
    const scene = window._game.scene.getScene('Game');
    return scene.goContainer.visible && scene.canReplay;
  })).toBe(true);
}

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

test('newt walks through its poses only after moving and rests on respawn', async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
  await page.goto('/');
  await page.getByPlaceholder('Your name').fill('WalkingNewt');
  await page.locator('#skipTutCheck').check();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window._game?.scene.getScene('Game').newt))).toBe(true);

  expect(await page.evaluate(() => window._game.scene.getScene('Game').newt.anims.isPlaying)).toBe(false);
  const startX = await page.evaluate(() => {
    const scene = window._game.scene.getScene('Game');
    window.walkFrames = [];
    scene.newt.on('animationupdate', (_animation, frame) => window.walkFrames.push(frame.textureFrame));
    return scene.newt.x;
  });
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => window._game.scene.getScene('Game').newt.x)).toBeGreaterThan(startX);
  await expect.poll(() => page.evaluate(() => window._game.scene.getScene('Game').newt.anims.isPlaying)).toBe(false);
  expect(await page.evaluate(() => new Set(window.walkFrames).size)).toBeGreaterThanOrEqual(7);
  expect(await page.evaluate(() => window._game.scene.getScene('Game').newt.frame.name)).toBe(0);

  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => window._game.scene.getScene('Game').newt.anims.isPlaying)).toBe(true);
  await page.evaluate(() => window._game.scene.getScene('Game').resetNewt());
  expect(await page.evaluate(() => {
    const newt = window._game.scene.getScene('Game').newt;
    return { walking: newt.anims.isPlaying, frame: newt.frame.name, angle: newt.angle };
  })).toEqual({ walking: false, frame: 0, angle: 0 });
});

test('shows explicit Play Again and Home actions after the final life', async ({ page }) => {
  await startGameAtGameOver(page);

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
      hasPlayAgain: gameOverTexts.includes('PLAY AGAIN'),
      hasHome: gameOverTexts.includes('HOME'),
    };
  })).toEqual({
    isOver: true,
    lives: 0,
    score: 3,
    gameOverVisible: true,
    hasGameOverTitle: true,
    hasLeaderboardTitle: true,
    hasPlayAgain: true,
    hasHome: true,
  });
});

test('Play Again starts a fresh run from the end screen', async ({ page }) => {
  await startGameAtGameOver(page, { score: 3 });

  await page.evaluate(() => {
    const scene = window._game.scene.getScene('Game');
    scene.playAgainButton.emit('pointerdown', { event: { stopPropagation() {} } });
  });

  await expect.poll(async () => page.evaluate(() => {
    const scene = window._game.scene.getScene('Game');
    return { score: scene.score, lives: scene.lives, isOver: scene.isOver };
  })).toEqual({ score: 0, lives: 3, isOver: false });
});

test('Home returns to the splash screen from the end screen', async ({ page }) => {
  await startGameAtGameOver(page);

  await page.evaluate(() => {
    const scene = window._game.scene.getScene('Game');
    scene.homeButton.emit('pointerdown', { event: { stopPropagation() {} } });
  });

  await expect.poll(async () => page.evaluate(() => {
    const splash = document.getElementById('splash');
    return {
      opacity: getComputedStyle(splash).opacity,
      pointerEvents: getComputedStyle(splash).pointerEvents,
    };
  })).toEqual({ opacity: '1', pointerEvents: 'auto' });
});

test('score submissions use the atomic personal-best endpoint', async ({ page }) => {
  const requests = [];
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    requests.push({ url: request.url(), method: request.method(), body: request.postDataJSON() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await page.evaluate(async () => {
    playerName = 'RepeatPlayer';
    await submitScore(11);
  });

  expect(requests).toEqual(expect.arrayContaining([
    expect.objectContaining({
      url: expect.stringContaining('/rest/v1/rpc/submit_alma_bridge_newt_crosser_score'),
      method: 'POST',
      body: { player_name: 'RepeatPlayer', player_score: 11 },
    }),
  ]));
});

test('leaderboard migration keeps one case-insensitive personal best per name', () => {
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260730_keep_highest_score_per_name.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  expect(sql).toMatch(/unique index[\s\S]*lower\s*\(\s*btrim\s*\(\s*name\s*\)\s*\)/i);
  expect(sql).toMatch(/on conflict\s*\(\s*\(\s*lower\s*\(\s*btrim\s*\(\s*name\s*\)\s*\)\s*\)\s*\)/i);
  expect(sql).toMatch(/greatest\s*\(/i);
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

