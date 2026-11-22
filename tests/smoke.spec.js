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
  await page.getByText('Set leaderboard name').click();
  await page.getByLabel('Name on the leaderboard').fill(name);
  await page.getByRole('button', { name: 'Play', exact: true }).click();

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

test('shows the illustrated title and starts a guest game', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveTitle('Newt Crosser');
  await expect(page.getByRole('heading', { name: 'Newt Crosser', level: 1 })).toBeVisible();
  await expect.poll(() => page.locator('.cover-art').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByLabel('Name on the leaderboard')).toBeHidden();
  await expect(page.getByRole('button', { name: 'How to play' })).toBeVisible();
  await expect(page.getByRole('link', { name: /real newt crossing/i })).toHaveAttribute('href', /bioblitz/);

  await page.getByRole('button', { name: 'Play', exact: true }).click();

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
  await expect(page.locator('#tutorial')).toBeHidden();
  expect(await page.evaluate(() => playerName)).toBe('');
  expect(pageErrors).toEqual([]);
});

test('newt walks through its poses only after moving and rests on respawn', async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
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
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.locator('#tutTitle')).toHaveText('Move forward');
  await expect(page.locator('#game-wrapper canvas')).toHaveCount(1);
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

test('practices steering and waiting for traffic before crossing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'How to play' }).click();

  await expect(page.locator('#tutorial')).toBeVisible();
  await expect(page.locator('#tutTitle')).toHaveText('Move forward');
  await expect(page.locator('#tutProgress')).toHaveText('Practice · 1 of 4');
  expect(await page.evaluate(() => window._game.scene.getScene('Game').newt.texture.key)).toBe('newt_sheet');

  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#tutTitle')).toHaveText('Steer left and right');

  await page.waitForTimeout(120);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#tutTitle')).toHaveText('Steer left and right');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#tutTitle')).toHaveText('Wait for a gap');
  await expect(page.locator('#tutTitle')).toHaveText('Reach the reservoir');

  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(120);
  }

  await expect(page.locator('#tutTitle')).toHaveText('Crossing complete');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#tutorial')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window._game.scene.getScene('Game').vehicles.getLength())).toBeGreaterThan(1);
});

test('allows skipping practice into normal traffic', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'How to play' }).click();
  await page.getByRole('button', { name: 'Skip practice' }).click();

  await expect(page.locator('#tutorial')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window._game.scene.getScene('Game').vehicles.getLength())).toBeGreaterThan(1);
});

test.describe('touch play', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('supports portrait touch controls and keeps the crossing on rotation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Newt Crosser', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Play', exact: true }).tap();
    const controls = page.getByRole('group', { name: 'Move the newt' });
    await expect(controls).toBeVisible();

    const boardState = () => page.evaluate(() => {
      const scene = window._game.scene.getScene('Game');
      return {
        width: scene.boardWidth,
        height: scene.boardHeight,
        score: scene.score,
        lives: scene.lives,
        lanes: scene.lanes.length,
        progress: (scene.newt.y - scene.ROAD_BOT) / (scene.SPAWN_Y - scene.ROAD_BOT)
      };
    });
    expect(await boardState()).toMatchObject({ width: 390, height: 844, lanes: 2, progress: 1 });
    await controls.getByRole('button', { name: 'Move up' }).tap();
    await expect.poll(async () => (await boardState()).progress).toBeCloseTo(0.5);
    await page.evaluate(() => {
      const scene = window._game.scene.getScene('Game');
      scene.score = 6;
      scene.lives = 2;
      scene.updateHUD();
    });

    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(boardState).toMatchObject({ width: 844, height: 390, score: 6, lives: 2, lanes: 2 });
    expect((await boardState()).progress).toBeCloseTo(0.5);
    await expect(controls).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(boardState).toMatchObject({ width: 390, height: 844, score: 6, lives: 2 });
    expect((await boardState()).progress).toBeCloseTo(0.5);
  });

  test('plays practice in portrait and accepts a swipe after rotating', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'How to play' }).tap();
    await expect(page.locator('#tutTitle')).toHaveText('Move forward');
    await page.getByRole('button', { name: 'Move up' }).tap();
    await expect(page.locator('#tutTitle')).toHaveText('Steer left and right');

    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(() => page.evaluate(() => window._game.scene.getScene('Game').boardWidth)).toBe(844);
    await expect.poll(() => page.evaluate(() => {
      const scene = window._game.scene.getScene('Game');
      return scene.time.now - scene.lastStep;
    })).toBeGreaterThan(85);
    const session = await page.context().newCDPSession(page);
    const dispatch = (type, touchPoints) => session.send('Input.dispatchTouchEvent', { type, touchPoints });
    await dispatch('touchStart', [{ x: 400, y: 326 }]);
    await dispatch('touchMove', [{ x: 340, y: 326 }]);
    await dispatch('touchEnd', []);

    await expect(page.locator('#tutTitle')).toHaveText('Wait for a gap');
    await expect(page.locator('#tutTitle')).toHaveText('Reach the reservoir');
  });
});

for (const side of ['left', 'right']) {
  test(`volunteer walks from the ${side}, peels a splat, then walks away`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Play', exact: true }).click();

    await expect.poll(async () => page.evaluate(() => Boolean(window._game))).toBe(true);

    expect(await page.evaluate(() => {
      const scene = window._game.scene.getScene('Game');
      return { texture: scene.cleanerSp.texture.key, frames: scene.cleanerSp.texture.getFrameNames().length };
    })).toEqual({ texture: 'volunteer_sheet', frames: 16 });

    const bootSpans = await page.evaluate(() => {
      const scene = window._game.scene.getScene('Game');
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 80;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      return scene.anims.get('volunteer_walk').frames.map(pose => {
        const frame = scene.textures.getFrame(pose.textureKey, pose.textureFrame);
        context.clearRect(0, 0, 80, 80);
        context.drawImage(frame.source.image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, 80, 80);
        const pixels = context.getImageData(0, 56, 80, 24).data;
        let left = 80, right = 0;
        for (let y = 0; y < 24; y++) for (let x = 0; x < 80; x++) {
          if (pixels[(y * 80 + x) * 4 + 3] >= 128) {
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
        }
        return right - left + 1;
      });
    });
    expect(Math.max(...bootSpans) / Math.min(...bootSpans)).toBeGreaterThan(1.6);

    await page.evaluate((side) => {
      const scene = window._game.scene.getScene('Game');
      scene.lives = 3;
      scene.updateHUD();
      scene.newt.x = side === 'left' ? 100 : scene.scale.width - 100;
      scene.onHit();
      window.cleanupFrames = [];
      window.walkFrames = [];
      scene.cleanerSp.on('animationupdate', (animation, frame) => {
        if (animation.key === 'volunteer_peel') {
          window.cleanupFrames.push({ frame: frame.textureFrame, splatActive: scene.cleanerTarget.sprite.active });
        }
        if (animation.key === 'volunteer_walk') window.walkFrames.push(frame.textureFrame);
      });
    }, side);

    await expect.poll(async () => page.evaluate(() => {
      const scene = window._game.scene.getScene('Game');
      return {
        splatCount: scene.splats.length,
        cleanerState: scene.cleanerState,
        animation: scene.cleanerSp.anims?.currentAnim?.key,
        walking: scene.cleanerSp.anims?.isPlaying
      };
    })).toEqual({
      splatCount: 1,
      cleanerState: 'entering',
      animation: 'volunteer_walk',
      walking: true
    });
    expect(await page.evaluate(() => window._game.scene.getScene('Game').cleanerSp.flipX)).toBe(side === 'right');

    await expect.poll(() => page.evaluate(() => {
      const scene = window._game.scene.getScene('Game');
      return { state: scene.cleanerState, animation: scene.cleanerSp.anims?.currentAnim?.key };
    })).toEqual({ state: 'cleaning', animation: 'volunteer_peel' });
    expect(await page.evaluate(() => {
      const scene = window._game.scene.getScene('Game');
      return scene.cleanerSp.displayHeight / scene.TS;
    })).toBeCloseTo(2);

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
    expect(await page.evaluate(() => window.cleanupFrames.some(({ frame, splatActive }) => frame === 12 && splatActive))).toBe(true);
    expect(await page.evaluate(() => window.cleanupFrames.some(({ frame, splatActive }) => frame === 14 && !splatActive))).toBe(true);
    expect(await page.evaluate(() => window._game.scene.getScene('Game').cleanerSp.anims.currentAnim.key)).toBe('volunteer_walk');
    expect(await page.evaluate(() => new Set(window.walkFrames).size)).toBeGreaterThanOrEqual(7);
    expect(await page.evaluate(() => {
      const scene = window._game.scene.getScene('Game');
      return scene.cleanerSp.displayHeight / scene.TS;
    })).toBeCloseTo(2);
    await expect.poll(() => page.evaluate(() => {
      const scene = window._game.scene.getScene('Game');
      return { state: scene.cleanerState, visible: scene.cleanerSp.visible, walking: scene.cleanerSp.anims.isPlaying };
    })).toEqual({ state: 'idle', visible: false, walking: false });
  });
}

test('renders Alma Bridge Road text markings on the road itself', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
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

