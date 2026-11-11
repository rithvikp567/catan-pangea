/**
 * Topology of a landmass: intersections, edges, coastline, lakes.
 *
 * The counting identities the whole tool rests on (A land tiles, S
 * land-to-land edges, L enclosed lakes, v1/v2/v3 = intersections touching
 * 1/2/3 tiles) follow from Euler's formula:
 *     v3 = S − A + 1 − L
 *     v2 = 3A − S − 3 + 3L
 *     v1 = 3A − S + 3 − 3L
 * so the only lever on how many 3-resource spots exist is S.
 */
import { DIRS, EDGE_DIR, hk, unhk, ek, hexVerts, neighbours } from "./hex.js";

/** Maximum land-land adjacencies for A hexes (Harary–Harborth spiral packing). */
export const Smax = A => Math.floor(3*A - Math.sqrt(12*A - 3));

/** S: the number of land-to-land tile edges. */
export function adjacencyCount(land){
  let S = 0;
  for(const k of land) for(const n of neighbours(k)) if(land.has(n)) S++;
  return S / 2;
}

/** Number of land neighbours of hex k. */
export const landNeighbours = (land, k) => neighbours(k).filter(n => land.has(n)).length;

export function isConnected(land){
  if(land.size === 0) return true;
  const start = land.values().next().value;
  const seen = new Set([start]), stack = [start];
  while(stack.length){
    for(const n of neighbours(stack.pop())) if(land.has(n) && !seen.has(n)){ seen.add(n); stack.push(n); }
  }
  return seen.size === land.size;
}

/** Each unordered pair of touching land hexes, once. */
export function adjacentPairs(land){
  const pairs = [], seen = new Set();
  for(const k of land) for(const n of neighbours(k)){
    if(!land.has(n)) continue;
    const e = ek(k, n);
    if(seen.has(e)) continue;
    seen.add(e); pairs.push([k, n]);
  }
  return pairs;
}

/**
 * @typedef {object} Topology
 * @property {Set<string>} land
 * @property {number} A
 * @property {number} S
 * @property {Map<string,string[]>} vHex   vertex -> touching land hexes
 * @property {Map<string,Set<string>>} vAdj vertex -> adjacent vertices (road graph)
 * @property {Map<string,string[]>} edgeHex edge -> land hexes sharing it
 * @property {{edge:string, hex:string, water:string}[]} boundary coastline edges
 * @property {{1:number,2:number,3:number}} counts intersections by tiles touched
 */

/** Full vertex / edge / boundary model for a landmass. @returns {Topology} */
export function topology(land){
  const vHex = new Map(), vAdj = new Map(), edgeHex = new Map(), across = new Map();

  for(const k of land){
    const [q, r] = unhk(k);
    const vs = hexVerts(q, r);
    vs.forEach((v, i) => {
      if(!vHex.has(v)) vHex.set(v, []);
      vHex.get(v).push(k);
      const w = vs[(i+1) % 6], e = ek(v, w);
      if(!edgeHex.has(e)) edgeHex.set(e, []);
      edgeHex.get(e).push(k);
      const [dq, dr] = DIRS[EDGE_DIR[i]];
      across.set(e, hk(q+dq, r+dr));
      if(!vAdj.has(v)) vAdj.set(v, new Set());
      if(!vAdj.has(w)) vAdj.set(w, new Set());
      vAdj.get(v).add(w); vAdj.get(w).add(v);
    });
  }
  const counts = { 1:0, 2:0, 3:0 };
  for(const [, hs] of vHex) counts[hs.length]++;

  /* coastline: edges with land on one side; `water` is the hex on the other */
  const boundary = [];
  for(const [e, hs] of edgeHex) if(hs.length === 1) boundary.push({ edge:e, hex:hs[0], water:across.get(e) });

  return { land, A:land.size, S:adjacencyCount(land), vHex, vAdj, edgeHex, boundary, counts };
}

/**
 * Enclosed lakes: water hexes in the bounding box unreachable from outside.
 * `lakes` lists lake hexes; `regions` counts separate lakes (a two-hex lake
 * is one lake — and one face in the Euler count).
 */
export function findLakes(land, domain = null){
  const src = domain ? new Set(domain) : land;
  let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
  for(const k of src){
    const [q, r] = unhk(k);
    minQ = Math.min(minQ, q); maxQ = Math.max(maxQ, q);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
  }
  minQ -= 2; maxQ += 2; minR -= 2; maxR += 2;
  const inBox = k => { const [q, r] = unhk(k); return q >= minQ && q <= maxQ && r >= minR && r <= maxR; };

  const corner = hk(minQ, minR);
  const outside = new Set([corner]), stack = [corner];
  while(stack.length){
    for(const n of neighbours(stack.pop())){
      if(inBox(n) && !land.has(n) && !outside.has(n)){ outside.add(n); stack.push(n); }
    }
  }
  const lakes = [];
  for(let q = minQ; q <= maxQ; q++) for(let r = minR; r <= maxR; r++){
    const k = hk(q, r);
    if(!land.has(k) && !outside.has(k)) lakes.push(k);
  }
  const lakeSet = new Set(lakes), seen = new Set();
  let regions = 0;
  for(const k of lakes){
    if(seen.has(k)) continue;
    regions++;
    const st = [k]; seen.add(k);
    while(st.length) for(const n of neighbours(st.pop())) if(lakeSet.has(n) && !seen.has(n)){ seen.add(n); st.push(n); }
  }
  return { lakes, outside, regions };
}

/**
 * Coastline facing the open sea only. Lake shores are boundary edges too,
 * but ports belong on the outer coast — and a coastline walk that starts
 * on a lake ring never visits the real coast in order. Each corner of the
 * outer coast has exactly two outer-coast edges, so the result is a single
 * clean cycle for orderBoundary to walk.
 */
export function outerCoast(topo){
  const { outside } = findLakes(topo.land);
  return topo.boundary.filter(b => outside.has(b.water));
}
