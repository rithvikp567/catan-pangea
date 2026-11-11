/**
 * The penalty function the annealer minimises — what "a better board"
 * means. Lower is better.
 */
import { TERRAIN, PIPS, RES_ORDER, PORT_SITE_DIST } from "./catalog.js";
import { hexDist } from "./hex.js";
import { mulberry32 } from "./random.js";
import { adjacentPairs } from "./topology.js";
import { buildVertexModel, simulateDraft, topIndependent } from "./vertexModel.js";

/** Penalty weights, in one place so they can be tuned and tested. */
export const PENALTY = {
  redPair: 260,          /* a 6/8 touching another 6/8 — effectively a hard rule */
  sameNumber: 42,        /* identical numbers adjacent */
  clump: 9,              /* same-terrain adjacency beyond 16% of all adjacencies */
  clumpAllowance: 0.16,
  resourceBalance: 2.4,  /* × squared pip deviation from each resource's tile share */
  portSite: 12,          /* per hex a 2:1 port's resource sits away from PORT_SITE_DIST */
  seatSpread: 26,        /* × std-dev of weighted pips across seats */
  missingResource: 55,   /* per resource a seat opens short of 4 */
  oreWheatFloor: 320,    /* per seat missing ore / wheat when the floor is on (≈ hard) */
  ckNoOre: 80,           /* C&K preference when the floor is off */
  ckNoGrain: 70,
  seatNot3Spot: 34,      /* per top-2N spot that isn't a 3-resource spot */
  seatOn1Spot: 60,       /* per top-2N spot that is a 1-resource spot */
  laneTrap: 12,          /* Sea Lanes: 1-spot with sea reach — loses slowly */
  laneBay: 8,            /* Sea Lanes: 2/3-spot with sea reach — a real line (bonus) */
  laneBayCap: 10,
  deadZone: 7,           /* 3-spot worth ≤ 4 pips (desert sterilising a region) */
};

/**
 * Everything the objective needs that stays fixed during an anneal.
 * @param {object} p
 * @param {import("./topology.js").Topology} p.topo
 * @param {import("./ports.js").PortSlot[]} p.portSlots
 * @param {import("./seaLanes.js").SeaLanes|null} p.lanes
 * @param {"ck"|"base"} p.profile
 * @param {number} p.nPlayers
 * @param {number} p.seed
 * @param {boolean} p.oreWheatFloor every seat must open with ore + wheat
 */
export function buildContext({ topo, portSlots, lanes, profile, nPlayers, seed, oreWheatFloor }){
  const land = topo.land;
  return {
    topo, portSlots, lanes, profile, nPlayers, seed, oreWheatFloor,
    adjPairs: adjacentPairs(land),
    /* slot -> (land hex -> distance), so port siting is cheap to score */
    slotDist: portSlots.map(s => new Map([...land].map(k => [k, hexDist(k, s.hex)]))),
  };
}

/**
 * Score a candidate board.
 * @param {ReturnType<typeof buildContext>} ctx
 * @param {import("./tileSet.js").TileMap} tiles
 * @param {import("./ports.js").Port[]} [ports] port at each ctx.portSlots slot
 * @returns {{ pen:number, detail:object }}
 */
export function evaluate(ctx, tiles, ports){
  const { topo, lanes, profile, nPlayers, adjPairs } = ctx;
  const portSlots = ports
    ? ctx.portSlots.map((s, i) => s.port === ports[i] ? s : { ...s, port:ports[i] })
    : ctx.portSlots;
  const P = PENALTY;
  const detail = {};
  let pen = 0;

  /* --- port siting --- */
  let siteDev = 0, siteN = 0;
  portSlots.forEach((s, i) => {
    if(s.port.type !== "two") return;
    let d = Infinity;
    for(const [k, dist] of ctx.slotDist[i]) if(dist < d && TERRAIN[tiles.get(k).terrain].res === s.port.res) d = dist;
    if(d === Infinity) return;
    siteDev += Math.abs(d - PORT_SITE_DIST); siteN++;
  });
  detail.portSiteDev = siteN ? siteDev / siteN : 0;
  pen += siteDev * P.portSite;

  /* --- adjacency rules --- */
  let red = 0, same = 0, clump = 0;
  for(const [a, b] of adjPairs){
    const ta = tiles.get(a), tb = tiles.get(b);
    if(ta.num && tb.num){
      const ra = ta.num === 6 || ta.num === 8, rb = tb.num === 6 || tb.num === 8;
      if(ra && rb) red++;
      if(ta.num === tb.num) same++;
    }
    if(ta.terrain === tb.terrain && ta.terrain !== "desert") clump++;
  }
  detail.red = red; detail.same = same;
  pen += red * P.redPair + same * P.sameNumber
       + Math.max(0, clump - Math.floor(adjPairs.length * P.clumpAllowance)) * P.clump;

  /* --- resource pips track tile count, not parity (ore/brick have fewer tiles) --- */
  const rp = {}, rc = {};
  let totalPips = 0, totalTiles = 0;
  for(const t of tiles.values()){
    const r = TERRAIN[t.terrain].res;
    if(!r) continue;
    const p = t.num ? PIPS[t.num] : 0;
    rp[r] = (rp[r] || 0) + p; rc[r] = (rc[r] || 0) + 1;
    totalPips += p; totalTiles++;
  }
  let resDev = 0;
  const resIdx = {};
  for(const r of RES_ORDER){
    const exp = totalPips * ((rc[r] || 0) / totalTiles);
    const act = rp[r] || 0;
    resIdx[r] = exp > 0 ? act / exp : 1;
    resDev += (act - exp) ** 2;
  }
  detail.resIdx = resIdx;
  pen += resDev * P.resourceBalance;

  /* --- draft fairness: two deterministic simulated snake drafts --- */
  const model = buildVertexModel(topo, tiles, portSlots, lanes, profile);
  const runs = [
    simulateDraft(model, topo, nPlayers, profile, mulberry32(ctx.seed ^ 0x9E3779B9)),
    simulateDraft(model, topo, nPlayers, profile, mulberry32(ctx.seed ^ 0x85EBCA6B)),
  ];
  for(const seats of runs){
    const vals = seats.map(s => s.wpips);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    pen += sd * P.seatSpread;
    for(const s of seats){
      if(s.res.size < 4) pen += (4 - s.res.size) * P.missingResource;
      if(ctx.oreWheatFloor){
        if(!s.res.has("ore"))   pen += P.oreWheatFloor;
        if(!s.res.has("grain")) pen += P.oreWheatFloor;
      } else if(profile === "ck"){
        if(!s.res.has("ore"))   pen += P.ckNoOre;
        if(!s.res.has("grain")) pen += P.ckNoGrain;
      }
    }
  }
  detail.draft = runs[0];

  /* --- seating quality: 2N non-conflicting spots, how good are they --- */
  const top = topIndependent(model, topo, nPlayers * 2);
  detail.topDeg3 = top.filter(v => v.deg === 3).length;
  detail.topDeg1 = top.filter(v => v.deg === 1).length;
  pen += (nPlayers * 2 - detail.topDeg3) * P.seatNot3Spot + detail.topDeg1 * P.seatOn1Spot;

  /* --- Sea Lanes: bays are good, spikes are traps --- */
  if(lanes){
    let bays = 0, traps = 0;
    for(const v of model.verts){
      if(v.laneCount < 2) continue;
      if(v.deg >= 2) bays++; else traps++;
    }
    detail.bays = bays; detail.traps = traps;
    pen += traps * P.laneTrap - Math.min(bays, P.laneBayCap) * P.laneBay;
  }

  /* --- a desert should not sterilise an otherwise strong region --- */
  let deadzone = 0;
  for(const v of model.verts) if(v.deg === 3 && v.pips <= 4) deadzone++;
  pen += deadzone * P.deadZone;

  detail.model = model;
  return { pen, detail };
}
