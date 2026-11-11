// When a drag on a Discover card counts as a like, pass or super like. Kept apart from the animation so it can be
// tested, and shared in spirit with the website's deck (server/public/app.js uses the same numbers).
//
// A drag counts only when it is deliberate:
// - it travels most of the way across: 45% of the card's width (at least 150 px) sideways, or 28% of its height up;
// - it goes mostly in that direction, so a slanted or wobbly drag doesn't count;
// - the finger isn't pulling back towards the middle when it lets go, so changing your mind cancels.
// Anything else springs back. Speed alone never decides: a quick flick that doesn't travel far springs back too.

export const SWIPE = {
  side: 0.45, sideMin: 150, // sideways distance, as a share of the card width
  up: 0.28, upMin: 200, // upward distance for a super like, as a share of the card height
  claim: 16, // pixels before the card starts to follow the finger, so taps stay taps
  pullBack: 0.2, // px/ms back towards the middle at release that cancels the swipe
};

/** Which way the drag points once it is far enough to count, ignoring release speed. Used for the stamp and haptic. */
export function swipeIntent({ dx, dy, width, height }) {
  const side = Math.max(SWIPE.sideMin, width * SWIPE.side);
  const up = Math.max(SWIPE.upMin, height * SWIPE.up);
  if (Math.abs(dx) >= side && Math.abs(dx) >= Math.abs(dy) * 1.2) return dx > 0 ? 'like' : 'pass';
  if (-dy >= up && -dy >= Math.abs(dx) * 2) return 'super';
  return null;
}

/** What letting go does: 'like', 'pass', 'super', or null to spring back. vx and vy are in px per ms. */
export function swipeDecision({ dx, dy, vx = 0, vy = 0, width, height }) {
  const intent = swipeIntent({ dx, dy, width, height });
  if (intent === 'like' && vx < -SWIPE.pullBack) return null;
  if (intent === 'pass' && vx > SWIPE.pullBack) return null;
  if (intent === 'super' && vy > SWIPE.pullBack) return null;
  return intent;
}
