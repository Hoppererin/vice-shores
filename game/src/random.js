// Seeded randomness, rewritten for v5.3: one mulberry32 stream per world,
// so a seed always builds the same city, the same traffic and the same
// pedestrians. No Date.now(), no Math.random() anywhere in gameplay.
//
// v5.2 added shuffle (a Fisher-Yates shuffle driven by the seeded stream)
// — the city builder uses it for the building slots in a block, and
// dispatch uses it to shuffle its radio lines so the same line does not
// come up twice in a row. v5.3 adds weightedPick (the district-event
// picker rolls a weighted die over the event kinds) and pickN (draw
// several distinct items from a list without replacement — the event
// system uses it to choose a district that is not already mid-event).

export function mulberry32(seed) {
  let a = seed >>> 0;
  // Scramble the seed once so neighbouring seeds do not produce streams
  // that look alike.
  a = (a ^ 0x9e3779b9) >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A float in [0, 1) from the stream.
export function random(rng) {
  return rng();
}

// A float in [lo, hi) from the stream.
export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

// Uniform float in [min, max).
export function rand(rng, min, max) {
  return min + rng() * (max - min);
}

// Uniform integer in [min, max] inclusive.
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Pick one element of an array.
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Pick one element with weights: items is [[value, weight], ...] and the
// roll lands on a value with probability proportional to its weight.
export function weightedPick(rng, items) {
  let total = 0;
  for (const [, w] of items) total += w;
  let roll = rng() * total;
  for (const [value, w] of items) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return items[items.length - 1][0];
}

// Draw n distinct items from an array, without replacement, in stream
// order. Fewer than n items in the array returns all of them, shuffled.
export function pickN(rng, arr, n) {
  const copy = shuffle(rng, [...arr]);
  return copy.slice(0, Math.min(n, copy.length));
}

// Chance roll: true with probability p.
export function chance(rng, p) {
  return rng() < p;
}

// Shuffle an array in place, Fisher-Yates, driven by the seeded stream.
// Returns the same array, so it reads as one step in a builder chain.
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

// Clamp a value into [min, max].
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// Shortest signed angle difference, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

// Euclidean distance.
export function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

// Linear interpolation: a + (b - a) * t, t clamped to [0, 1]. The
// helicopter and the crew companions ease toward their targets with this.
export function lerp(a, b, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return a + (b - a) * k;
}

// Compass bearing from one point to another: N, NE, E, SE, S, SW, W, NW.
// The police scanner reads this out so a driver knows which way the
// nearest roadblock is, not just how far.
export function compass(x1, y1, x2, y2) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const names = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const idx = Math.round(a / (Math.PI / 4));
  return names[((idx % 8) + 8) % 8];
}
