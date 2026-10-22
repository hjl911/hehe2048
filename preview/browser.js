'use strict';
const canvas = document.getElementById('game');
const platform = {
  storage: {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  },
  requestFrame: fn => requestAnimationFrame(fn),
  vibrate() { if (navigator.vibrate) navigator.vibrate(10); },
  shareSupported() { return typeof navigator.share === 'function'; },
  share(onDone, onFail) {
    if (typeof navigator.share !== 'function') return onFail();
    navigator.share({ title: '合合2048', text: '慢慢来，每一步都有可能。' }).then(() => onDone()).catch(() => onFail());
  },
  announce(text) { document.getElementById('status').textContent = text; }
};
const bounds = canvas.getBoundingClientRect();
const app = new MergeApp(canvas, MergeEngine, platform, { width: bounds.width, height: bounds.height, dpr: devicePixelRatio || 1 });
window.gameApp = app;
canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  const rect = canvas.getBoundingClientRect();
  app.pointerStart(event.clientX - rect.left, event.clientY - rect.top);
  canvas.focus();
});
canvas.addEventListener('pointerup', event => {
  if (!event.isPrimary) return;
  const rect = canvas.getBoundingClientRect();
  app.pointerEnd(event.clientX - rect.left, event.clientY - rect.top);
});
canvas.addEventListener('pointercancel', () => app.pointerCancel());
window.addEventListener('keydown', event => {
  const direction = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down' }[event.key];
  if (direction) { event.preventDefault(); app.move(direction); }
  else if (event.key.toLowerCase() === 'u') app.undo();
  else if (event.key.toLowerCase() === 'r') app.openRestart();
  else if (event.key.toLowerCase() === 'h') app.openHelp();
  else if (event.key === 'Escape') app.closeModal();
});
window.addEventListener('resize', () => {
  const rect = canvas.getBoundingClientRect(); app.resize(rect.width, rect.height, devicePixelRatio || 1);
});
document.addEventListener('visibilitychange', () => document.hidden ? app.onHide() : app.onShow({}));
window.addEventListener('pagehide', () => app.save());
