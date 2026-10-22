'use strict';
// Run with PLAYWRIGHT_MODULE pointing to the bundled Playwright package if it is not installed locally.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_BROWSER || undefined });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => { errors.push(e.message); console.error('Browser runtime:', e.message); });
    await page.goto('http://127.0.0.1:2048');
    await page.waitForFunction(() => window.gameApp && window.gameApp.buttons.length > 0, null, { timeout: 10000 });
    const output = path.join(__dirname, '..', 'artifacts'); fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'initial.png') });
    await page.evaluate(() => {
      const app = window.gameApp;
      app.game.board = [2,2,0,0].concat(Array(12).fill(0)); app.game.score = 0; app.game.moves = 0;
      app.game.previous = null; app.game.won = false; app.game.over = false; app.game.undos = 3;
      app.game.random = () => 0; app.save(); app.render();
    });
    await page.keyboard.press('ArrowLeft'); await page.waitForFunction(() => !window.gameApp.animation);
    assert.equal(await page.evaluate(() => window.gameApp.game.score), 4);
    const moved = await page.evaluate(() => window.gameApp.game.export());
    await page.reload(); await page.waitForFunction(() => window.gameApp && window.gameApp.buttons.length > 0);
    assert.deepEqual(await page.evaluate(() => window.gameApp.game.export()), moved);
    await page.keyboard.press('u'); assert.equal(await page.evaluate(() => window.gameApp.game.score), 0);
    await page.keyboard.press('h'); await page.waitForFunction(() => window.gameApp.modal === 'help');
    await page.screenshot({ path: path.join(output, 'help.png') });
    // Close using the actual canvas button.
    await page.mouse.click(195, 570); assert.equal(await page.evaluate(() => window.gameApp.modal), null);
    await page.keyboard.press('r'); await page.waitForFunction(() => window.gameApp.modal === 'restart');
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => window.gameApp.game.score), 0);
    await page.mouse.move(260, 350); await page.mouse.down(); await page.mouse.move(100, 350); await page.mouse.up();
    await page.waitForFunction(() => !window.gameApp.animation);
    assert.equal(await page.evaluate(() => window.gameApp.game.score), 4);
    // Produce a gameplay screenshot through a real sequence of legal engine moves.
    await page.evaluate(() => {
      const app = window.gameApp; app.restart();
      let seed = 2048; app.game.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const directions = ['left','down','left','up','right','down'];
      for (let i = 0; i < 100; i++) {
        if (app.game.over) break;
        app.move(directions[i % directions.length]); app.animation = null;
      }
      app.save(); app.render();
    });
    await page.screenshot({ path: path.join(output, 'gameplay.png') });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.waitForFunction(() => window.gameApp.width === 320);
    await page.screenshot({ path: path.join(output, 'small-phone.png') });
    assert.equal(await page.evaluate(() => Math.round(window.gameApp.oy + 780 * window.gameApp.scale) <= window.gameApp.height), true);
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: keyboard, canvas buttons, swipe, undo, reload save, modal, 320×568 layout; no runtime errors.');
    console.log(output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
