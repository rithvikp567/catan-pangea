/**
 * The game tracker as the UI sees it: the latest GameState, who "me" is
 * on this device, the sync status, and intent methods that never throw —
 * failures surface as a toast. Screens hold a reference to this and
 * re-render from `onChange`.
 */
import { GameService, GameError } from "../game/GameService.js";

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
  }

  /** Attach to a store and start listening. Resolves with the first state. */
  connect(store){
    this.service = new GameService(store, { deviceId:this.identity.deviceId });
    store.onStatus(status => { this.status = status; this.#emit(); });
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
  cycleRobber(){ return this.#run(() => this.service.cycleRobber()); }
  collectRobber(){ return this.#run(() => this.service.collectRobber()); }

  /** @returns {Promise<boolean>} whether the board became the shared game */
  publishBoard(board, settings, { onlyIfNone = false } = {}){
    return this.#run(() => this.service.publishBoard(board.toSnapshot(), settings, {
      createdBy:this.me?.id ?? null, onlyIfNone,
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

  /* music: one playlist for the table, any player may change it */
  /** @returns {Promise<string|undefined>} the playlist id, or undefined if the link was rejected */
  setPlaylist(link){ return this.#run(() => this.service.setPlaylist(link, this.me?.id ?? null)); }
}
