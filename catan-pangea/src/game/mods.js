/**
 * Mods: the house rules a room plays with, picked when the room is made
 * (the Mods screen) and stored with it (rooms/{id}/info/mods). An
 * immutable value object, like Settings: validated fields with defaults,
 * and the facts the tracker derives from them. Pure — no I/O, no DOM.
 *
 *   karmaRobber  the Karma counter and the Robber (Abstain / Rob change
 *                karma, so they come as one)
 *   walker       the word WALKER and the winter that comes with it
 *   battle       knight duels — the Battle button (Cities & Knights boards
 *                only: the base game has no knights)
 *   vpToWin      a custom number of points to win; null: the board's own
 *                (13 on Cities & Knights, 10 in the base game)
 */
import { MAX_VP, BASE_VP, clamp } from "./rules.js";

/** The custom points-to-win range. */
export const VP_TO_WIN = Object.freeze({ min:5, max:20 });

/** Points to win on a board made for `profile` ("ck" | "base"), with no custom target. */
export const defaultVP = profile => profile === "base" ? BASE_VP : MAX_VP;

export class Mods {
  static DEFAULTS = Object.freeze({ karmaRobber:true, walker:true, battle:true, vpToWin:null });

  /** The on / off mods, in the order the Mods screen and a room's summary list them. */
  static SWITCHES = Object.freeze([
    Object.freeze({ key:"karmaRobber", label:"Karma & Robber" }),
    Object.freeze({ key:"walker",      label:"Walker" }),
    Object.freeze({ key:"battle",      label:"Battle" }),
  ]);

  /** @param {object} [raw]  unvalidated, e.g. from the database */
  constructor(raw = {}){
    const v = raw ?? {};
    for(const { key } of Mods.SWITCHES) this[key] = typeof v[key] === "boolean" ? v[key] : Mods.DEFAULTS[key];
    const vp = Number(v.vpToWin);
    this.vpToWin = v.vpToWin != null && Number.isInteger(vp) ? clamp(vp, VP_TO_WIN.min, VP_TO_WIN.max) : null;
    Object.freeze(this);
  }

  /** A copy with some fields changed (re-validated). */
  with(patch){ return new Mods({ ...this.toJSON(), ...patch }); }

  /** Points to win on a board made for `profile` ("ck" | "base"). */
  vpTarget(profile){ return this.vpToWin ?? defaultVP(profile); }

  /**
   * The title of the tile that holds karma, the robber and WALKER — only
   * what's on: "Karma and Robber & Walker", "Karma and Robber", "Walker",
   * or null when neither is (no tile).
   */
  get karmaTitle(){
    const parts = [this.karmaRobber && "Karma and Robber", this.walker && "Walker"].filter(Boolean);
    return parts.length ? parts.join(" & ") : null;
  }

  /** What's on, in a few words each, for a room's summary: switches, then the points to win. */
  summary(profile){
    return [...Mods.SWITCHES.filter(s => this[s.key]).map(s => s.label), `${this.vpTarget(profile)} VP`];
  }

  /** For the database (nulls are never stored). */
  toJSON(){
    const { karmaRobber, walker, battle, vpToWin } = this;
    return { karmaRobber, walker, battle, ...(vpToWin != null ? { vpToWin } : {}) };
  }
}
