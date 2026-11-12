/**
 * Base class for board types. generate() is a template method: the
 * pipeline is fixed (grow → compactify → ports → anneal → score) and
 * subclasses override only the hooks that differ — frame, floor, ports,
 * sea lanes. Adding a board type means adding one small subclass and
 * registering it in ./index.js.
 */
import { hashSeed, mulberry32 } from "../random.js";
import { Smax, topology, outerCoast } from "../topology.js";
import { growContinent, compactify } from "../continent.js";
import { dealTiles } from "../tileSet.js";
import { orderBoundary, evenSpots, portSet, assignPorts } from "../ports.js";
import { buildContext, evaluate } from "../objective.js";
import { Annealer } from "../Annealer.js";
import { Board } from "../Board.js";

export const MIN_TILES = 13;

export class BoardGenerator {
  /**
   * @param {object} p
   * @param {string} p.id           stable identifier (settings, URLs)
   * @param {string} p.name         display name
   * @param {string} p.description  one-line explanation for the UI
   * @param {number} p.portCount
   * @param {number} [p.maxTiles]
   * @param {boolean} [p.oreWheatFloor] every seat must open with ore + wheat
   * @param {boolean} [p.usesShipRule]  whether the ship-to-port rule applies
   */
  constructor({ id, name, description, portCount, maxTiles = 30, oreWheatFloor = false, usesShipRule = false }){
    if(new.target === BoardGenerator) throw new TypeError("BoardGenerator is abstract");
    Object.assign(this, { id, name, description, portCount, maxTiles, oreWheatFloor, usesShipRule });
  }

  /* ---------- hooks ---------- */

  /** Hexes the land may occupy, or null for an unbounded open sea. */
  domain(){ return null; }

  /** The S / Smax floor actually targeted, from the requested compactness. */
  effectiveFloor(compactness){ return compactness; }

  /** Growth exponent: larger grows a rounder blob before compactify. */
  growthExponent(/* floor */){ return 2.0; }

  /** Ordered coastline edges to space the port slots along. */
  portSlotSource(topo /* , domain */){ return orderBoundary(outerCoast(topo)); }

  /** Sea-lane model, if this board type has one. */
  buildLanes(/* land, domain, portSlots, request */){ return null; }

  /* ---------- pipeline ---------- */

  /** Clamp a request to what this board type supports. */
  normalise(request){
    const tiles = Math.max(MIN_TILES, Math.min(this.maxTiles, Math.round(request.tiles)));
    return { ...request, tiles };
  }

  /**
   * @param {import("../Board.js").GenerationRequest} request
   * @param {object} [opts]
   * @param {Annealer} [opts.annealer]
   * @param {(fraction:number) => void} [opts.onProgress]
   * @param {AbortSignal} [opts.signal]
   * @returns {Promise<Board>}
   */
  async generate(request, { annealer = new Annealer(), onProgress, signal } = {}){
    request = this.normalise(request);
    const seedNum = hashSeed(request.seed);
    const rng = mulberry32(seedNum);
    const domain = this.domain();

    const floor = this.effectiveFloor(request.compactness);
    const targetS = Math.round(Smax(request.tiles) * floor);
    const land = compactify(growContinent(rng, request.tiles, this.growthExponent(floor), domain), domain, targetS);
    const topo = topology(land);

    const source = this.portSlotSource(topo, domain);
    const rawSlots = evenSpots(this.portCount, source.length).map(i => source[i]);
    const initial = dealTiles(land, rng);
    const terrainByHex = new Map([...initial.tiles].map(([k, t]) => [k, t.terrain]));
    const portSlots = assignPorts(rawSlots, portSet(this.portCount), terrainByHex, rng);
    const lanes = this.buildLanes(land, domain, portSlots, request);

    const ctx = buildContext({
      topo, portSlots, lanes, seed:seedNum,
      profile:request.profile, nPlayers:request.players, oreWheatFloor:this.oreWheatFloor,
    });
    const out = await annealer.run(ctx, initial, { iterations:request.iterations, onProgress, signal });

    return new Board({
      generatorId:this.id, request, topo, domain, targetS, lanes,
      tiles:out.tiles, portSlots:out.portSlots, evaluation:out.evaluation,
    });
  }

  /**
   * Rebuild a Board from Board#toSnapshot() — no annealing, so it is
   * instant and identical on every device. The score is re-derived with
   * the same seeded draft simulation, so it matches the original.
   * @param {import("../Board.js").BoardSnapshot} snapshot
   * @returns {Board}
   */
  restore(snapshot){
    if(snapshot?.v !== 1 || snapshot.generatorId !== this.id) throw new Error("Unsupported board snapshot");
    const request = this.normalise(snapshot.request);
    const tiles = new Map();
    for(const row of snapshot.tiles){
      const [key, terrain, num] = row.split("|");
      tiles.set(key, { key, terrain, num: Number(num) || null });
    }
    const portSlots = snapshot.ports.map(row => {
      const [edge, hex, type, res] = row.split("|");
      return { edge, hex, port:{ type, res: res === "-" ? null : res } };
    });
    const land = new Set(tiles.keys());
    const topo = topology(land);
    const domain = this.domain();
    const lanes = this.buildLanes(land, domain, portSlots, request);
    const ctx = buildContext({
      topo, portSlots, lanes, seed:hashSeed(request.seed),
      profile:request.profile, nPlayers:request.players, oreWheatFloor:this.oreWheatFloor,
    });
    return new Board({
      generatorId:this.id, request, topo, domain, lanes, tiles, portSlots,
      evaluation:evaluate(ctx, tiles),
      targetS:Math.round(Smax(request.tiles) * this.effectiveFloor(request.compactness)),
    });
  }
}
