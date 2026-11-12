/**
 * Intersection values and the simulated settlement draft used to judge
 * fairness.
 */
import { TERRAIN, PIPS, WEIGHTS, PORT_VALUE, LANE_DISCOUNT } from "./catalog.js";

/**
 * @typedef {object} VertexInfo
 * @property {string} vk
 * @property {number} deg     tiles touched (1–3)
 * @property {number} pips    raw dice pips
 * @property {number} wpips   pips weighted by terrain value
 * @property {Set<string>} res resources touched
 * @property {number} portVal
 * @property {number} laneVal
 * @property {number} laneCount ship-only ports reachable
 * @property {number[]} directPorts
 * @property {number} value   total desirability used by the draft
 */

/** Value every land intersection. @returns {{ verts:VertexInfo[], index:Map<string,number> }} */
export function buildVertexModel(topo, tiles, portSlots, lanes, profile){
  const W = WEIGHTS[profile];
  const verts = [], index = new Map();

  /* ports reachable by road: both corners of the port's edge */
  const directPort = new Map();
  portSlots.forEach((p, i) => {
    for(const v of p.edge.split("/")){
      if(!directPort.has(v)) directPort.set(v, []);
      directPort.get(v).push(i);
    }
  });

  for(const [vk, hexes] of topo.vHex){
    let pips = 0, wpips = 0;
    const res = new Set();
    for(const h of hexes){
      const t = tiles.get(h);
      if(!t) continue;
      const p = t.num ? PIPS[t.num] : 0;
      pips += p;
      wpips += p * (W[t.terrain] || 1);
      if(TERRAIN[t.terrain].res) res.add(TERRAIN[t.terrain].res);
    }
    const dp = directPort.get(vk) || [];
    let portVal = 0;
    for(const i of dp) portVal += PORT_VALUE[portSlots[i].port.type];

    let laneVal = 0, laneCount = 0;
    if(lanes && lanes.reach.has(vk)){
      const entries = [...lanes.reach.get(vk)].filter(([i]) => !dp.includes(i));
      laneCount = entries.length;
      /* one port per player and one trade per turn: only the two best
         reachable ports carry value — the rest are contested options */
      laneVal = entries
        .map(([i, hops]) => PORT_VALUE[portSlots[i].port.type] * lanes.decay(hops))
        .sort((a, b) => b - a).slice(0, 2)
        .reduce((a, b) => a + b, 0) * LANE_DISCOUNT;
    }
    index.set(vk, verts.length);
    verts.push({ vk, deg:hexes.length, pips, wpips, res, portVal, laneVal, laneCount,
                 directPorts:dp, value: wpips + portVal + laneVal });
  }
  return { verts, index };
}

/**
 * @typedef {object} SeatResult
 * @property {number} pips
 * @property {number} wpips
 * @property {Set<string>} res
 * @property {number} ports
 * @property {string[]} spots
 * @property {number[]} degs
 */

/**
 * Greedy 1→N→1 snake draft: each seat takes the best open intersection
 * (value + a bonus for resources it doesn't have yet), honoring the
 * distance rule. @returns {SeatResult[]}
 */
export function simulateDraft(model, topo, nPlayers, profile, rng){
  const order = [];
  for(let i = 0; i < nPlayers; i++) order.push(i);
  for(let i = nPlayers - 1; i >= 0; i--) order.push(i);

  const blocked = new Set();
  const seats = Array.from({ length:nPlayers }, () => ({ pips:0, wpips:0, res:new Set(), ports:0, spots:[], degs:[] }));
  const newResBonus = profile === "ck" ? 1.9 : 1.5;   /* C&K needs breadth for commodities */

  for(const p of order){
    const me = seats[p];
    let best = null, bestScore = -1;
    for(const v of model.verts){
      if(blocked.has(v.vk)) continue;
      let div = 0;
      for(const r of v.res) if(!me.res.has(r)) div += newResBonus;
      const sc = v.value + div + rng() * 0.15;
      if(sc > bestScore){ bestScore = sc; best = v; }
    }
    if(!best) break;
    me.pips += best.pips; me.wpips += best.wpips;
    me.ports += best.directPorts.length + (best.laneCount > 0 ? 1 : 0);
    best.res.forEach(r => me.res.add(r));
    me.spots.push(best.vk); me.degs.push(best.deg);
    blocked.add(best.vk);
    for(const n of topo.vAdj.get(best.vk) || []) blocked.add(n);
  }
  return seats;
}

/**
 * Greedy independent set of the best intersections — the real question is
 * not "how many 3-spots exist" but "can 2N non-conflicting good spots be
 * seated at once".
 */
export function topIndependent(model, topo, count){
  const sorted = model.verts.slice().sort((a, b) => b.value - a.value);
  const blocked = new Set(), out = [];
  for(const v of sorted){
    if(blocked.has(v.vk)) continue;
    out.push(v); blocked.add(v.vk);
    for(const n of topo.vAdj.get(v.vk) || []) blocked.add(n);
    if(out.length >= count) break;
  }
  return out;
}
