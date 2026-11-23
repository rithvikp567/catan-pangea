/**
 * The game tracker as the UI sees it: the latest GameState, who "me" is
 * on this device, the sync status, and intent methods that never throw —
 * failures surface as a toast. Screens hold a reference to this and
 * re-render from `onChange`.
 */
import { GameService, GameError } from "../game/GameService.js";
import { cleanLook } from "../game/looks.js";

export class GameController {
  /**
   * @param {object} p
   * @param {import("./Identity.js").Identity} p.identity
   * @param {{ show:(msg:string) => void }} p.toast
   */
  constructor({ identity, toast }){
    Object.assign(this, { identity, toast });
    this.service = null;
    this.state = null;
    this.status = "connecting";
    this.listeners = new Set();
    this.playback = undefined;       /* the shared music (null: none yet; undefined: not loaded) */
    this.playbackListeners = new Set();
    this.clockOffset = 0;            /* server clock − this device's clock */
  }

  /** Attach to a store and start listening. Resolves with the first state. */
  connect(store){
    this.service = new GameService(store, { deviceId:this.identity.deviceId, now:() => this.now() });
    store.onStatus(status => { this.status = status; this.#emit(); });
    store.onClockOffset?.(ms => { this.clockOffset = ms; });
    /* kept open for the app's life, like watch(): music commands are transactions */
    this.service.watchPlayback(pb => {
      this.playback = pb ?? null;
      for(const fn of this.playbackListeners) fn(this.playback);
    });
    return new Promise(resolve => {
      let first = true;
      this.service.watch(state => {
        this.state = state;
        this.#emit();
        if(first){ first = false; resolve(state); }
      });
    });
  }

  get ready(){ return !!this.state; }

  /** The time on the server's clock (ms) — every device's music clock agrees on it. */
  now(){ return Date.now() + this.clockOffset; }

  get deviceId(){ return this.identity.deviceId; }

  /** @param {(state, game:GameController) => void} fn */
  onChange(fn){ this.listeners.add(fn); return () => this.listeners.delete(fn); }
  #emit(){ for(const fn of this.listeners) fn(this.state, this); }

  /* ---------- who am I ---------- */

  /** My profile, if it still exists. */
  get me(){ return this.state?.profile(this.identity.profileId) ?? null; }
  get mySeat(){ return this.me ? this.state.seatOf(this.me.id) : null; }
  get canCreateProfile(){ return !!this.state && this.service.canCreateProfile(this.state); }
  /** The profile this device created, if any. */
  get ownProfile(){ return this.state?.profiles.find(p => p.deviceId === this.identity.deviceId) ?? null; }

  selectProfile(id){ this.identity.profileId = id; this.#emit(); }
  /** Forget the profile on this device (its seat stays: picking it again is straight back in). */
  signOut(){ this.selectProfile(null); }

  /** My saved Player Settings (game/looks.js), or null when nobody's signed in here. */
  get myLook(){ return this.me ? cleanLook(this.me.look) : null; }

  /* ---------- intents ---------- */

  async #run(fn){
    try{ return await fn(); }
    catch(err){
      if(!(err instanceof GameError)) console.error(err);
      this.toast.show(err instanceof GameError ? err.message : "That didn't sync — check your connection.");
      return undefined;
    }
  }

  createProfile(name){
    return this.#run(async () => {
      const id = await this.service.createProfile(name);
      this.selectProfile(id);
      return id;
    });
  }

  join(color){
    const me = this.me;
    if(!me) return Promise.resolve(false);
    return this.#run(async () => { await this.service.join(me.id, color); return true; });
  }

  leave(){ const me = this.me; return me ? this.#run(() => this.service.leave(me.id)) : Promise.resolve(); }

  adjustVP(seatKey, delta){ return this.#run(() => this.service.adjustVP(seatKey, delta)); }
  flipMyCoin(){
    const seat = this.mySeat;
    return seat ? this.#run(() => this.service.flipCoin(seat.key, seat.profileId)) : Promise.resolve();
  }
  adjustCounter(name, delta){ return this.#run(() => this.service.adjustCounter(name, delta)); }
  abstainRobber(){ return this.#run(() => this.service.abstainRobber()); }
  rob(){ return this.#run(() => this.service.rob()); }

  /** @returns {Promise<boolean>} whether the board became the shared game */
  /** @param {{ onlyIfNone?:boolean, buildAt?:number|null }} [p]  buildAt: when the new map starts building in, on every device */
  publishBoard(board, settings, { onlyIfNone = false, buildAt = null } = {}){
    return this.#run(() => this.service.publishBoard(board.toSnapshot(), settings, {
      createdBy:this.me?.id ?? null, onlyIfNone, buildAt,
    })).then(Boolean);
  }

  /* admin */
  removeProfile(id){
    return this.#run(async () => {
      await this.service.removeProfile(id);
      if(this.identity.profileId === id) this.identity.profileId = null;
    });
  }
  adjustWins(profileId, season, delta){ return this.#run(() => this.service.adjustWins(profileId, season, delta)); }

  /**
   * Save Player Settings (game/looks.js) on a profile — mine, or that of
   * whoever made the pick (every device they're signed in on follows).
   * Never throws; a failure toasts, except a removed profile, which the
   * caller handles.
   * @param {object} patch
   * @param {string} [profileId]
   * @returns {Promise<"saved"|"same"|"gone"|"failed">}
   */
  async saveLook(patch, profileId = this.me?.id){
    if(!profileId || !this.service) return "failed";
    try{ return await this.service.setLook(profileId, patch) ? "saved" : "same"; }
    catch(err){
      if(err instanceof GameError && err.code === "no-profile") return "gone";
      if(!(err instanceof GameError)) console.error(err);
      this.toast.show(err instanceof GameError ? err.message : "That didn't sync — check your connection.");
      return "failed";
    }
  }

  /* music: one playlist for the table, any player may change it */
  /** @returns {Promise<string|undefined>} the playlist id, or undefined if the link was rejected */
  setPlaylist(link){ return this.#run(() => this.service.setPlaylist(link, this.me?.id ?? null)); }

  /**
   * Read the table's playlist again (new videos join the queue). With
   * `ifSetAt` it's the quiet nightly re-read: only if nobody did it since,
   * and never a toast.
   * @returns {Promise<boolean>} whether this device asked for it
   */
  refreshPlaylist({ ifSetAt = null } = {}){
    if(!this.service) return Promise.resolve(false);
    if(ifSetAt != null) return this.service.refreshPlaylist(ifSetAt).catch(() => false);
    return this.#run(() => this.service.refreshPlaylist()).then(Boolean);
  }

  /** @param {(playback:object|null) => void} fn  the shared music, now (once loaded) and on every change */
  onPlayback(fn){
    this.playbackListeners.add(fn);
    if(this.playback !== undefined) fn(this.playback);
    return () => this.playbackListeners.delete(fn);
  }

  /**
   * A music command (music/playback.js) — play, pause, skip, seek… from any
   * device; the device playing the sound follows. Failures toast.
   * @param {{ kind?:string }} [who]  this device's kind ("phone", "tablet", "computer")
   * @returns {Promise<boolean>} whether it changed anything
   */
  controlMusic(command, arg, { kind = null } = {}){
    if(!this.service) return Promise.resolve(false);
    return this.#run(() => this.service.controlMusic(command, arg, { name:this.me?.name ?? null, kind })).then(Boolean);
  }

  /** The speaker's "still here" — in the background, never a toast. */
  musicBeat(){ this.service?.musicBeat().catch(() => {}); }
}
