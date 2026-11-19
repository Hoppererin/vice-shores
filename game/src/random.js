// Seeded randomness, rewritten for v5.1: one mulberry32 stream per world,
// so a seed always builds the same city, the same traffic and the same
// pedestrians. No Date.now(), no Math.random() anywhere in gameplay.
//
// v5.1 adds range (a float in [lo, hi]) as the natural companion to the
// existing helpers, and random as a plain alias for the stream itself —
// the two callers that pass a bare function instead of a mulberry32
// stream (entities pickColor's fallback) read more clearly with it.

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

// Chance roll: true with probability p.
export function chance(rng, p) {
  return rng() < p;
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
