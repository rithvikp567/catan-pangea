/**
 * The game tracker's operations on the store (see sync/MemoryStore for
 * the contract): profiles, rooms, the wins ledger and the music. What's
 * played inside a room — its game, seats, counters and battles — is a
 * RoomService (`room(id)`). Every change to shared numbers is a
 * transaction, so two phones tapping at once never lose an update or
 * break a limit.
 *
 * Data layout (under `root`, default "v1"):
 *   profiles/{profileId}  { name, createdAt, deviceId, look? }  — look: the Player Settings (game/looks.js) + at,
 *                           (theme, accent, custom colors, animations, sounds), on every device they sign in on
 *   rooms/{roomId}        { info:{ name, createdAt, createdBy?, activeAt, mods }, session:{ meta, board, settings,
 *                           seats/{s0…}, counters, battles? } }  — the day's games (RoomService); a room nobody
 *                           has touched for ROOM_TTL_MS is closed
 *   wins/{season}/{entryId} { profileId, delta, source, sessionId?, at, scores? }  — the wins ledger
 *                           (scores: { profileId: { vp, color } } — everyone's points when a game was won)
 *   music                 { listId, setAt, setBy }  — the table's YouTube playlist (one for every room)
 *   playback              { queue, now, beat }  — the table's music as one shared playback: the song,
 *                           the order, playing or paused, the time, and which device plays the sound
 *                           (see music/playback.js; watched on its own, not part of GameState — it
 *                           changes with every tap on the music and every few seconds while it plays)
 *   session               (before 3.0.0: the one game everyone shared; no longer read)
 *
 * Transactions abort (return undefined) when their node is missing. The
 * RTDB may call a transaction with null when nothing is cached, so the app
 * keeps a watch() open for its whole lifetime — transactions then always
 * start from cached data and Firebase retries them against the server.
 */
import { GameState } from "./GameState.js";
import { GameError } from "./GameError.js";
import { RoomService } from "./RoomService.js";
import { Mods } from "./mods.js";
import { parsePlaylist } from "../music/playlist.js";
import { COMMANDS as PLAYBACK } from "../music/playback.js";
import { cleanLook } from "./looks.js";
import { newSession, validateName, ROOM_NAME_MAX, ROOM_TTL_MS } from "./rules.js";

export { GameError };

/** The synced branches under root that make up a GameState. */
const BRANCHES = ["profiles", "rooms", "wins", "music"];

const randomId = (prefix, random) => prefix + Date.now().toString(36) + Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0");

export class GameService {
  /**
   * @param {object} store
   * @param {object} p
   * @param {string} p.deviceId     stable id of this browser
   * @param {() => number} [p.now]
   * @param {() => number} [p.random]
   * @param {string} [p.root]
   */
  constructor(store, { deviceId, now = Date.now, random = Math.random, root = "v1" }){
    Object.assign(this, { store, deviceId, now, random, root });
  }

  #p(...parts){ return [this.root, ...parts].join("/"); }
  #newId(prefix){ return randomId(prefix, this.random); }

  /**
   * Live GameState on every change, once every branch has loaded.
   * @param {(state:GameState) => void} cb
   * @returns {() => void} unsubscribe
   */
  watch(cb){
    const raw = {}, loaded = new Set(), branches = BRANCHES;
    const unsubs = branches.map(b => this.store.subscribe(this.#p(b), value => {
      raw[b] = value; loaded.add(b);
      if(loaded.size === branches.length) cb(new GameState(raw));
    }));
    return () => unsubs.forEach(u => u());
  }

  async state(){
    const [profiles, rooms, wins, music] = await Promise.all(BRANCHES.map(b => this.store.get(this.#p(b))));
    return new GameState({ profiles, rooms, wins, music });
  }

  /* ---------------- profiles ---------------- */

  /** This device may create one profile (until an admin removes it). */
  canCreateProfile(state){ return !state.profiles.some(p => p.deviceId === this.deviceId); }

  async createProfile(rawName){
    const state = await this.state();
    if(!this.canCreateProfile(state)) throw new GameError("device-has-profile", "This device already has a profile.");
    const { name, error } = validateName(rawName, state.profiles.map(p => p.name));
    if(error) throw new GameError("bad-name", error);
    const id = randomId("p_", this.random);
    await this.store.set(this.#p("profiles", id), { name, createdAt:this.now(), deviceId:this.deviceId });
    return id;
  }

  /** Admin: delete a profile, free its seat in every room and drop its wins. */
  async removeProfile(profileId){
    const state = await this.state();
    const patch = { [`profiles/${profileId}`]: null, [`listening/${profileId}`]: null };   /* (listening: per-profile music spots, before 2.7.0) */
    for(const room of state.roomMap.values()){
      const seat = room.session && Object.entries(room.session.seats ?? {}).find(([, s]) => s.profileId === profileId);
      if(seat){ for(const k of ["profileId", "color"]) patch[`rooms/${room.id}/session/seats/${seat[0]}/${k}`] = null; }
    }
    for(const [season, entries] of Object.entries(state.wins)){
      for(const [eid, e] of Object.entries(entries)) if(e.profileId === profileId) patch[`wins/${season}/${eid}`] = null;
    }
    await this.store.update(this.root, patch);
  }

  /**
   * Save a person's Player Settings — theme, accent, custom colors, the
   * build animation, sound effects (game/looks.js) — on their profile, so
   * they follow them to every device they sign in on. One
   * transaction on the profile: it merges with what's there (a theme from
   * the phone and an accent from the laptop at the same moment both stick;
   * for the same field the last write wins), leaves the name and deviceId
   * alone, and never brings back a profile that was removed.
   * @param {string} profileId
   * @param {object} patch  any of the fields of a look (game/looks.js)
   * @returns {Promise<boolean>} whether it changed anything
   */
  async setLook(profileId, patch){
    const clean = cleanLook(patch);
    if(!Object.keys(clean).length) throw new GameError("bad-look", "That setting isn't available.");
    let outcome = null;
    const res = await this.store.transact(this.#p("profiles", profileId), p => {
      if(!p?.name){ outcome = "no-profile"; return undefined; }
      const was = cleanLook(p.look);
      if(Object.entries(clean).every(([k, v]) => JSON.stringify(was[k]) === JSON.stringify(v))){ outcome = "same"; return undefined; }
      outcome = "ok";
      return { ...p, look:{ ...p.look, ...clean, at:this.now() } };
    });
    if(!res.committed && outcome === "no-profile") throw new GameError("no-profile", "That profile was removed.");
    return res.committed;
  }

  /* ---------------- rooms ---------------- */

  /** What's played inside a room: its game, seats, counters, battles. */
  room(roomId){
    return new RoomService(this.store, { root:this.root, roomId, deviceId:this.deviceId, now:this.now, newId:p => this.#newId(p) });
  }

  /**
   * Open a room: its name and mods, and a first game on the board given
   * (the map on the creator's screen).
   * @param {object} p
   * @param {string} p.name
   * @param {object} p.mods         Mods (or its JSON)
   * @param {object} p.board        BoardSnapshot
   * @param {object} p.settings     Settings#toJSON() the board was made with
   * @param {string|null} [p.createdBy]  profile id
   * @returns {Promise<string>} the room's id
   */
  async createRoom({ name, mods, board, settings, createdBy = null }){
    const state = await this.state();
    const taken = state.rooms(this.now()).map(r => r.name);
    const res = validateName(name, taken, ROOM_NAME_MAX);
    if(res.error) throw new GameError("bad-room-name", res.error === "That name is taken." ? "A game today already has that name." : res.error);
    const id = this.#newId("r_"), t = this.now();
    const session = newSession({ id:this.#newId("s_"), board, settings, createdAt:t, createdBy });
    await this.store.set(this.#p("rooms", id), {
      info:{ name:res.name, createdAt:t, activeAt:t, ...(createdBy ? { createdBy } : {}), mods:new Mods(mods).toJSON() },
      session,
    });
    return id;
  }

  /** Close a room for everyone (anyone may — a trusted table). */
  async deleteRoom(roomId){ await this.store.remove(this.#p("rooms", roomId)); }

  /**
   * Delete the rooms nobody has touched for ROOM_TTL_MS. Each is checked
   * again inside a transaction, so a room that came back to life a moment
   * ago is kept.
   * @returns {Promise<number>} how many were closed
   */
  async pruneRooms(){
    const t = this.now(), rooms = (await this.store.get(this.#p("rooms"))) ?? {};
    let closed = 0;
    for(const id of Object.keys(rooms)){
      const res = await this.store.transact(this.#p("rooms", id), r => {
        if(!r) return undefined;
        const active = r.info?.activeAt ?? r.info?.createdAt ?? 0;
        return t - active >= ROOM_TTL_MS ? null : undefined;
      });
      if(res.committed) closed++;
    }
    return closed;
  }

  /* ---------------- wins (admin) ---------------- */

  /** Admin: add or remove one win for a profile in a season (never below zero). */
  async adjustWins(profileId, season, delta){
    if(delta < 0){
      const state = await this.state();
      const total = state.winsFor(season).find(r => r.profile.id === profileId)?.wins ?? 0;
      if(total <= 0) return;
    }
    await this.store.set(this.#p("wins", season, randomId("adj_", this.random)),
      { profileId, delta: delta < 0 ? -1 : 1, source:"admin", at:this.now() });
  }

  /* ---------------- music ---------------- */

  /**
   * Set the table's playlist (shared by every phone) from a pasted link.
   * @returns {Promise<string>} the playlist id
   */
  async setPlaylist(raw, profileId = null){
    const res = parsePlaylist(raw);
    if(res.error) throw new GameError("bad-playlist", res.error);
    await this.store.set(this.#p("music"), { listId:res.listId, setAt:this.now(), setBy:profileId ?? null });
    return res.listId;
  }

  /**
   * The shared playback, now and on every change (null until a playlist's songs are read).
   * @returns {() => void} unsubscribe
   */
  watchPlayback(cb){ return this.store.subscribe(this.#p("playback"), cb); }

  /**
   * Run a playback command (music/playback.js COMMANDS) as a transaction.
   * @param {string} command  load | play | pause | skip | ended | seek | shuffle | takeOver | sync
   * @param {{ name?:string|null, kind?:string|null }} [who]  shown as "On Sam's phone" while this device plays the sound
   * @returns {Promise<boolean>} whether it changed anything
   */
  async controlMusic(command, arg, who = {}){
    const fn = PLAYBACK[command];
    if(!fn) throw new GameError("bad-command", `Unknown music command: ${command}`);
    const ctx = { t:this.now(), deviceId:this.deviceId, name:who.name ?? null, kind:who.kind ?? null, random:this.random };
    const res = await this.store.transact(this.#p("playback"), cur => fn(cur, arg, ctx));
    return res.committed;
  }

  /** The speaker's "still here" (see BEAT_MS). */
  async musicBeat(){ await this.store.set(this.#p("playback", "beat"), this.now()); }
}
