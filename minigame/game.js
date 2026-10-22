'use strict';
// Register synchronously at entry, including cold-start and warm-start returns from a share card.
let launchOptions = {};
let app = null;
wx.onShow(options => {
  launchOptions = options || {};
  if (app) app.onShow(launchOptions);
});
const Engine = require('./src/engine');
const App = require('./src/app');
// getWindowInfo is the maintained window API; getSystemInfoSync stays as the fallback for older base libraries.
const info = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {};
const canvas = wx.createCanvas();
const storage = {
  get(key) { try { return wx.getStorageSync(key); } catch (_) { return null; } },
  set(key, value) { try { wx.setStorageSync(key, value); return true; } catch (_) { return false; } }
};
const platform = {
  storage,
  requestFrame: fn => requestAnimationFrame(fn),
  vibrate() { if (wx.vibrateShort) wx.vibrateShort({ type: 'medium', fail() {} }); },
  shareSupported() { return typeof wx.shareAppMessage === 'function'; },
  // Sharing is intentionally reward-free: tying any benefit to a share counts as induced
  // sharing under the WeChat platform operating rules. The daily reward is local only.
  share(onDone, onFail) {
    wx.shareAppMessage({ title: App.shareTitle(), success: () => onDone(), fail: () => onFail() });
  }
};
const screenHeight = info.screenHeight || info.windowHeight || 0;
const safeArea = info.safeArea || null;
app = new App(canvas, Engine, platform, {
  width: info.windowWidth || info.screenWidth,
  height: info.windowHeight || info.screenHeight,
  dpr: info.pixelRatio || 1,
  safeTop: safeArea ? Math.max(0, safeArea.top) : 0,
  safeBottom: safeArea ? Math.max(0, screenHeight - safeArea.bottom) : 0
});
// getLaunchOptionsSync is a fallback; the current onShow event stays authoritative.
if (!Object.keys(launchOptions).length && wx.getLaunchOptionsSync) launchOptions = wx.getLaunchOptionsSync();
app.onShow(launchOptions);
// Keep the system share card in sync with the in-game share button.
if (wx.showShareMenu) wx.showShareMenu({ withShareTicket: false });
if (wx.onShareAppMessage) wx.onShareAppMessage(() => app.shareContent());
const touchPoint = event => {
  const touch = (event.changedTouches && event.changedTouches[0]) || (event.touches && event.touches[0]);
  return touch ? { x: touch.clientX === undefined ? touch.x : touch.clientX, y: touch.clientY === undefined ? touch.y : touch.clientY } : null;
};
wx.onTouchStart(event => { const p = touchPoint(event); if (p) app.pointerStart(p.x, p.y); });
wx.onTouchEnd(event => { const p = touchPoint(event); if (p) app.pointerEnd(p.x, p.y); });
if (wx.onTouchCancel) wx.onTouchCancel(() => app.pointerCancel());
wx.onHide(() => app.onHide());
// WeChat reports resize as { size: { windowWidth, windowHeight } }; older shapes fall back to the flat form.
if (wx.onWindowResize) wx.onWindowResize(res => {
  const size = (res && res.size) || res || {};
  app.resize(size.windowWidth || info.windowWidth, size.windowHeight || info.windowHeight, info.pixelRatio || 1);
});
