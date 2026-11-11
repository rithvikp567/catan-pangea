/**
 * Which terrain tiles and number tokens a board of A land hexes uses, and
 * the initial (random) deal of them onto the land.
 */
import { BASE_TERRAIN, BASE_NUMBERS, EXTRA_TERRAIN, TRIM_PAIRS, GROW_PAIRS } from "./catalog.js";
import { shuffle } from "./random.js";

/**
 * @typedef {{ key:string, terrain:string, num:number|null }} Tile
 * @typedef {Map<string, Tile>} TileMap
 */

/**
 * Terrain + number-token multiset for an A-tile board.
 *  - Below 19: largest-remainder apportionment of the base 4/4/4/3/3 mix
 *    (one desert always), ties broken by the seed.
 *  - Above 19: one extra terrain per tile in a fixed rotation; a second
 *    desert from 27 tiles.
 *  - Numbers: trimmed or extended in mirrored pairs (see catalog), an odd
 *    count leaving one unpaired token whose side the seed picks.
 * A = 19 is exactly the base set and consumes no randomness.
 * @returns {{ terr:string[], nums:number[] }}
 */
export function buildTileSet(A, rng){
  let terr = BASE_TERRAIN.slice();
  if(A < 19){
    const keep = A - 1;
    const base = [["forest",4],["pasture",4],["fields",4],["hills",3],["mountains",3]];
    const quota = base.map(([t, c]) => {
      const q = c * keep / 18;
      return { t, n:Math.floor(q), rem:q - Math.floor(q), tie:rng() };
    });
    const left = keep - quota.reduce((a, x) => a + x.n, 0);
    quota.slice().sort((a, b) => (b.rem - a.rem) || (a.tie - b.tie))
         .slice(0, left).forEach(x => x.n++);
    terr = ["desert", ...quota.flatMap(x => Array(x.n).fill(x.t))];
  } else if(A > 19){
    for(let i = 0; i < A - 19; i++) terr.push(EXTRA_TERRAIN[i % EXTRA_TERRAIN.length]);
    if(A >= 27) terr[terr.length - 1] = "desert";
  }

  const need = terr.filter(t => t !== "desert").length;
  const nums = BASE_NUMBERS.slice();
  const drop = n => { const i = nums.indexOf(n); if(i >= 0) nums.splice(i, 1); };
  for(let pi = 0; nums.length > need; pi++){
    const pair = TRIM_PAIRS[pi % TRIM_PAIRS.length];
    if(nums.length - need >= 2) pair.forEach(drop);
    else drop(pair[rng() < 0.5 ? 0 : 1]);
  }
  for(let pi = 0; nums.length < need; pi++){
    const pair = GROW_PAIRS[pi % GROW_PAIRS.length];
    if(need - nums.length >= 2) nums.push(...pair);
    else nums.push(pair[rng() < 0.5 ? 0 : 1]);
  }
  return { terr, nums };
}

/**
 * Shuffle the tile set onto the land. Deserts carry no number.
 * @param {Set<string>} land
 * @returns {{ keys:string[], tiles:TileMap }}
 */
export function dealTiles(land, rng){
  const keys = [...land];
  const { terr, nums } = buildTileSet(keys.length, rng);
  const t = shuffle(rng, terr), n = shuffle(rng, nums);
  const tiles = new Map();
  let ni = 0;
  keys.forEach((k, i) => tiles.set(k, { key:k, terrain:t[i], num: t[i] === "desert" ? null : n[ni++] }));
  return { keys, tiles };
}
