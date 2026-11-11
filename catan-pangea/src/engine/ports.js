/**
 * Port slots on the coastline and the initial choice of which port sits
 * where. The annealer later swaps ports between slots.
 */
import { TERRAIN, RES_ORDER, PORT_SITE_DIST } from "./catalog.js";
import { hexDist } from "./hex.js";
import { shuffle } from "./random.js";

/**
 * @typedef {{ type:"two"|"three", res:string|null }} Port
 * @typedef {{ edge:string, hex:string, water?:string, port:Port }} PortSlot
 */

/**
 * Walk boundary edges into an ordered cycle so ports space evenly around a
 * concave coastline rather than by angle from the centroid. Anything the
 * walk cannot reach is appended at the end.
 */
export function orderBoundary(boundary){
  if(!boundary.length) return [];
  const byV = new Map();
  boundary.forEach((b, i) => {
    const [a, c] = b.edge.split("/");
    b.a = a; b.c = c; b.i = i;
    if(!byV.has(a)) byV.set(a, []); byV.get(a).push(b);
    if(!byV.has(c)) byV.set(c, []); byV.get(c).push(b);
  });
  const used = new Set([0]), cycle = [boundary[0]];
  let v = boundary[0].c;
  for(let guard = 0; guard < boundary.length * 3; guard++){
    const next = (byV.get(v) || []).find(b => !used.has(b.i));
    if(!next) break;
    used.add(next.i); cycle.push(next);
    v = next.a === v ? next.c : next.a;
  }
  boundary.forEach(b => { if(!used.has(b.i)) cycle.push(b); });
  return cycle;
}

/** n indices spread evenly over [0, total). */
export function evenSpots(n, total){
  const out = [];
  for(let i = 0; i < n; i++) out.push(Math.round(i * total / n) % total);
  return out;
}

/** One 2:1 port per resource; the rest are 3:1. @returns {Port[]} */
export function portSet(count){
  const specific = RES_ORDER.map(res => ({ type:"two", res }));
  const generic = Array.from({ length: count - specific.length }, () => ({ type:"three", res:null }));
  return [...specific, ...generic];
}

/**
 * Initial assignment of ports to coastal slots: each 2:1 port takes the
 * free slot whose distance to its resource is closest to PORT_SITE_DIST.
 * Only a starting point — the annealer keeps scoring the same rule.
 * @param {Map<string,string>} terrainByHex
 * @returns {PortSlot[]}
 */
export function assignPorts(slots, ports, terrainByHex, rng){
  const order = shuffle(rng, ports);
  const dist = (slot, res) => {
    let d = Infinity;
    for(const [k, t] of terrainByHex) if(TERRAIN[t].res === res) d = Math.min(d, hexDist(k, slot.hex));
    return d;
  };
  const out = new Array(slots.length).fill(null);
  const taken = new Set();
  for(const p of order.filter(p => p.type === "two")){
    let bi = -1, bs = Infinity;
    slots.forEach((s, i) => {
      if(taken.has(i)) return;
      const sc = Math.abs(dist(s, p.res) - PORT_SITE_DIST);
      if(sc < bs){ bs = sc; bi = i; }
    });
    if(bi >= 0){ out[bi] = p; taken.add(bi); }
  }
  const generic = order.filter(p => p.type === "three");
  let gi = 0;
  slots.forEach((s, i) => { if(!taken.has(i) && gi < generic.length) out[i] = generic[gi++]; });
  return slots.map((s, i) => ({ ...s, port:out[i] })).filter(s => s.port);
}
