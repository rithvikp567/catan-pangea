/**
 * Read-only view of one room: its name and mods, and the game being
 * played in it — the session (one per map: a New map starts another) with
 * its seats, counters and battles. Built by GameState from
 * rooms/{roomId}; never mutated.
 *
 *   rooms/{roomId}: { info:{ name, createdAt, createdBy?, activeAt, mods }, session:{ … } }
 */
import { COUNTERS, colorById, seatKey, ROOM_TTL_MS } from "./rules.js";
import { Mods } from "./mods.js";
import { isOpen, spentCards } from "./battle.js";

/**
 * @typedef {import("./GameState.js").Profile} Profile
 * @typedef {object} Seat
 * @property {string} key       "s0"…
 * @property {number} index
 * @property {string|null} profileId
 * @property {Profile|null} profile
 * @property {string|null} color      color id
 * @property {string|null} colorHex
 * @property {number} vp
 * @property {boolean} honorable
 */

export class RoomState {
  #profile;

  /**
   * @param {string} id
   * @param {object} raw              rooms/{id}
   * @param {(id:string) => Profile|null} profile  a profile by id (removed ones: null)
   */
  constructor(id, raw, profile){
    const info = raw?.info ?? {};
    this.id = id;
    this.name = info.name ?? "Game";
    this.createdAt = info.createdAt ?? 0;
    this.createdBy = info.createdBy ?? null;
    /** When anything in the room last changed (ms, server clock). */
    this.activeAt = info.activeAt ?? this.createdAt;
    this.mods = new Mods(info.mods);
    this.session = raw?.session?.meta ? raw.session : null;
    this.#profile = profile;
    Object.freeze(this);
  }

  /** Untouched for ROOM_TTL_MS: closed (GameService.pruneRooms deletes it). */
  expired(now){ return now - this.activeAt >= ROOM_TTL_MS; }

  get sessionId(){ return this.session?.meta.id ?? null; }
  get players(){ return this.session?.meta.players ?? 0; }
  /** The board's rules: "ck" (Cities & Knights) or "base". */
  get boardProfile(){ return this.session?.settings?.profile === "base" ? "base" : "ck"; }
  /** Cities & Knights: the knights and cities counters (the base game has neither). */
  get citiesKnights(){ return this.boardProfile === "ck"; }
  /** Points to win here: the mods' custom target, or the board's own (13 / 10). */
  get vpToWin(){ return this.mods.vpTarget(this.boardProfile); }
  /** Knight duels: the Battle mod, on a board with knights. */
  get battleOn(){ return this.mods.battle && this.citiesKnights; }

  /** Every COUNTERS value (0 if never set — older games lack newer counters) plus the robber. */
  get counters(){
    const c = this.session?.counters ?? {};
    return { ...Object.fromEntries(Object.keys(COUNTERS).map(k => [k, c[k] ?? 0])), robber:c.robber ?? 1 };
  }

  /** @returns {Seat[]} */
  get seats(){
    if(!this.session) return [];
    const raw = this.session.seats ?? {};
    return Array.from({ length:this.players }, (_, index) => {
      const key = seatKey(index), s = raw[key] ?? {};
      const profile = s.profileId ? this.#profile(s.profileId) : null;
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

  /** Seats with someone in them. */
  get seated(){ return this.seats.filter(s => s.profileId); }

  seatOf(profileId){ return this.seats.find(s => s.profileId === profileId) ?? null; }

  /** Seated players on the points to win. */
  get winners(){ return this.seated.filter(s => s.vp >= this.vpToWin); }

  /** color id -> name of the profile holding it (excluding `exceptProfileId`). */
  takenColors(exceptProfileId = null){
    const out = new Map();
    for(const s of this.seats) if(s.color && s.profileId !== exceptProfileId) out.set(s.color, s.profile.name);
    return out;
  }

  get openSeats(){ return this.seats.filter(s => !s.profileId).length; }

  /** Anything a new game would lose (seats carry over, so they don't count). */
  get hasProgress(){
    if(!this.session) return false;
    const c = this.counters;
    return this.seats.some(s => s.vp > 0 || !s.honorable)
        || Object.keys(COUNTERS).some(k => c[k] !== 0);
  }

  /* ---------- battles ---------- */

  /** This game's battles, oldest first, each with its id. */
  get battleList(){
    return Object.entries(this.session?.battles ?? {})
      .map(([id, b]) => ({ id, ...b }))
      .sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || a.id.localeCompare(b.id));
  }

  /** The battle a player is in right now (being asked, or fighting), if any. */
  openBattleOf(profileId, now){
    return this.battleList.findLast(b => (b.from === profileId || b.to === profileId) && isOpen(b, now)) ?? null;
  }

  /** A player's spent cards, as a mask (battle.js isSpent). */
  spent(profileId){ return spentCards(this.session?.battles, profileId); }
}
