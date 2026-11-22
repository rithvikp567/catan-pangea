/**
 * Whose Player Settings (game/looks.js: the theme and accent color, custom
 * colors, the map's build animation, sound effects) apply on this device,
 * and where a pick is saved.
 *
 *  - Signed in: the person's own, saved on their profile — they follow them
 *    to every device they sign in on (a pick on the phone shows on the
 *    laptop a moment later). What they never picked shows the default, so
 *    all their devices look the same.
 *  - Signed out (or the profile was removed): this device's own, kept on
 *    the device only. Signing out brings them back, so a shared laptop or
 *    TV never keeps someone else's.
 *
 * A pick belongs to whoever was signed in when it was made. It shows at
 * once and is saved on their profile when a run of picks settles — or
 * straight away if they sign out (or someone else signs in) first, or the
 * page is hidden (`flush`, from App).
 *
 * It only decides; `apply(look)` (App: ui/ThemeController, Sound, the
 * build animation) applies them. The settings it showed last are kept on
 * the device as `lastLook` (index.html's head script paints from them
 * before the first frame — so nobody sees the default flash while their
 * own arrives with the game data). Until that data has loaded, it keeps
 * showing what's there. DOM-free (tests/look.test.js).
 */
import { cleanLook, resolveLook, sameLook } from "../game/looks.js";

/** A device's own settings, each under its own key in its storage (`theme`, `accent`… as before 2.13). */
const DEVICE_KEYS = ["theme", "accent", "customTheme", "customAccent", "recent", "animations", "sounds"];

/** A run of picks (arrow keys through the themes) is saved once, when it settles. */
const SAVE_AFTER_MS = 400;

export class LookSync {
  /**
   * @param {object} p
   * @param {import("./GameController.js").GameController} p.game
   * @param {import("./storage.js").SafeStorage} p.storage   this device's storage — Identity's
   *   (so each ?device= tab on localhost is a phone of its own)
   * @param {(look:object) => void} p.apply   the settings to apply (a whole look, game/looks.js)
   */
  constructor({ game, storage, apply }){
    Object.assign(this, { game, storage, apply });
    this.listeners = new Set();
    /** @type {{ id:string, look:object }|null}  a pick not saved yet (some fields of a look), and whose it is */
    this.pending = null;
    this.saving = null;        /* the pending pick being saved right now */
    this.timer = null;
    this.look = null;
    this.owner = undefined;
    this.#show(resolveLook(null, storage.get("lastLook") ?? this.device));
    game.onChange(() => this.#changed());
  }

  /** The settings applying now (a whole look). */
  get current(){ return this.look; }

  /** This device's own settings (the ones that apply while nobody's signed in). */
  get device(){ return Object.fromEntries(DEVICE_KEYS.map(k => [k, this.storage.get(k)])); }

  /**
   * @param {(look:object, owner:string|null) => void} fn
   *   now, and whenever the look or whose it is changes (owner: the signed-in
   *   person's name — their picks are saved for them — or null: this device's)
   */
  onChange(fn){
    this.listeners.add(fn);
    fn(this.look, this.owner ?? null);
  }

  /**
   * A pick (Player Settings, or the top bar's light / dark switch): it
   * shows at once, and is saved on the profile of whoever's signed in here
   * (once a run of picks settles), on this device when nobody is.
   * @param {object} patch  some fields of a look (game/looks.js)
   */
  pick(patch){
    const clean = cleanLook(patch);
    if(!Object.keys(clean).length) return;
    const id = this.#signedIn;
    if(id){
      if(this.pending && this.pending.id !== id) this.flush();   /* (the last person's pick: saved for them first) */
      /* on top of my own pick still waiting — never someone else's (theirs may still be on its way) */
      const mine = this.pending?.id === id ? this.pending.look : null;
      this.pending = { id, look:{ ...mine, ...clean } };
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.#save(), SAVE_AFTER_MS);
    }else{
      for(const [key, value] of Object.entries(clean)) this.storage.set(key, value);
    }
    if(this.game.ready) this.#sync();
    else this.#show(resolveLook({ ...this.look, ...clean }, null));   /* (still loading: on top of what shows) */
  }

  /** Save a pick that's waiting, now — the page is being hidden or closed. */
  flush(){
    if(!this.pending) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.#save();
  }

  /** Who's signed in here: their profile id (it may still be loading), or null. */
  get #signedIn(){ return (this.game.ready ? this.game.me?.id : this.game.identity?.profileId) ?? null; }

  #changed(){
    /* signed out, or someone else signed in, with a pick of the last person's waiting: theirs, saved now */
    if(this.pending && this.game.ready && this.game.me?.id !== this.pending.id) this.flush();
    this.#sync();
  }

  async #save(){
    this.timer = null;
    const pending = this.pending;
    if(!pending || this.saving === pending) return;
    if(!this.game.ready){ this.timer = setTimeout(() => this.#save(), SAVE_AFTER_MS); return; }
    this.saving = pending;
    /* never throws: a failure toasts, and the saved look shows again */
    const result = await this.game.saveLook(pending.look, pending.id);
    if(this.saving === pending) this.saving = null;     /* (a newer save may have started meanwhile) */
    if(this.pending === pending) this.pending = null;   /* (a newer pick waits for its own save) */
    /* their profile was removed meanwhile: the pick stays on this device, where it was made —
       unless someone else is signed in here by now */
    if(result === "gone" && !this.game.me){
      for(const [key, value] of Object.entries(pending.look)) this.storage.set(key, value);
    }
    this.#sync();
  }

  #sync(){
    if(!this.game.ready) return;                         /* until the game data arrives, keep what's showing */
    const me = this.game.me;
    if(!me){ this.#show(resolveLook(null, this.device), null); return; }
    const mine = this.pending?.id === me.id ? this.pending.look : null;   /* my pick, not saved yet */
    this.#show(resolveLook({ ...this.game.myLook, ...mine }, null), me.name);
  }

  #show(look, owner = this.owner ?? null){
    const changed = !sameLook(look, this.look);
    if(!changed && owner === this.owner) return;
    this.owner = owner;
    if(changed){
      this.look = { ...look, recent:[...look.recent] };
      this.storage.set("lastLook", this.look);
      this.apply(this.look);
    }
    for(const fn of this.listeners) fn(this.look, owner);
  }
}
