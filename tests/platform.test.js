'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Engine = require('../minigame/src/engine');
const App = require('../minigame/src/app');
const dayString = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
function fixture() {
  const ctx = new Proxy({}, { get: (object, key) => object[key] || (() => {}), set: (object, key, value) => { object[key] = value; return true; } });
  const data = new Map(), frames = [], shares = [], events = {};
  const canvas = { getContext: () => ctx };
  const platform = { storage: { get: key => data.get(key), set: (key, value) => { data.set(key, value); return true; } },
    requestFrame: fn => frames.push(fn), vibrate() {}, shareSupported: () => true,
    share: (done, fail) => shares.push({ done, fail }) };
  const app = new App(canvas, Engine, platform, { width: 390, height: 844, dpr: 2, safeTop: 44, safeBottom: 34 });
  return { app, canvas, data, frames, shares, events, platform };
}
test('daily reward is granted once per Beijing day and never triggers a share', () => {
  const { app, data, shares } = fixture();
  assert.equal(app.game.undos, 3);
  app.openDaily(); assert.equal(app.modal, 'daily'); app.claimDaily();
  assert.equal(app.game.undos, 4);
  assert.equal(shares.length, 0);
  app.claimDaily(); assert.equal(app.game.undos, 4);
  assert.equal(data.get('hehe2048.daily.day'), dayString());
  // A fresh instance still carries today's save, so another claim must not add undo.
  const next = new App({ getContext: () => app.ctx }, Engine, app.platform, { width: 390, height: 844, dpr: 1 });
  const carried = next.game.undos;
  next.openDaily(); next.claimDaily(); assert.equal(next.game.undos, carried);
});
test('sharing grants nothing, whether it succeeds or fails', () => {
  const { app, data, shares } = fixture();
  app.shareNow(); assert.equal(shares.length, 1); shares[shares.length - 1].done();
  assert.equal(app.game.undos, 3);
  assert.equal(data.get('hehe2048.daily.day'), undefined);
  app.shareNow(); shares[shares.length - 1].fail();
  assert.equal(app.game.undos, 3);
  assert.equal(data.get('hehe2048.daily.day'), undefined);
});
test('hide persists exact final state; show resumes and cancels touch; small viewport fits', () => {
  const { app, data } = fixture(); app.game.board = [2,2,0,0].concat(Array(12).fill(0)); app.move('left');
  app.pointerStart(70, 300); app.onHide(); assert.equal(app.animation, null); assert.equal(app.start, null);
  assert.deepEqual(data.get('hehe2048.save.v1').board, app.game.board);
  app.onShow({}); app.resize(320, 568, 3); assert.ok(app.oy + 780 * app.scale <= 568 - app.safeBottom + 0.01);
  app.render(); assert.ok(app.buttons.length > 0);
});
test('touch swipe moves and canceled touch does not; restart cancellation preserves game', () => {
  const { app } = fixture(); app.game.board = [2,2,0,0].concat(Array(12).fill(0));
  const x = value => app.ox + value * app.scale, y = value => app.oy + value * app.scale;
  app.pointerStart(x(260), y(300)); app.pointerEnd(x(100), y(300)); assert.equal(app.game.score, 4);
  app.animation = null; const before = app.game.export();
  app.pointerStart(x(100), y(300)); app.pointerCancel(); app.pointerEnd(x(260), y(300)); assert.deepEqual(app.game.export(), before);
  app.openRestart(); app.closeModal(); assert.deepEqual(app.game.export(), before);
});
test('Weixin entry boots without DOM, registers onShow first, and wires share plus resize', () => {
  const { canvas, events, frames } = fixture(), calls = [], shared = [];
  let instance = null;
  class ProbeApp extends App { constructor(...args) { super(...args); instance = this; } }
  const wx = {
    onShow: fn => { calls.push('onShow'); events.show = fn; },
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, screenHeight: 844, pixelRatio: 2, safeArea: { top: 44, bottom: 810 } }),
    createCanvas: () => { calls.push('canvas'); return canvas; },
    getStorageSync: () => null, setStorageSync() {},
    shareAppMessage: options => { shared.push(options); if (options.success) options.success(); },
    showShareMenu() {}, onShareAppMessage: fn => { events.cardShare = fn; },
    vibrateShort() {}, vibrateLong() {},
    onTouchStart: fn => { events.start = fn; }, onTouchEnd: fn => { events.end = fn; }, onTouchCancel() {},
    onHide: fn => { events.hide = fn; }, onWindowResize: fn => { events.resize = fn; },
    getLaunchOptionsSync: () => ({ scene: 1007, query: { from: 'share' } })
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../minigame/game.js'), 'utf8'), {
    wx, require: name => name === './src/engine' ? Engine : ProbeApp, requestAnimationFrame: fn => frames.push(fn)
  });
  assert.deepEqual(calls, ['onShow', 'canvas']);
  assert.ok(instance, 'entry must create the app');
  assert.equal(instance.shareReady, true);
  assert.deepEqual(instance.shareContent(), { title: App.shareTitle(), query: 'from=share' });
  assert.deepEqual(events.cardShare(), { title: App.shareTitle(), query: 'from=share' });
  instance.shareNow(); assert.equal(shared.length, 1); assert.equal(shared[0].title, App.shareTitle());
  // Sharing must stay reward-free to comply with the induced-sharing rules.
  assert.equal(instance.game.undos, 3);
  instance.openDaily(); instance.claimDaily(); assert.equal(instance.game.undos, 4);
  // WeChat wraps window sizes inside res.size.
  events.resize({ size: { windowWidth: 320, windowHeight: 568 } });
  assert.equal(instance.width, 320); assert.equal(instance.height, 568);
  events.show({ scene: 1008 }); events.start({ touches: [{ clientX: 180, clientY: 380 }] });
  events.end({ changedTouches: [{ clientX: 70, clientY: 380 }] }); events.hide();
  assert.ok(frames.length > 0);
});
