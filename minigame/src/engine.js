(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MergeEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const validBoard = board => Array.isArray(board) && board.length === 16 && board.every(v =>
    Number.isSafeInteger(v) && (v === 0 || (v >= 2 && Number.isInteger(Math.log2(v)))));
  function coordinates(direction, line) {
    return Array.from({ length: 4 }, (_, n) => {
      if (direction === 'left') return line * 4 + n;
      if (direction === 'right') return line * 4 + 3 - n;
      if (direction === 'up') return n * 4 + line;
      return (3 - n) * 4 + line;
    });
  }
  function slide(board, direction) {
    if (!['left', 'right', 'up', 'down'].includes(direction)) throw new Error('Invalid direction');
    const next = Array(16).fill(0), motions = [], merged = [];
    let gained = 0;
    for (let line = 0; line < 4; line++) {
      const slots = coordinates(direction, line);
      const tiles = slots.filter(index => board[index]).map(index => ({ index, value: board[index] }));
      let target = 0;
      for (let n = 0; n < tiles.length; n++) {
        const tile = tiles[n], to = slots[target++];
        if (tiles[n + 1] && tiles[n + 1].value === tile.value) {
          next[to] = tile.value * 2;
          gained += next[to];
          merged.push(to);
          motions.push({ from: tile.index, to, value: tile.value });
          motions.push({ from: tiles[++n].index, to, value: tile.value });
        } else {
          next[to] = tile.value;
          motions.push({ from: tile.index, to, value: tile.value });
        }
      }
    }
    return { board: next, gained, motions, merged, changed: next.some((v, n) => v !== board[n]) };
  }
  function canMove(board) {
    return board.some(v => v === 0) || board.some((v, n) =>
      (n % 4 < 3 && v === board[n + 1]) || (n < 12 && v === board[n + 4]));
  }
  class Game {
    constructor(random = Math.random) { this.random = random; this.reset(); }
    reset() {
      this.board = Array(16).fill(0); this.score = 0; this.moves = 0;
      this.won = false; this.continued = false; this.over = false; this.undos = 3; this.previous = null;
      this.spawn(); this.spawn();
    }
    spawn() {
      const empty = this.board.map((v, n) => v === 0 ? n : -1).filter(n => n >= 0);
      if (!empty.length) return -1;
      const index = empty[Math.min(empty.length - 1, Math.floor(this.random() * empty.length))];
      this.board[index] = this.random() < 0.9 ? 2 : 4;
      return index;
    }
    state() {
      return { board: this.board.slice(), score: this.score, moves: this.moves, won: this.won,
        continued: this.continued, over: this.over };
    }
    move(direction) {
      if (this.over || (this.won && !this.continued)) return null;
      const result = slide(this.board, direction);
      if (!result.changed) return null;
      this.previous = this.state();
      this.board = result.board.slice(); this.score += result.gained; this.moves++;
      const spawned = this.spawn();
      this.won = this.won || this.board.some(v => v >= 2048);
      this.over = !canMove(this.board);
      return { ...result, spawned };
    }
    undo() {
      if (!this.previous || this.undos <= 0) return false;
      Object.assign(this, clone(this.previous)); this.previous = null; this.undos--;
      return true;
    }
    export() { return { version: 1, ...this.state(), undos: this.undos, previous: clone(this.previous) }; }
    restore(saved) {
      const validState = state => state && validBoard(state.board) && state.board.some(v => v > 0) &&
        Number.isSafeInteger(state.score) && state.score >= 0 && Number.isSafeInteger(state.moves) && state.moves >= 0 &&
        ['won', 'continued', 'over'].every(key => typeof state[key] === 'boolean');
      if (!saved || saved.version !== 1 || !validState(saved) || !Number.isInteger(saved.undos) ||
          saved.undos < 0 || saved.undos > 4 || (saved.previous !== null && !validState(saved.previous))) return false;
      Object.assign(this, clone(saved));
      this.over = !canMove(this.board);
      this.won = this.board.some(v => v >= 2048);
      if (!this.won) this.continued = false;
      return true;
    }
  }
  return { Game, slide, canMove, validBoard };
});
