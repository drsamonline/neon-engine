// core.js — shared utilities for the engine
/**
 * Clamp a number into a range.
 */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/**
 * Linear interpolation.
 */
export const lerp = (a, b, t) => a + (b - a) * t;
/**
 * Frame-rate independent approach toward a target.
 */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/* deterministic PRNG so a seed always builds the same world */
/**
 * A 32-bit seeded PRNG. Same seed, same sequence.
 */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* stable per-chunk seed from grid coordinates */
/**
 * A stable 32-bit hash of two integers and a seed, for per-tile variation.
 */
export function hashSeed(x, y, seed) {
  let h = seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Pick a random element from an array using a supplied RNG.
 */
export const pick = (r, arr) => arr[(r() * arr.length) | 0];

