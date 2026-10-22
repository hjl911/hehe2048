'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, slide, canMove } = require('../minigame/src/engine');
const rowBoard = row => row.concat(Array(12).fill(0));
test('one tile can merge once per move; four equal tiles make two pairs', () => {
  const result = slide(rowBoard([2, 2, 2, 2]), 'left');
  assert.deepEqual(result.board.slice(0, 4), [4, 4, 0, 0]); assert.equal(result.gained, 8);
  assert.deepEqual(slide(rowBoard([2, 2, 4, 0]), 'left').board.slice(0, 4), [4, 4, 0, 0]);
  assert.deepEqual(slide(rowBoard([4, 4, 8, 8]), 'right').board.slice(0, 4), [0, 0, 8, 16]);
});
test('gaps collapse before merges, input remains unchanged', () => {
  const board = rowBoard([2, 0, 2, 4]), original = board.slice();
  assert.deepEqual(slide(board, 'left').board.slice(0, 4), [4, 4, 0, 0]); assert.deepEqual(board, original);
});
test('up and down use correct traversal', () => {
  const board = [2, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0];
  assert.deepEqual(slide(board, 'up').board.filter((_, n) => n % 4 === 0), [4, 8, 0, 0]);
  assert.deepEqual(slide(board, 'down').board.filter((_, n) => n % 4 === 0), [0, 0, 4, 8]);
});
test('dead board detection includes horizontal and vertical pairs', () => {
  const dead = [2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2];
  assert.equal(canMove(dead), false);
  for (const index of [0, 5, 15]) { const b = dead.slice(); b[index] = 0; assert.equal(canMove(b), true); }
  const horizontal = dead.slice(); horizontal[1] = 2; assert.equal(canMove(horizontal), true);
  const vertical = dead.slice(); vertical[4] = 2; assert.equal(canMove(vertical), true);
});
test('invalid moves do not spawn, score, or consume undo', () => {
  const game = new Game(() => 0); game.board = rowBoard([2,4,8,16]);
  const before = game.export(); assert.equal(game.move('left'), null); assert.deepEqual(game.export(), before);
});
test('undo restores exact board and score, permits only one preceding step', () => {
  const game = new Game(() => 0); game.board = rowBoard([2,2,0,0]); const before = game.state();
  game.move('left'); assert.equal(game.score, 4); assert.equal(game.moves, 1);
  assert.equal(game.undo(), true); assert.deepEqual(game.state(), before); assert.equal(game.undos, 2);
  assert.equal(game.undo(), false); assert.equal(game.undos, 2);
});
test('undo budget is exhausted after three uses', () => {
  const game = new Game(() => 0);
  for (let n = 0; n < 3; n++) { game.move('right'); assert.equal(game.undo(), true); }
  game.move('right'); assert.equal(game.undo(), false); assert.equal(game.undos, 0);
});
test('winning pauses moves, continue and undo remain correct', () => {
  const game = new Game(() => 0); game.board = rowBoard([1024,1024,0,0]);
  game.move('left'); assert.equal(game.won, true); assert.equal(game.move('right'), null);
  assert.equal(game.undo(), true); assert.equal(game.won, false);
  game.move('left'); game.continued = true; assert.ok(game.move('right'));
});
test('restore round trip preserves undo and continuation; corrupt saves rejected', () => {
  const game = new Game(() => 0); game.move('right'); const saved = game.export();
  const restored = new Game(); assert.equal(restored.restore(saved), true); assert.deepEqual(restored.export(), saved);
  assert.equal(restored.undo(), true);
  for (const corrupted of [null, {}, { ...saved, version: 2 }, { ...saved, board: [2] },
    { ...saved, score: -1 }, { ...saved, undos: 100 }, { ...saved, previous: {} }, { ...saved, board: Array(16).fill(3) }]) {
    assert.equal(restored.restore(corrupted), false);
  }
});
test('spawn supports both 2 and 4, restart uses exactly two nonempty cells', () => {
  const game = new Game(() => 0.95); assert.equal(game.board.filter(Boolean).length, 2);
  assert.ok(game.board.filter(Boolean).every(v => v === 4)); game.score = 300; game.reset(); assert.equal(game.score, 0);
});
test('generated boards preserve mass, valid powers, and direction symmetry across 4000 slides', () => {
  let seed = 12345;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let n = 0; n < 1000; n++) {
    const board = Array.from({ length: 16 }, () => random() < 0.3 ? 0 : 2 ** (1 + Math.floor(random() * 7)));
    for (const direction of ['left', 'right', 'up', 'down']) {
      const result = slide(board, direction);
      assert.equal(result.board.reduce((a,b) => a+b, 0), board.reduce((a,b) => a+b, 0));
      assert.equal(result.changed, result.board.some((v, i) => v !== board[i]));
      assert.ok(result.board.every(v => v === 0 || Number.isInteger(Math.log2(v))));
      assert.equal(result.motions.length, board.filter(Boolean).length);
    }
    const reversedRows = b => Array.from({ length: 4 }, (_, i) => b.slice(i*4,i*4+4).reverse()).flat();
    assert.deepEqual(slide(board, 'left').board, reversedRows(slide(reversedRows(board), 'right').board));
  }
});
