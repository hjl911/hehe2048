(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MergeApp = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const C = { bg: '#fbf7f1', ink: '#343b36', muted: '#81877c', coral: '#e97155', green: '#526a52', board: '#e9e3d8', empty: '#f4efe6' };
  const tiles = { 2: ['#eee6d7', C.ink], 4: ['#e6dcc5', C.ink], 8: ['#efb188', '#633c27'], 16: ['#ee966e', '#fffaf3'],
    32: ['#e97b60', '#fffaf3'], 64: ['#d75d45', '#fffaf3'], 128: ['#d9b663', '#493c22'],
    256: ['#caa045', '#fffaf3'], 512: ['#9aa77b', '#fffaf3'], 1024: ['#70825e', '#fffaf3'], 2048: ['#465d42', '#fffaf3'] };
  const day = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  class App {
    constructor(canvas, Engine, platform, size) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.platform = platform;
      this.game = new Engine.Game(); this.best = 0; this.modal = null; this.buttons = [];
      this.launch = {}; this.shareReady = false; this.hidden = false; this.pending = false;
      this.animation = null; this.toast = null; this.start = null;
      const saved = platform.storage.get('hehe2048.save.v1');
      if (saved) this.game.restore(saved);
      const best = platform.storage.get('hehe2048.best.v1');
      this.best = Number.isSafeInteger(best) && best >= 0 ? Math.max(best, this.game.score) : this.game.score;
      this.haptics = platform.storage.get('hehe2048.haptics') !== false;
      this.claimDay = platform.storage.get('hehe2048.daily.day') || '';
      this.safeTop = size.safeTop || 0; this.safeBottom = size.safeBottom || 0;
      this.resize(size.width, size.height, size.dpr);
      this.syncEnd();
      this.shareReady = platform.shareSupported ? platform.shareSupported() : false;
      this.save();
    }
    resize(width, height, dpr) {
      this.width = width; this.height = height; this.dpr = Math.min(dpr || 1, 3);
      this.canvas.width = Math.round(width * this.dpr); this.canvas.height = Math.round(height * this.dpr);
      this.scale = Math.min(width / 390, (height - this.safeTop - this.safeBottom) / 780);
      this.ox = (width - 390 * this.scale) / 2;
      this.oy = this.safeTop + (height - this.safeTop - this.safeBottom - 780 * this.scale) / 2;
      this.invalidate();
    }
    save() {
      const ok = this.platform.storage.set('hehe2048.save.v1', this.game.export());
      this.platform.storage.set('hehe2048.best.v1', this.best);
      if (!ok && !this.storageWarned) { this.storageWarned = true; this.notify('存档不可用，请勿关闭当前游戏'); }
    }
    onShow(options) { this.launch = options || {}; this.hidden = false; this.syncEnd(); this.invalidate(); }
    onHide() { this.hidden = true; this.pointerCancel(); this.animation = null; this.save(); }
    invalidate() {
      if (this.hidden || this.pending) return;
      this.pending = true;
      this.platform.requestFrame(() => {
        this.pending = false;
        if (this.hidden) return;
        this.render();
        if (this.animation || this.toast) this.invalidate();
      });
    }
    notify(text) { this.toast = { text, until: Date.now() + 2200 }; this.invalidate(); }
    syncEnd() {
      if (this.game.won && !this.game.continued) this.modal = 'win';
      else if (this.game.over) this.modal = 'over';
    }
    move(direction) {
      if (this.modal || this.animation || this.hidden) return;
      const result = this.game.move(direction);
      if (!result) return;
      this.best = Math.max(this.best, this.game.score);
      this.animation = { ...result, started: Date.now() };
      if (result.gained && this.haptics) this.platform.vibrate();
      this.save();
      if (this.platform.announce) this.platform.announce('得分 ' + this.game.score + '，最大方块 ' + Math.max(...this.game.board));
      this.invalidate();
    }
    undo() {
      if (this.animation || (this.modal && this.modal !== 'over' && this.modal !== 'win')) return;
      if (!this.game.undo()) return this.notify(this.game.undos ? '先移动一步，再撤回' : '本局撤回次数已用完');
      this.modal = null; this.save(); this.notify('已撤回上一步');
    }
    restart() { this.game.reset(); this.animation = null; this.modal = null; this.toast = null; this.save(); this.invalidate(); }
    openRestart() { if (this.animation) return; this.toast = null; this.modal = 'restart'; this.invalidate(); }
    openHelp() { if (this.animation) return; this.toast = null; this.modal = 'help'; this.invalidate(); }
    closeModal() {
      if (this.modal === 'win' || this.modal === 'over') return;
      this.modal = null; this.syncEnd(); this.invalidate();
    }
    openDaily() { if (this.animation) return; this.toast = null; this.modal = 'daily'; this.invalidate(); }
    // Sharing carries no reward on purpose: tying any benefit to a share counts as
    // induced sharing under the WeChat platform operating rules.
    shareNow() {
      if (!this.shareReady || !this.platform.share) return this.notify('当前环境不支持分享');
      this.modal = null; this.toast = null;
      this.platform.share(() => this.notify('已分享给好友'), () => this.notify('分享未完成'));
      this.invalidate();
    }
    shareContent() { return { title: App.shareTitle(), query: 'from=share' }; }
    claimDaily() {
      if (this.claimDay === day()) return this.notify('今天的奖励已领取');
      const today = day();
      if (!this.platform.storage.set('hehe2048.daily.day', today)) return this.notify('保存失败，请稍后重试');
      this.claimDay = today; this.game.undos = Math.min(4, this.game.undos + 1); this.modal = null;
      this.save(); this.notify('已领取：本局撤回次数 +1');
    }
    pointerStart(x, y) { this.start = { x: (x - this.ox) / this.scale, y: (y - this.oy) / this.scale }; }
    pointerCancel() { this.start = null; }
    pointerEnd(x, y) {
      if (!this.start) return;
      const p = { x: (x - this.ox) / this.scale, y: (y - this.oy) / this.scale };
      const start = this.start; this.start = null;
      const dx = p.x - start.x, dy = p.y - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) {
        const button = this.buttons.slice().reverse().find(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h && start.x >= b.x && start.x <= b.x + b.w && start.y >= b.y && start.y <= b.y + b.h);
        if (button) button.action();
        return;
      }
      if (start.x < 24 || start.x > 366 || start.y < 248 || start.y > 590) return;
      this.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    }
    rect(x, y, w, h, radius, color) {
      const c = this.ctx, r = Math.min(radius, w / 2, h / 2);
      c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); c.fillStyle = color; c.fill();
    }
    text(value, x, y, size = 14, color = C.ink, weight = 400, align = 'left') {
      const c = this.ctx; c.font = weight + ' ' + size + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
      c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(String(value), x, y);
    }
    button(label, x, y, w, h, color, action, textColor = C.ink, enabled = true) {
      this.rect(x, y, w, h, 14, color); this.text(label, x + w / 2, y + h / 2, 14, textColor, 600, 'center');
      if (enabled) this.buttons.push({ x, y, w, h, action });
    }
    tile(value, index, scale = 1, position) {
      const x = position ? position.x : 35 + index % 4 * 82.75;
      const y = position ? position.y : 259 + Math.floor(index / 4) * 82.75;
      const size = 71.75, palette = tiles[value] || ['#344c3a', '#fffaf3'];
      this.ctx.save(); this.ctx.translate(x + size / 2, y + size / 2); this.ctx.scale(scale, scale);
      this.rect(-size / 2, -size / 2, size, size, 12, palette[0]);
      this.text(value, 0, 1, value < 100 ? 31 : value < 1000 ? 26 : value < 10000 ? 22 : 17, palette[1], 700, 'center');
      this.ctx.restore();
    }
    render() {
      const c = this.ctx, now = Date.now();
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.fillStyle = C.bg; c.fillRect(0, 0, this.width, this.height);
      c.translate(this.ox, this.oy); c.scale(this.scale, this.scale); this.buttons = [];
      this.text('慢慢来，每一步都有可能。', 25, 38, 12, C.muted);
      this.text('合合', 24, 84, 40, C.ink, 800);
      this.text('2048', 112, 84, 46, C.coral, 800);
      this.rect(288, 64, 78, 28, 14, '#e8ecdf'); this.text('经典模式', 327, 78, 12, C.green, 600, 'center');
      this.text('合并小数字，遇见大惊喜', 25, 119, 14, C.muted);
      this.rect(24, 146, 166, 68, 17, '#f0e8dd'); this.rect(200, 146, 166, 68, 17, '#e9ecdf');
      this.text('本局得分', 39, 164, 11, C.muted); this.text(this.game.score, 39, 192, 26, C.ink, 700);
      this.text('最高纪录', 215, 164, 11, C.green); this.text(this.best, 215, 192, 26, C.green, 700);
      const max = Math.max(...this.game.board), exponent = Math.min(11, Math.log2(max));
      this.text('下一站 ' + max * 2, 25, 232, 12, C.green, 600);
      this.text('目标 2048', 366, 232, 12, C.muted, 400, 'right');
      this.rect(130, 230, 153, 4, 2, C.board); this.rect(130, 230, Math.max(4, (exponent - 1) / 10 * 153), 4, 2, '#92a380');
      this.rect(24, 248, 342, 342, 22, C.board);
      for (let n = 0; n < 16; n++) this.rect(35 + n % 4 * 82.75, 259 + Math.floor(n / 4) * 82.75, 71.75, 71.75, 12, C.empty);
      const anim = this.animation;
      const elapsed = anim ? now - anim.started : 0;
      if (anim && elapsed < 130) {
        const progress = 1 - Math.pow(1 - elapsed / 130, 3);
        anim.motions.forEach(m => this.tile(m.value, m.to, 1, {
          x: 35 + ((m.from % 4) + (m.to % 4 - m.from % 4) * progress) * 82.75,
          y: 259 + (Math.floor(m.from / 4) + (Math.floor(m.to / 4) - Math.floor(m.from / 4)) * progress) * 82.75
        }));
      } else {
        this.game.board.forEach((value, index) => {
          if (!value) return;
          let scale = 1;
          if (anim && elapsed < 260) {
            const t = Math.max(0, (elapsed - 130) / 130);
            if (index === anim.spawned) scale = 0.45 + 0.55 * (1 - Math.pow(1 - t, 3));
            else if (anim.merged.includes(index)) scale = 1 + Math.sin(t * Math.PI) * 0.12;
          }
          this.tile(value, index, scale);
        });
      }
      this.button('↶  撤回 · ' + this.game.undos, 24, 608, 166, 52, '#ede7dc', () => this.undo(), this.game.previous && this.game.undos > 0 ? C.ink : C.muted);
      this.button('再来一局', 200, 608, 166, 52, C.coral, () => this.openRestart(), '#fffaf3');
      this.text('滑动棋盘，让相同数字相遇', 195, 679, 12, C.muted, 400, 'center');
      this.button(this.claimDay === day() ? '今日奖励已领取' : '每日奖励  ·  撤回 +1', 24, 696, 342, 42, '#e8ecdf', () => this.openDaily(), C.green);
      this.button('玩法', 24, 746, 72, 28, C.bg, () => this.openHelp(), C.muted);
      this.button(this.haptics ? '震动 开' : '震动 关', 110, 746, 84, 28, C.bg, () => {
        this.haptics = !this.haptics; this.platform.storage.set('hehe2048.haptics', this.haptics); this.invalidate();
      }, C.muted);
      this.button('关于', 294, 746, 72, 28, C.bg, () => { this.modal = 'about'; this.invalidate(); }, C.muted);
      if (anim && anim.gained && elapsed < 600) {
        c.globalAlpha = Math.max(0, 1 - elapsed / 600); this.text('+' + anim.gained, 174, 174 - elapsed / 40, 18, C.coral, 700, 'right'); c.globalAlpha = 1;
      }
      if (anim && elapsed >= 260) { this.animation = null; this.syncEnd(); }
      if (this.modal) this.drawModal();
      if (this.toast) {
        if (now >= this.toast.until) this.toast = null;
        else { this.rect(28, 550, 334, 45, 14, '#343b36'); this.text(this.toast.text, 195, 573, 13, '#fffaf3', 500, 'center'); }
      }
    }
    drawModal() {
      const modal = this.modal, c = this.ctx; this.buttons = [];
      c.fillStyle = '#343b366b'; c.fillRect(0, 0, 390, 780);
      this.rect(28, 208, 334, 366, 24, C.bg);
      if (!['win', 'over'].includes(modal)) this.button('×', 311, 220, 38, 38, C.bg, () => this.closeModal(), C.muted);
      if (modal === 'help') {
        this.text('每一步，靠近 2048', 195, 255, 22, C.ink, 700, 'center');
        this.text('2', 105, 318, 29, C.green, 700, 'center'); this.text('+', 150, 318, 22, C.muted, 400, 'center');
        this.text('2', 195, 318, 29, C.green, 700, 'center'); this.text('=', 240, 318, 22, C.muted, 400, 'center'); this.text('4', 285, 318, 29, C.coral, 700, 'center');
        ['上下左右滑动，所有方块一起移动。', '相同数字相遇，会合成两倍的数字。', '每次有效移动后，出现一个 2 或 4。', '合出 2048 获胜，也可以继续挑战。', '每局可撤回 3 次，只能撤回上一步。'].forEach((s, n) => this.text(s, 49, 365 + n * 27, 13, C.muted));
        this.button('开始合合', 49, 514, 292, 42, C.coral, () => this.closeModal(), '#fffaf3');
      } else if (modal === 'restart') {
        this.text('准备开始新一局？', 195, 293, 23, C.ink, 700, 'center');
        this.text('当前棋盘会重置，最高纪录会保留。', 195, 346, 13, C.muted, 400, 'center');
        this.button('开始新一局', 49, 410, 292, 48, C.coral, () => this.restart(), '#fffaf3');
        this.button('继续当前游戏', 49, 476, 292, 48, '#ede7dc', () => this.closeModal());
      } else if (modal === 'win' || modal === 'over') {
        this.text(modal === 'win' ? '2048' : '差一点，再试试', 195, 283, modal === 'win' ? 50 : 25, modal === 'win' ? C.green : C.ink, 800, 'center');
        this.text(modal === 'win' ? '你做到了！每一步都算数。' : '棋盘已满，没有可合并的数字了。', 195, 341, 13, C.muted, 400, 'center');
        this.text('本局得分 ' + this.game.score + '   ·   ' + this.game.moves + ' 步', 195, 376, 16, C.ink, 600, 'center');
        this.button(modal === 'win' ? '继续挑战 4096' : '再来一局', 49, 423, 292, 48, C.coral, () => {
          if (modal === 'win') { this.game.continued = true; this.modal = null; this.syncEnd(); this.save(); this.invalidate(); }
          else this.restart();
        }, '#fffaf3');
        if (this.game.previous && this.game.undos > 0) this.button('撤回一步 · ' + this.game.undos, 49, 489, 292, 48, '#ede7dc', () => this.undo());
        else if (modal === 'win') this.button('开始新一局', 49, 489, 292, 48, '#ede7dc', () => this.openRestart());
      } else if (modal === 'daily') {
        this.text('每日奖励', 195, 267, 21, C.ink, 700, 'center');
        ['进入游戏即可领取本局撤回次数 +1。', '每个北京时间自然日可领取一次。', '奖励保存在本机，清理缓存会清空。'].forEach((s, n) => this.text(s, 49, 330 + n * 33, 13, C.muted));
        const claimed = this.claimDay === day();
        this.button(claimed ? '今天已领取' : '领取奖励 · 撤回 +1', 49, 489, 292, 48, claimed ? '#ede7dc' : C.green, () => this.claimDaily(), claimed ? C.muted : '#fffaf3', !claimed);
      } else {
        this.text('合合2048', 195, 268, 27, C.ink, 800, 'center');
        ['经典数字合并小游戏 · 版本 0.1.0', '棋盘、得分和设置保存在本机。', '本版本不上传数据，无广告、无内购。', '清理应用缓存可能会丢失存档。', '适度游戏，享受生活。'].forEach((s, n) => this.text(s, 49, 327 + n * 31, 13, C.muted));
        if (this.shareReady) this.button('分享给好友', 49, 462, 292, 40, '#ede7dc', () => this.shareNow(), C.muted);
        this.button('继续游戏', 49, 514, 292, 42, C.green, () => this.closeModal(), '#fffaf3');
      }
    }
  }
  App.shareTitle = () => '合合2048 · 慢慢来，每一步都有可能';
  return App;
});
