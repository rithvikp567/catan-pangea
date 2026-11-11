/**
 * Deterministic randomness. Every board is a pure function of
 * (seed string, settings), so a seed can always be replayed.
 */

/** Small, fast seeded PRNG. Returns a function yielding floats in [0, 1). */
export function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string to an unsigned 32-bit seed. */
export function hashSeed(str){
  let h = 2166136261;
  for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Uniform pick from an array. */
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/** Fisher–Yates shuffle; returns a new array. */
export function shuffle(rng, arr){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SEED_WORDS = ["kestrel","basalt","tallow","harrow","meridian","cinder","fathom","gannet",
                    "quarry","lattice","brine","thicket","sable","vellum","cobalt","furrow"];

/** A fresh, human-readable seed such as "cinder-4821". Not deterministic by design. */
export function randomSeedName(random = Math.random){
  return SEED_WORDS[Math.floor(random() * SEED_WORDS.length)] + "-" + Math.floor(random() * 9000 + 1000);
}
