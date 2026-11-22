/**
 * Whose look (theme + accent color, game/looks.js) shows on this device,
 * and where a pick is saved.
 *
 *  - Signed in: the person's own, saved on their profile — it follows them
 *    to every device they sign in on (a pick on the phone shows on the
 *    laptop a moment later). A field they never picked falls back to this
 *    device's own, then the default.
 *  - Signed out (or the profile was removed): this device's own look, kept
 *    on the device only. Signing out brings it back, so a shared laptop or
 *    TV never keeps someone else's look.
 *
 * It only decides; `apply(look)` (ui/ThemeController) paints. The look it
 * showed last is kept on the device as `lastLook`, which index.html's head
 * script paints before the first frame — so nobody sees the default flash
 * while their own arrives with the game data. Until that data has loaded,
 * it keeps showing what's there. DOM-free (tests/look.test.js).
 */
import { cleanLook, resolveLook, sameLook } from "../game/looks.js";

/** A run of picks (arrow keys through the themes) is saved once, when it settles. */
const SAVE_AFTER_MS = 400;

export class LookSync {
  /**
   * @param {object} p
   * @param {import("./GameController.js").GameController} p.game
   * @param {import("./storage.js").SafeStorage} p.storage   this device's storage — Identity's
   *   (so each ?device= tab on localhost is a phone of its own)
   * @param {(look:{ theme:string, accent:string }) => void} p.apply
   */
  constructor({ game, storage, apply }){
    Object.assign(this, { game, storage, apply });
    this.listeners = new Set();
    this.pending = null;       /* a signed-in pick not saved yet: it shows here meanwhile */
    this.timer = null;
    this.look = null;
    this.owner = undefined;
    this.#show(resolveLook(null, storage.get("lastLook") ?? this.device));
    game.onChange(() => this.#sync());
  }

  /** The look showing now. */
  get current(){ return this.look; }

  /** This device's own look (the one shown while nobody's signed in). */
  get device(){ return { theme:this.storage.get("theme"), accent:this.storage.get("accent") }; }

  /**
   * @param {(look:{ theme:string, accent:string }, owner:string|null) => void} fn
   *   now, and whenever the look or whose it is changes (owner: the signed-in
   *   person's name — their picks are saved for them — or null: this device's)
   */
  onChange(fn){
    this.listeners.add(fn);
    fn(this.look, this.owner ?? null);
  }

  /**
   * A pick (Settings, or the top bar's light / dark switch): it shows at
   * once, and is saved on the profile when someone's signed in here (once
   * a run of picks settles), on this device otherwise.
   * @param {{ theme?:string, accent?:string }} patch
   */
  pick(patch){
    const clean = cleanLook(patch);
    if(!Object.keys(clean).length) return;
    if(this.#signedIn){
      this.pending = { ...this.pending, ...clean };
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.#save(), SAVE_AFTER_MS);
    }else{
      for(const [key, value] of Object.entries(clean)) this.storage.set(key, value);
    }
    if(this.game.ready) this.#sync();
    else this.#show({ ...this.look, ...clean });        /* (still loading: on top of what shows) */
  }

  /** Someone is signed in here (their profile may still be loading). */
  get #signedIn(){ return this.game.ready ? !!this.game.me : !!this.game.identity?.profileId; }

  async #save(){
    this.timer = null;
    if(!this.game.ready){ this.timer = setTimeout(() => this.#save(), SAVE_AFTER_MS); return; }
    const patch = this.pending;
    if(!patch) return;
    if(!this.game.me){                                   /* signed out (or removed) meanwhile: it's this device's */
      for(const [key, value] of Object.entries(patch)) this.storage.set(key, value);
      this.pending = null;
      this.#sync();
      return;
    }
    await this.game.saveLook(patch);                     /* never throws — a failure toasts, and the saved look shows again */
    if(this.pending === patch) this.pending = null;      /* (a newer pick keeps showing until it's saved too) */
    this.#sync();
  }

  #sync(){
    if(!this.game.ready) return;                         /* until the game data arrives, keep what's showing */
    const me = this.game.me;
    /* a pick not saved yet shows on top either way (signed out meanwhile, it's about to be this device's) */
    this.#show(me ? resolveLook({ ...this.game.myLook, ...this.pending }, this.device)
                  : resolveLook(null, { ...this.device, ...this.pending }), me?.name ?? null);
  }

  #show(look, owner = this.owner ?? null){
    const changed = !sameLook(look, this.look);
    if(!changed && owner === this.owner) return;
    this.owner = owner;
    if(changed){
      this.look = { theme:look.theme, accent:look.accent };
      this.storage.set("lastLook", this.look);
      this.apply(this.look);
    }
    for(const fn of this.listeners) fn(this.look, owner);
  }
}
