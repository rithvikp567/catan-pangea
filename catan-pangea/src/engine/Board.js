/**
 * A finished, scored board — the immutable result of a generator run and
 * everything a view needs to draw it.
 */
import { scoreBoard } from "./scoring.js";

/**
 * @typedef {object} GenerationRequest
 * @property {string} seed
 * @property {number} tiles        land hexes (A)
 * @property {number} players
 * @property {"ck"|"base"} profile
 * @property {number} compactness  target S / Smax before generator adjustments
 * @property {number} iterations   annealing steps
 * @property {"flat"|"dist"} [shipRule] Sea Lanes only
 */

export class Board {
  /**
   * @param {object} p
   * @param {string} p.generatorId
   * @param {GenerationRequest} p.request
   * @param {import("./topology.js").Topology} p.topo
   * @param {string[]|null} p.domain
   * @param {import("./tileSet.js").TileMap} p.tiles
   * @param {import("./ports.js").PortSlot[]} p.portSlots
   * @param {import("./seaLanes.js").SeaLanes|null} p.lanes
   * @param {{pen:number, detail:object}} p.evaluation
   * @param {number} p.targetS
   */
  constructor({ generatorId, request, topo, domain, tiles, portSlots, lanes, evaluation, targetS }){
    this.generatorId = generatorId;
    this.request = Object.freeze({ ...request });
    this.topo = topo;
    this.domain = domain;
    this.tiles = tiles;
    this.portSlots = portSlots;
    this.lanes = lanes;
    this.evaluation = evaluation;
    this.targetS = targetS;
    this.score = scoreBoard({ topo, evaluation, players:request.players });
    Object.freeze(this);
  }

  get seed(){ return this.request.seed; }
  get land(){ return this.topo.land; }

  /** Navigable water inside a framed board (empty for open sea). */
  get waterHexes(){
    return this.domain ? this.domain.filter(k => !this.land.has(k)) : [];
  }

  /** True when a port can only be reached by ship. */
  isShipOnly(slot){ return !this.land.has(slot.hex); }
}
