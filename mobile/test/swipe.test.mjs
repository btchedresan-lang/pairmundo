import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeDecision, swipeIntent } from '../src/swipeRules.js';

const card = { width: 366, height: 620 }; // an iPhone 15's Discover card

test('swipe: short drags and quick flicks spring back', () => {
  for (const dx of [20, 80, 110, 140, 160]) {
    assert.equal(swipeDecision({ ...card, dx, dy: 0, vx: 2 }), null, `dx ${dx} should not count`);
    assert.equal(swipeDecision({ ...card, dx: -dx, dy: 0, vx: -2 }), null, `dx -${dx} should not count`);
  }
});

test('swipe: a deliberate drag most of the way across counts', () => {
  assert.equal(swipeDecision({ ...card, dx: 170, dy: 20 }), 'like');
  assert.equal(swipeDecision({ ...card, dx: -200, dy: 40 }), 'pass');
  assert.equal(swipeDecision({ ...card, dx: 10, dy: -190 }), null);
  assert.equal(swipeDecision({ ...card, dx: 10, dy: -200 }), 'super');
});

test('swipe: slanted drags and pulling back cancel', () => {
  // Mostly downwards or diagonal: not a decision.
  assert.equal(swipeDecision({ ...card, dx: 180, dy: 170 }), null);
  // Up and to the side: neither a clean super like nor a clean like.
  assert.equal(swipeDecision({ ...card, dx: 150, dy: -220 }), null);
  // Far enough, but the finger is heading back to the middle.
  assert.equal(swipeDecision({ ...card, dx: 200, dy: 0, vx: -0.5 }), null);
  assert.equal(swipeDecision({ ...card, dx: -200, dy: 0, vx: 0.5 }), null);
  assert.equal(swipeDecision({ ...card, dx: 0, dy: -260, vy: 0.5 }), null);
  // Still moving outwards, or holding still: it counts.
  assert.equal(swipeDecision({ ...card, dx: 200, dy: 0, vx: 0.1 }), 'like');
});

test('swipe: small screens still need at least 150 px', () => {
  assert.equal(swipeIntent({ width: 300, height: 500, dx: 140, dy: 0 }), null);
  assert.equal(swipeIntent({ width: 300, height: 500, dx: 150, dy: 0 }), 'like');
});
