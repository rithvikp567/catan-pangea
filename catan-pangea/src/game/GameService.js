/**
 * All game-tracker operations, applied to a store (see sync/MemoryStore
 * for the contract). Every change to shared numbers is a transaction, so
 * two phones tapping at once never lose an update or break a limit.
 *
 * Data layout (under `root`, default "v1"):
 *   profiles/{profileId}  { name, createdAt, deviceId }
 *   session               { meta, board, settings, seats/{s0…}, counters }  — the one active game
 *   wins/{season}/{entryId} { profileId, delta, source, sessionId?, at }  — the wins ledger
 *   music                 { listId, setAt, setBy }  — the table's YouTube playlist
 *
 * Transactions abort (return undefined) when their node is missing. The
 * RTDB may call a transaction with null when nothing is cached, so the app
 * keeps a watch() open for its whole lifetime — transactions then always
 * start from cached data and Firebase retries them against the server.
 */
import { GameState } from "./GameState.js";
import { parsePlaylist } from "../music/playlist.js";
import {
  MAX_VP, COUNTERS, clampVP, stepWithin, nextRobber, collectRobber, newSession, carrySeats, validateName,
} from "./rules.js";

export class GameError extends Error {
  constructor(code, message){ super(message); this.name = "GameError"; this.code = code; }
}

/** The synced branches under root that make up a GameState. */
const BRANCHES = ["profiles", "session", "wins", "music"];

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
    const [profiles, session, wins, music] = await Promise.all(BRANCHES.map(b => this.store.get(this.#p(b))));
    return new GameState({ profiles, session, wins, music });
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

  /** Admin: delete a profile, free its seat and drop its wins. */
  async removeProfile(profileId){
    const state = await this.state();
    const patch = { [`profiles/${profileId}`]: null };
    const seat = state.session && Object.entries(state.session.seats ?? {}).find(([, s]) => s.profileId === profileId);
    if(seat){ patch[`session/seats/${seat[0]}/profileId`] = null; patch[`session/seats/${seat[0]}/color`] = null; }
    for(const [season, entries] of Object.entries(state.wins)){
      for(const [eid, e] of Object.entries(entries)) if(e.profileId === profileId) patch[`wins/${season}/${eid}`] = null;
    }
    await this.store.update(this.root, patch);
  }

  /* ---------------- session ---------------- */

  /**
   * Make a board the active game for everyone. With onlyIfNone, it only
   * takes effect when no game exists yet (the first player online sets the
   * seed); otherwise it replaces the current game, and everyone seated
   * keeps their seat and color (scores and counters start over).
   * @returns {Promise<boolean>} whether this board became the session
   */
  async publishBoard(snapshot, settings, { createdBy = null, onlyIfNone = false } = {}){
    const session = newSession({ id:randomId("s_", this.random), board:snapshot, settings, createdAt:this.now(), createdBy });
    const profiles = onlyIfNone ? {} : (await this.store.get(this.#p("profiles"))) ?? {};
    const res = await this.store.transact(this.#p("session"), cur => {
      if(onlyIfNone) return cur?.meta ? undefined : session;
      return carrySeats(session, cur?.seats, id => id in profiles);
    });
    return res.committed;
  }

  /** Take a seat (or change color if already seated). */
  async join(profileId, color){
    let outcome = null;
    const res = await this.store.transact(this.#p("session", "seats"), seats => {
      if(!seats){ outcome = "no-session"; return undefined; }
      const entries = Object.entries(seats);
      if(entries.some(([, s]) => s.color === color && s.profileId && s.profileId !== profileId)){ outcome = "color-taken"; return undefined; }
      const mine = entries.find(([, s]) => s.profileId === profileId)
                ?? entries.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric:true })).find(([, s]) => !s.profileId);
      if(!mine){ outcome = "full"; return undefined; }
      outcome = "ok";
      return { ...seats, [mine[0]]: { ...mine[1], profileId, color } };
    });
    if(!res.committed){
      const msg = { "no-session":"No game yet — generate a map first.", "color-taken":"Someone just took that color.", full:"Every seat is taken." };
      throw new GameError(outcome ?? "failed", msg[outcome] ?? "Couldn't join the game.");
    }
  }

  async leave(profileId){
    await this.store.transact(this.#p("session", "seats"), seats => {
      if(!seats) return undefined;
      const mine = Object.entries(seats).find(([, s]) => s.profileId === profileId);
      if(!mine) return undefined;
      const { profileId:_p, color:_c, ...rest } = mine[1];
      return { ...seats, [mine[0]]: rest };
    });
  }

  /* ---------------- trackers ---------------- */

  /**
   * Change a seat's VP. Reaching MAX_VP records a win for the seated
   * profile in this game's season; dropping back below removes it — so a
   * corrected score corrects the season tally too.
   */
  async adjustVP(key, delta){
    const meta = await this.store.get(this.#p("session", "meta"));
    if(!meta) return;
    let before = 0, profileId = null;
    const res = await this.store.transact(this.#p("session", "seats", key), seat => {
      if(!seat) return undefined;
      before = seat.vp ?? 0; profileId = seat.profileId ?? null;
      const vp = clampVP(before + delta);
      return vp === before ? undefined : { ...seat, vp };
    });
    if(!res.committed || !profileId) return;
    const after = res.value.vp, winPath = this.#p("wins", meta.season, `${meta.id}_${profileId}`);
    if(before < MAX_VP && after >= MAX_VP){
      await this.store.set(winPath, { profileId, delta:1, source:"game", sessionId:meta.id, at:this.now() });
    }else if(before >= MAX_VP && after < MAX_VP){
      await this.store.remove(winPath);
    }
  }

  /** Flip your own honor coin. Other players' coins are read-only. */
  async flipCoin(key, profileId){
    const res = await this.store.transact(this.#p("session", "seats", key), seat => {
      if(!seat || seat.profileId !== profileId) return undefined;
      return { ...seat, honorable: seat.honorable === false };
    });
    if(!res.committed) throw new GameError("not-your-coin", "You can only flip your own coin.");
  }

  /** Any COUNTERS entry (knights per island, cities, karma) by ±n, within its bounds. */
  async adjustCounter(name, delta){
    const rule = COUNTERS[name];
    if(!rule) throw new GameError("bad-counter", `Unknown counter ${name}`);
    const players = await this.store.get(this.#p("session", "meta", "players"));
    if(!players) return;
    await this.store.transact(this.#p("session", "counters"), c => {
      if(!c) return undefined;
      const next = stepWithin(c[name] ?? 0, delta, rule.min(players), rule.max(players));
      return next === (c[name] ?? 0) ? undefined : { ...c, [name]: next };
    });
  }

  async cycleRobber(){
    await this.store.transact(this.#p("session", "counters"), c => c ? { ...c, robber:nextRobber(c.robber ?? 1) } : undefined);
  }

  /** Collect: karma goes down by the robber's current value. */
  async collectRobber(){
    await this.store.transact(this.#p("session", "counters"), c => c ? { ...c, karma:collectRobber(c.karma ?? 0, c.robber ?? 1) } : undefined);
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
}
