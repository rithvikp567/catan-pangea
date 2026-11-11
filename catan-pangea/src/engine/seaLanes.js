/**
 * Sea lanes (Sea Lanes house rule): a coastal intersection touching
 * navigable water may pay a ship to claim one otherwise-unreachable frame
 * port, one player per port. This works out which ports each water-side
 * intersection can reach, and how far away they are.
 */
import { unhk, hexVerts, neighbours } from "./hex.js";

/**
 * @typedef {object} SeaLanes
 * @property {Set<string>} water           navigable water hexes
 * @property {Map<string,number>} basin    water hex -> basin id
 * @property {Map<number,number[]>} basinPorts basin id -> ship-only port indices
 * @property {Map<string,Map<number,number>>} reach vertex -> (port index -> water hops)
 * @property {number[]} shipOnly           indices of ports only a ship can reach
 * @property {(hops:number) => number} decay value multiplier by distance
 * @property {boolean} flatCost
 */

/** @returns {SeaLanes} */
export function seaLanes(land, domain, portSlots, flatCost){
  const water = new Set();
  for(const k of domain) if(!land.has(k)) water.add(k);

  /* connected water basins */
  const basin = new Map();
  let bid = 0;
  for(const w of water){
    if(basin.has(w)) continue;
    const stack = [w]; basin.set(w, bid);
    while(stack.length){
      for(const n of neighbours(stack.pop())) if(water.has(n) && !basin.has(n)){ basin.set(n, bid); stack.push(n); }
    }
    bid++;
  }

  const basinPorts = new Map(), shipOnly = [];
  portSlots.forEach((p, i) => {
    if(land.has(p.hex)) return;               /* on land: reachable by road */
    const b = basin.get(p.hex);
    if(b === undefined) return;
    if(!basinPorts.has(b)) basinPorts.set(b, []);
    basinPorts.get(b).push(i);
    shipOnly.push(i);
  });

  /* water-hex distance from every ship-only port (BFS over water) */
  const portDist = new Map();
  for(const pi of shipOnly){
    const start = portSlots[pi].hex;
    const d = new Map([[start, 0]]), queue = [start];
    for(let qi = 0; qi < queue.length; qi++){
      const cur = queue[qi];
      for(const n of neighbours(cur)) if(water.has(n) && !d.has(n)){ d.set(n, d.get(cur) + 1); queue.push(n); }
    }
    portDist.set(pi, d);
  }

  /* per vertex: the nearest hop count to each reachable port */
  const reach = new Map();
  for(const k of water){
    const [q, r] = unhk(k);
    for(const v of hexVerts(q, r)){
      if(!reach.has(v)) reach.set(v, new Map());
      const m = reach.get(v);
      for(const pi of shipOnly){
        const d = portDist.get(pi).get(k);
        if(d !== undefined && (!m.has(pi) || m.get(pi) > d)) m.set(pi, d);
      }
    }
  }
  /* flat cost: every hop is free — the rule exactly as the group plays it */
  const decay = hops => flatCost ? 1 : 1 / (1 + 0.34 * Math.max(0, hops));
  return { water, basin, reach, basinPorts, shipOnly, decay, flatCost };
}
