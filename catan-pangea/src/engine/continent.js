/**
 * Growing a continent and tightening its coastline.
 */
import { neighbours } from "./hex.js";
import { adjacencyCount, isConnected, findLakes, landNeighbours } from "./topology.js";
import { centreOf } from "./shapes.js";

/**
 * Grow A land hexes outward from the centre. Each frontier hex is chosen
 * with weight (1 + its land neighbours)^exponent, so a larger exponent
 * grows a rounder blob and a smaller one a more ragged coast.
 * @param {() => number} rng
 * @param {number} A
 * @param {number} exponent
 * @param {string[]|null} domain hexes the land may occupy (null = unbounded)
 * @returns {Set<string>}
 */
export function growContinent(rng, A, exponent, domain = null){
  const dom = domain ? new Set(domain) : null;
  const allowed = k => !dom || dom.has(k);

  const seed = dom ? centreOf(dom) : "0,0";
  const land = new Set([seed]);
  const frontier = new Set(neighbours(seed).filter(allowed));

  while(land.size < A && frontier.size){
    const cand = [...frontier];
    const w = cand.map(k => Math.pow(1 + landNeighbours(land, k), exponent));
    let t = rng() * w.reduce((a, b) => a + b, 0), idx = 0;
    while(idx < w.length - 1 && t > w[idx]){ t -= w[idx]; idx++; }
    const chosen = cand[idx];
    land.add(chosen); frontier.delete(chosen);
    for(const n of neighbours(chosen)) if(allowed(n) && !land.has(n)) frontier.add(n);
  }
  return land;
}

/**
 * Hill-climb: relocate the least-connected tile to the most-connected
 * vacancy until S reaches minS. Directly maximises S, the only term that
 * governs how many 3-resource intersections exist. If the floor is
 * unreachable the climb stops at the best it found — callers report the
 * real number rather than pretending. Enclosed lakes are then filled: each
 * costs a 3-spot (v3 = S − A + 1 − L).
 * Mutates and returns `land`.
 */
export function compactify(land, domain, minS){
  const dom = domain ? new Set(domain) : null;
  const allowed = k => !dom || dom.has(k);
  const gain = k => landNeighbours(land, k);

  for(let guard = 0; guard < 400; guard++){
    if(adjacencyCount(land) >= minS) break;

    const vac = new Map();
    for(const k of land) for(const n of neighbours(k)){
      if(!land.has(n) && allowed(n) && !vac.has(n)) vac.set(n, gain(n));
    }
    const removals = [...land].map(k => [k, gain(k)]).sort((a, b) => a[1] - b[1]).slice(0, 12);
    const targets  = [...vac.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

    let bestMove = null, bestDelta = 0;
    for(const [rk, rgain] of removals){
      for(const [tk, tg] of targets){
        if(rk === tk) continue;
        /* a vacancy propped up by the tile being removed loses that neighbour */
        const delta = (tg - (neighbours(tk).includes(rk) ? 1 : 0)) - rgain;
        if(delta <= bestDelta) continue;
        land.delete(rk); land.add(tk);
        const ok = isConnected(land);
        land.add(rk); land.delete(tk);
        if(ok){ bestDelta = delta; bestMove = [rk, tk]; }
      }
    }
    if(!bestMove) break;
    land.delete(bestMove[0]); land.add(bestMove[1]);
  }

  for(let pass = 0; pass < 4; pass++){
    const { lakes } = findLakes(land, domain);
    if(!lakes.length) break;
    const lake = lakes[0];
    let done = false;
    for(const [k] of [...land].map(k => [k, gain(k)]).sort((a, b) => a[1] - b[1])){
      land.delete(k); land.add(lake);
      if(isConnected(land)){ done = true; break; }
      land.add(k); land.delete(lake);
    }
    if(!done) break;
  }
  return land;
}
