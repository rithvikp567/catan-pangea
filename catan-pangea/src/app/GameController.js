/**
 * The game tracker as the UI sees it: the latest GameState, who "me" is
 * on this device and which room it's in, the sync status, and intent
 * methods that never throw — failures surface as a toast. Screens hold a
 * reference to this and re-render from `onChange`.
 *
 * A device is in one room at a time (the one it opened last, remembered
 * like the profile); the tracker's intents act on that room.
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
        if(first){ first = false; resolve(state); this.pruneRooms(); }    /* (and App, every so often) */
      });
    });
  }

  /** Close the rooms nobody has touched for hours — in the background, never a toast. */
  pruneRooms(){ this.service?.pruneRooms().catch(() => {}); }

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
  /** The room this device is in (RoomState), while it's open. */
  get room(){ return this.state?.room(this.identity.roomId, this.now()) ?? null; }
  get roomId(){ return this.room?.id ?? null; }
  /** My seat in this device's room. */
  get mySeat(){ return this.me && this.room ? this.room.seatOf(this.me.id) : null; }
  get canCreateProfile(){ return !!this.state && this.service.canCreateProfile(this.state); }
  /** The profile this device created, if any. */
  get ownProfile(){ return this.state?.profiles.find(p => p.deviceId === this.identity.deviceId) ?? null; }

  selectProfile(id){ this.identity.profileId = id; this.#emit(); }
  /** Go into a room (or out of every room: null). */
  enterRoom(id){ this.identity.roomId = id; this.#emit(); }
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

  /* ---------- rooms ---------- */

  /**
   * Open a room with these mods and the map on this screen as its first
   * game, and go into it.
   * @param {{ name:string, mods:object }} p
   * @param {import("../engine/Board.js").Board} board
   * @param {object} settings   Settings#toJSON() the board was made with
   * @returns {Promise<string|undefined>} the room's id (undefined: it failed, and said so)
   */
  createRoom({ name, mods }, board, settings){
    return this.#run(async () => {
      const id = await this.service.createRoom({ name, mods, board:board.toSnapshot(), settings, createdBy:this.me?.id ?? null });
      this.enterRoom(id);
      return id;
    });
  }

  /** Close a room for everyone. */
  deleteRoom(id){
    if(this.identity.roomId === id) this.enterRoom(null);     /* (first: leaving it isn't "it closed") */
    return this.#run(() => this.service.deleteRoom(id));
  }

  /** What's played in this device's room (null outside one). */
  #inRoom(fn){
    const id = this.roomId;
    return id ? this.#run(() => fn(this.service.room(id))) : Promise.resolve(undefined);
  }

  /** Take a seat in this device's room (or change color). */
  join(color){
    const me = this.me;
    if(!me) return Promise.resolve(false);
    return this.#inRoom(async room => { await room.join(me.id, color); return true; }).then(Boolean);
  }

  leave(){ const me = this.me; return me ? this.#inRoom(room => room.leave(me.id)) : Promise.resolve(); }

  adjustVP(seatKey, delta){ return this.#inRoom(room => room.adjustVP(seatKey, delta)); }
  flipMyCoin(){
    const seat = this.mySeat;
    return seat ? this.#inRoom(room => room.flipCoin(seat.key, seat.profileId)) : Promise.resolve();
  }
  adjustCounter(name, delta){ return this.#inRoom(room => room.adjustCounter(name, delta)); }
  abstainRobber(){ return this.#inRoom(room => room.abstainRobber()); }
  rob(){ return this.#inRoom(room => room.rob()); }

  /**
   * A new map: the next game in this device's room, for everyone in it.
   * @param {{ buildAt?:number|null }} [p]  when the new map starts building in, on every device
   * @returns {Promise<boolean>} whether the board became the room's game
   */
  publishBoard(board, settings, { buildAt = null } = {}){
    return this.#inRoom(room => room.publishBoard(board.toSnapshot(), settings, { createdBy:this.me?.id ?? null, buildAt })).then(Boolean);
  }

  /* ---------- knight duels ---------- */

  /** Challenge another player in this room. @returns {Promise<string|undefined>} the battle's id */
  challenge(profileId){
    const me = this.me;
    return me ? this.#inRoom(room => room.challenge(me.id, profileId)) : Promise.resolve(undefined);
  }

  /**
   * Answer, pick or cancel in a battle (game/battle.js), as me.
   * @param {"answer"|"pick"|"cancel"} command
   * @returns {Promise<boolean>}
   */
  battle(id, command, arg = {}){
    const me = this.me;
    return me ? this.#inRoom(room => room.battle(id, command, { ...arg, by:me.id })).then(Boolean) : Promise.resolve(false);
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
