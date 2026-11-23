/**
 * Read-only view over the synced data — profiles, the rooms (each a
 * RoomState: its mods and the game in it), the wins ledger and the
 * table's playlist — with the derived facts the UI needs. Built fresh on
 * every change; never mutated.
 */
import { colorById, seasonOf } from "./rules.js";
import { RoomState } from "./RoomState.js";

/**
 * @typedef {{ id:string, name:string, createdAt:number, deviceId:string, look?:{ theme?:string, accent?:string, at?:number } }} Profile
 */

export class GameState {
  /** @param {{ profiles?:object, rooms?:object, wins?:object, music?:object }} raw */
  constructor({ profiles, rooms, wins, music } = {}){
    this.profileMap = new Map(Object.entries(profiles ?? {}).map(([id, p]) => [id, { id, ...p }]));
    const profile = id => this.profile(id);
    this.roomMap = new Map(Object.entries(rooms ?? {}).filter(([, r]) => r?.info).map(([id, r]) => [id, new RoomState(id, r, profile)]));
    this.wins = wins ?? {};
    /** @type {{ listId:string, setAt:number, setBy:string|null } | null} */
    this.music = music?.listId ? music : null;
    Object.freeze(this);
  }

  /** @returns {Profile[]} oldest first */
  get profiles(){ return [...this.profileMap.values()].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)); }
  profile(id){ return this.profileMap.get(id) ?? null; }

  /** A room by id, if it exists and hasn't been closed (untouched too long) by `now`. */
  room(id, now){
    const r = id ? this.roomMap.get(id) : null;
    return r && !r.expired(now) ? r : null;
  }

  /** The rooms still open at `now`, newest first. */
  rooms(now){
    return [...this.roomMap.values()].filter(r => !r.expired(now))
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  }

  /** Rooms closed by `now` (untouched too long) that are still stored. */
  expiredRooms(now){ return [...this.roomMap.values()].filter(r => r.expired(now)); }

  /** Years with any wins recorded, plus the current one, newest first. */
  seasons(now = Date.now()){
    const years = new Set(Object.keys(this.wins).map(Number).filter(Number.isFinite));
    years.add(seasonOf(now));
    return [...years].sort((a, b) => b - a);
  }

  /**
   * Total wins per profile for a season (ledger entries sum; never below 0),
   * most first. `leader`: in first place — the most wins, at least one (a
   * tie shares it).
   */
  winsFor(season){
    const totals = new Map(this.profiles.map(p => [p.id, 0]));
    for(const e of Object.values(this.wins[season] ?? {})){
      if(totals.has(e.profileId)) totals.set(e.profileId, totals.get(e.profileId) + (e.delta ?? 1));
    }
    const rows = this.profiles
      .map(p => ({ profile:p, wins:Math.max(0, totals.get(p.id)) }))
      .sort((a, b) => b.wins - a.wins || a.profile.name.localeCompare(b.profile.name));
    const top = rows[0]?.wins ?? 0;
    return rows.map(r => ({ ...r, leader:top > 0 && r.wins === top }));
  }

  /**
   * Every win as it happened, oldest first (the season wins calendar):
   * games won — with each player's points at that moment, `scores`, most
   * first (recorded since 2.10.0; older wins have none) — and wins an admin
   * added by hand (`source:"admin"`). Removals aren't listed, nor wins of
   * removed profiles.
   * @returns {{ id:string, season:number, at:number, source:string, profile:Profile, colorHex:string|null,
   *   scores:{ profile:Profile, vp:number, colorHex:string|null, winner:boolean }[] }[]}
   */
  winHistory(){
    const out = [];
    for(const [season, entries] of Object.entries(this.wins)){
      for(const [id, e] of Object.entries(entries ?? {})){
        const profile = this.profile(e?.profileId);
        if(!profile || (e.delta ?? 1) <= 0 || !Number.isFinite(e.at)) continue;
        const scores = Object.entries(e.scores ?? {})
          .map(([pid, sc]) => ({ profile:this.profile(pid), vp:sc?.vp ?? 0, colorHex:colorById(sc?.color)?.hex ?? null, winner:pid === profile.id }))
          .filter(sc => sc.profile)
          .sort((a, b) => b.vp - a.vp || Number(b.winner) - Number(a.winner) || a.profile.name.localeCompare(b.profile.name));
        out.push({ id, season:Number(season), at:e.at, source:e.source ?? "game", profile,
          colorHex:colorById(e.scores?.[profile.id]?.color)?.hex ?? null, scores });
      }
    }
    return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  }
}
