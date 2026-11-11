/**
 * User settings: an immutable value object with validated fields and the
 * presets the UI offers. It knows how to turn itself into the engine's
 * GenerationRequest; the engine knows nothing about presets.
 */
import { getGenerator, GENERATORS, MIN_TILES } from "../engine/index.js";

export const PLAYER_COUNTS = [3, 4, 5, 6];

export const PROFILES = [
  { value:"ck",   label:"Cities & Knights" },
  { value:"base", label:"Base game" },
];

export const SHIP_RULES = [
  { value:"flat", label:"Flat cost" },
  { value:"dist", label:"Per hop" },
];

/** Coastline floor presets: target S / Smax. Tight carries over the old "Surveyed" generator. */
export const COASTLINES = [
  { value:"loose",    label:"Loose",    floor:0.80 },
  { value:"standard", label:"Standard", floor:0.90 },
  { value:"tight",    label:"Tight",    floor:0.95 },
];

/** Optimiser presets: annealing steps. */
export const QUALITIES = [
  { value:"quick",    label:"Quick",    iterations:6000 },
  { value:"standard", label:"Standard", iterations:12000 },
  { value:"thorough", label:"Thorough", iterations:20000 },
];

const oneOf = (list, v, fallback) => list.some(o => (o.value ?? o) === v) ? v : fallback;

export class Settings {
  static DEFAULTS = Object.freeze({
    mode:"open", players:4, tiles:19, profile:"ck",
    shipRule:"flat", coastline:"standard", quality:"standard",
  });

  /** @param {Partial<typeof Settings.DEFAULTS>} values unvalidated, e.g. from storage */
  constructor(values = {}){
    const d = Settings.DEFAULTS, v = { ...d, ...values };
    this.mode      = oneOf(GENERATORS.map(g => g.id), v.mode, d.mode);
    this.players   = oneOf(PLAYER_COUNTS, v.players, d.players);
    this.profile   = oneOf(PROFILES, v.profile, d.profile);
    this.shipRule  = oneOf(SHIP_RULES, v.shipRule, d.shipRule);
    this.coastline = oneOf(COASTLINES, v.coastline, d.coastline);
    this.quality   = oneOf(QUALITIES, v.quality, d.quality);
    const tiles = Number.isFinite(+v.tiles) ? Math.round(+v.tiles) : d.tiles;
    this.tiles = Math.max(MIN_TILES, Math.min(this.generator.maxTiles, tiles));
    Object.freeze(this);
  }

  /** A copy with some fields changed (re-validated). */
  with(patch){ return new Settings({ ...this.toJSON(), ...patch }); }

  get generator(){ return getGenerator(this.mode); }
  get compactness(){ return COASTLINES.find(c => c.value === this.coastline).floor; }
  get iterations(){ return QUALITIES.find(q => q.value === this.quality).iterations; }

  /** @returns {import("../engine/Board.js").GenerationRequest} */
  toRequest(seed){
    return {
      seed, tiles:this.tiles, players:this.players, profile:this.profile,
      shipRule:this.shipRule, compactness:this.compactness, iterations:this.iterations,
    };
  }

  toJSON(){
    const { mode, players, tiles, profile, shipRule, coastline, quality } = this;
    return { mode, players, tiles, profile, shipRule, coastline, quality };
  }
}
