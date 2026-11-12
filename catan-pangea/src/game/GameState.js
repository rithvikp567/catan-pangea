/**
 * Read-only view over the synced data (profiles, the active session and
 * the wins ledger) with the derived facts the UI needs. Built fresh on
 * every change; never mutated.
 */
import { MAX_VP, colorById, seatKey, seasonOf } from "./rules.js";

/**
 * @typedef {{ id:string, name:string, createdAt:number, deviceId:string }} Profile
 * @typedef {object} Seat
 * @property {string} key       "s0"…
 * @property {number} index
 * @property {string|null} profileId
 * @property {Profile|null} profile
 * @property {string|null} color      colour id
 * @property {string|null} colorHex
 * @property {number} vp
 * @property {boolean} honorable
 */

export class GameState {
  /** @param {{ profiles?:object, session?:object, wins?:object }} raw */
  constructor({ profiles, session, wins } = {}){
    this.profileMap = new Map(Object.entries(profiles ?? {}).map(([id, p]) => [id, { id, ...p }]));
    this.session = session?.meta ? session : null;
    this.wins = wins ?? {};
    Object.freeze(this);
  }

  /** @returns {Profile[]} oldest first */
  get profiles(){ return [...this.profileMap.values()].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)); }
  profile(id){ return this.profileMap.get(id) ?? null; }

  get sessionId(){ return this.session?.meta.id ?? null; }
  get players(){ return this.session?.meta.players ?? 0; }

  get counters(){
    const c = this.session?.counters ?? {};
    return { knightsMain:c.knightsMain ?? 0, knightsOff:c.knightsOff ?? 0, karma:c.karma ?? 0, robber:c.robber ?? 1 };
  }

  /** @returns {Seat[]} */
  get seats(){
    if(!this.session) return [];
    const raw = this.session.seats ?? {};
    return Array.from({ length:this.players }, (_, index) => {
      const key = seatKey(index), s = raw[key] ?? {};
      const profile = s.profileId ? this.profile(s.profileId) : null;
      return {
        key, index, profile,
        profileId: profile ? s.profileId : null,        /* a removed profile frees its seat */
        color: profile ? (s.color ?? null) : null,
        colorHex: profile ? (colorById(s.color)?.hex ?? null) : null,
        vp: s.vp ?? 0,
        honorable: s.honorable !== false,
      };
    });
  }

  seatOf(profileId){ return this.seats.find(s => s.profileId === profileId) ?? null; }

  /** Seated players currently on MAX_VP. */
  get winners(){ return this.seats.filter(s => s.profileId && s.vp >= MAX_VP); }

  /** colour id -> name of the profile holding it (excluding `exceptProfileId`). */
  takenColors(exceptProfileId = null){
    const out = new Map();
    for(const s of this.seats) if(s.color && s.profileId !== exceptProfileId) out.set(s.color, s.profile.name);
    return out;
  }

  get openSeats(){ return this.seats.filter(s => !s.profileId).length; }

  /** Anything worth warning about before starting over. */
  get hasProgress(){
    if(!this.session) return false;
    const c = this.counters;
    return this.seats.some(s => s.profileId || s.vp > 0 || !s.honorable)
        || c.knightsMain > 0 || c.knightsOff > 0 || c.karma !== 0;
  }

  /** Years with any wins recorded, plus the current one, newest first. */
  seasons(now = Date.now()){
    const years = new Set(Object.keys(this.wins).map(Number).filter(Number.isFinite));
    years.add(seasonOf(now));
    return [...years].sort((a, b) => b - a);
  }

  /** Total wins per profile for a season (ledger entries sum; never below 0). */
  winsFor(season){
    const totals = new Map(this.profiles.map(p => [p.id, 0]));
    for(const e of Object.values(this.wins[season] ?? {})){
      if(totals.has(e.profileId)) totals.set(e.profileId, totals.get(e.profileId) + (e.delta ?? 1));
    }
    return this.profiles
      .map(p => ({ profile:p, wins:Math.max(0, totals.get(p.id)) }))
      .sort((a, b) => b.wins - a.wins || a.profile.name.localeCompare(b.profile.name));
  }
}
