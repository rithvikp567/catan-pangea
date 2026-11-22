/**
 * The intro and the welcome — full-screen moments over the app
 * (css/screens.css, "splash"):
 *
 *   intro    — on every page load: seven hexes fly together into an island
 *              and "Settlers of Catan" rises in the middle of the screen,
 *              then it fades into what's underneath (choosing an account),
 *              or straight into the welcome for someone already signed in
 *              and seated. Its markup is in index.html, so it's on screen
 *              from the very first frame (the map never flashes first).
 *   welcome  — "Welcome, Lord Sam" with an 8-bit crown (and a little
 *              fanfare when the browser allows sound — after a tap), then
 *              it fades into the map / tracker.
 *
 * A tap skips either. Both cover the whole window: the music is put away
 * while they're up (App) — never covered.
 */
import { h } from "./dom.js";
import { crown } from "./badges.js";

const INTRO_MS = 2600;        /* the intro's least time on screen (from page load) */
const WELCOME_MS = 1900;      /* the welcome's time on screen, fade in included */
const FADE_MS = 520;
const IN_MS = 240;
const LAST_RESORT_MS = 9000;  /* the intro never waits longer than this for the game to load */

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = ms => new Promise(r => setTimeout(r, ms));

export class Splash {
  /**
   * @param {object} p
   * @param {import("./Sound.js").Sound} [p.sound]
   */
  constructor({ sound = null } = {}){
    this.sound = sound;
    this.el = document.getElementById("splash") ?? h("div", { class:"splash", hidden:true });
    if(!this.el.isConnected) document.body.append(this.el);
    this.el.dataset.js = "";                     /* JS runs it now (no CSS fail-safe fade) */
    this.el.setAttribute("role", "status");
    this.skip = null;
    this.el.addEventListener("click", () => this.skip?.());
  }

  get showing(){ return !this.el.hidden; }

  /**
   * The intro, already on screen since the page loaded. It stays at least
   * INTRO_MS and until `until` settles (the game has loaded), then either
   * crossfades into the welcome (`next()` returns { name, note }) or fades
   * out. `onReveal` runs as it starts to fade away.
   * @param {object} p
   * @param {Promise<unknown>} [p.until]
   * @param {() => ({ name:string, note?:string|null }|null)} [p.next]
   * @param {() => void} [p.onReveal]
   */
  async intro({ until = null, next = () => null, onReveal = () => {} } = {}){
    if(this.el.hidden) return;
    const skip = new Promise(r => { this.skip = r; });
    const least = wait(Math.max(0, INTRO_MS - performance.now()));
    const ready = Promise.race([until ?? null, wait(LAST_RESORT_MS)]);
    await Promise.race([Promise.all([least, ready]), skip.then(() => ready)]);
    this.skip = null;
    const greet = next();
    if(greet){
      await this.#scene(this.#welcomeScene(greet), { crossfade:true });
      this.sound?.fanfare();               /* (silent unless a tap has allowed sound) */
      await this.#hold(WELCOME_MS - IN_MS);
    }
    onReveal();
    await this.#fadeOut();
  }

  /**
   * The welcome on its own (an account was just picked), over the whole
   * window (App puts the music away meanwhile). `covered` runs once it fully
   * covers the screen — the place to switch what's underneath; `onReveal`
   * as it starts to fade away.
   * @param {{ name:string, note?:string|null }} who
   * @param {{ covered?:() => void, onReveal?:() => void }} [p]
   */
  async welcome(who, { covered = () => {}, onReveal = () => {} } = {}){
    await this.#scene(this.#welcomeScene(who), { crossfade:false });
    this.sound?.fanfare();
    covered();
    await this.#hold(WELCOME_MS - IN_MS);
    onReveal();
    await this.#fadeOut();
  }

  /** Show a scene: fading the whole splash in, or (already up) the old scene out and the new one in. */
  async #scene(scene, { crossfade }){
    const fast = reducedMotion();
    if(crossfade && this.showing){
      this.el.dataset.state = "swap";
      if(!fast) await wait(260);
      this.el.replaceChildren(scene);
      this.el.dataset.scene = "welcome";
      delete this.el.dataset.state;
      return;
    }
    this.el.replaceChildren(scene);
    this.el.dataset.scene = "welcome";
    this.el.hidden = false;
    this.el.dataset.state = "in";
    void this.el.offsetWidth;
    delete this.el.dataset.state;
    if(!fast) await wait(IN_MS);
  }

  /** Stay up for a while — or until a tap. */
  #hold(ms){
    return new Promise(r => {
      const t = setTimeout(done, ms);
      function done(){ clearTimeout(t); r(); }
      this.skip = done;
    }).finally(() => { this.skip = null; });
  }

  async #fadeOut(){
    this.el.dataset.state = "out";
    if(!reducedMotion()) await wait(FADE_MS);
    this.el.hidden = true;
    delete this.el.dataset.state;
  }

  #welcomeScene({ name, note = null }){
    const big = crown();
    big.classList.add("splash-crown");
    return h("div", { class:"splash-scene splash-welcome" },
      big,
      h("p", { class:"splash-hello" }, "Welcome,"),
      h("h1", { class:"splash-name" }, h("span", { class:"splash-lord" }, "Lord "), h("span", { class:"splash-who" }, name)),
      note ? h("p", { class:"splash-note" }, note) : null);
  }
}
