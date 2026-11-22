/**
 * All game-tracker operations, applied to a store (see sync/MemoryStore
 * for the contract). Every change to shared numbers is a transaction, so
 * two phones tapping at once never lose an update or break a limit.
 *
 * Data layout (under `root`, default "v1"):
 *   profiles/{profileId}  { name, createdAt, deviceId, look? }  — look: { theme?, accent?, at } (game/looks.js),
 *                           the person's theme and accent, on every device they sign in on
 *   session               { meta, board, settings, seats/{s0…}, counters }  — the one active game
 *   wins/{season}/{entryId} { profileId, delta, source, sessionId?, at, scores? }  — the wins ledger
 *                           (scores: { profileId: { vp, color } } — everyone's points when a game was won)
 *   music                 { listId, setAt, setBy }  — the table's YouTube playlist
 *   playback              { queue, now, beat }  — the table's music as one shared playback: the song,
 *                           the order, playing or paused, the time, and which device plays the sound
 *                           (see music/playback.js; watched on its own, not part of GameState — it
 *                           changes with every tap on the music and every few seconds while it plays)
 *
 * Transactions abort (return undefined) when their node is missing. The
 * RTDB may call a transaction with null when nothing is cached, so the app
 * keeps a watch() open for its whole lifetime — transactions then always
 * start from cached data and Firebase retries them against the server.
 */
import { GameState } from "./GameState.js";
import { parsePlaylist } from "../music/playlist.js";
import { COMMANDS as PLAYBACK } from "../music/playback.js";
import { cleanLook } from "./looks.js";
import {
  MAX_VP, COUNTERS, clampVP, stepCounter, abstainKarma, robKarma, newSession, carrySeats, validateName,
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
    const patch = { [`profiles/${profileId}`]: null, [`listening/${profileId}`]: null };   /* (listening: per-profile music spots, before 2.7.0) */
    const seat = state.session && Object.entries(state.session.seats ?? {}).find(([, s]) => s.profileId === profileId);
    if(seat){ patch[`session/seats/${seat[0]}/profileId`] = null; patch[`session/seats/${seat[0]}/color`] = null; }
    for(const [season, entries] of Object.entries(state.wins)){
      for(const [eid, e] of Object.entries(entries)) if(e.profileId === profileId) patch[`wins/${season}/${eid}`] = null;
    }
    await this.store.update(this.root, patch);
  }

  /**
   * Save a person's look — theme and / or accent (game/looks.js) — on their
   * profile, so it follows them to every device they sign in on. One
   * transaction on the profile: it merges with what's there (a theme from
   * the phone and an accent from the laptop at the same moment both stick;
   * for the same field the last write wins), leaves the name and deviceId
   * alone, and never brings back a profile that was removed.
   * @param {string} profileId
   * @param {{ theme?:string, accent?:string }} patch
   * @returns {Promise<boolean>} whether it changed anything
   */
  async setLook(profileId, patch){
    const clean = cleanLook(patch);
    if(!Object.keys(clean).length) throw new GameError("bad-look", "That theme isn't available.");
    let outcome = null;
    const res = await this.store.transact(this.#p("profiles", profileId), p => {
      if(!p?.name){ outcome = "no-profile"; return undefined; }
      if(Object.entries(clean).every(([k, v]) => p.look?.[k] === v)){ outcome = "same"; return undefined; }
      outcome = "ok";
      return { ...p, look:{ ...p.look, ...clean, at:this.now() } };
    });
    if(!res.committed && outcome === "no-profile") throw new GameError("no-profile", "That profile was removed.");
    return res.committed;
  }

  /* ---------------- session ---------------- */

  /**
   * Make a board the active game for everyone. With onlyIfNone, it only
   * takes effect when no game exists yet (the first player online sets the
   * seed); otherwise it replaces the current game, and everyone seated
   * keeps their seat and color (scores and counters start over).
   * @returns {Promise<boolean>} whether this board became the session
   */
  async publishBoard(snapshot, settings, { createdBy = null, onlyIfNone = false, buildAt = null } = {}){
    const session = newSession({ id:randomId("s_", this.random), board:snapshot, settings, createdAt:this.now(), createdBy, buildAt });
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
      /* everyone's points at the moment of the win (the calendar on the season wins screen shows them) */
      const seats = (await this.store.get(this.#p("session", "seats"))) ?? {};
      const scores = {};
      for(const s of Object.values(seats)) if(s?.profileId) scores[s.profileId] = { vp:s.vp ?? 0, ...(s.color ? { color:s.color } : {}) };
      scores[profileId] = { ...scores[profileId], vp:after };
      await this.store.set(winPath, { profileId, delta:1, source:"game", sessionId:meta.id, at:this.now(), scores });
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

  /** Any COUNTERS entry (knights per island, cities, karma, walker) by ±n, within its bounds (the walker wraps). */
  async adjustCounter(name, delta){
    const rule = COUNTERS[name];
    if(!rule) throw new GameError("bad-counter", `Unknown counter ${name}`);
    const players = await this.store.get(this.#p("session", "meta", "players"));
    if(!players) return;
    await this.store.transact(this.#p("session", "counters"), c => {
      if(!c) return undefined;
      const next = stepCounter(rule, c[name] ?? 0, delta, players);
      return next === (c[name] ?? 0) ? undefined : { ...c, [name]: next };
    });
  }

  /** Abstain: karma +1, and the robber is worth one more (up to 3). */
  async abstainRobber(){
    await this.store.transact(this.#p("session", "counters"), c => c ? { ...c, ...abstainKarma(c.karma ?? 0, c.robber ?? 1) } : undefined);
  }

  /** Rob: karma goes down by the robber's value, and the robber starts over at 1. */
  async rob(){
    await this.store.transact(this.#p("session", "counters"), c => c ? { ...c, ...robKarma(c.karma ?? 0, c.robber ?? 1) } : undefined);
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
