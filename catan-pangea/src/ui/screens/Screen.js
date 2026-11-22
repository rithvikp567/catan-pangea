/**
 * Base class for full-screen views (join, tracker, wins, admin). A
 * screen owns its <section>, builds its DOM once, and updates it from
 * GameState in render(). Subclasses override build() and render().
 *
 * Two layouts: "page" (sticky header: the back button with the title,
 * and the actions — the default; on the tracker they're tiles) and "centered" (no header; the subclass places
 * `this.heading` itself and the content sits in the middle of the screen,
 * for welcome-style views).
 */
import { h } from "../dom.js";

const BACK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`;

export class Screen {
  /**
   * @param {string} name   route name, e.g. "tracker"
   * @param {string} title  heading text
   * @param {object} deps   { game, router, … } shared by all screens
   * @param {object} [opts]
   * @param {"page"|"centered"} [opts.layout]
   */
  constructor(name, title, deps, { layout = "page" } = {}){
    this.name = name;
    this.title = title;
    this.deps = deps;
    this.heading = h("h1", { tabindex:"-1" }, title);
    this.actions = h("div", { class:"screen-actions" });
    this.body = h("div", { class:"screen-body" });
    const head = layout === "page"
      ? h("header", { class:"screen-head" }, h("div", { class:"screen-title" }, this.backButton(), this.heading), this.actions)
      : null;
    this.el = h("section", { class:"screen", "data-screen":name, "data-layout":layout, "aria-label":title, hidden:true },
      h("div", { class:"screen-inner" }, head, this.body));
    this.build();
  }

  get game(){ return this.deps.game; }
  get router(){ return this.deps.router; }

  /** Back goes to the map unless a subclass knows better. */
  backButton(){
    const b = h("button", { type:"button", class:"icon-btn back-btn", "aria-label":"Back to the map", onClick:() => this.onBack() });
    b.innerHTML = BACK_ICON;   /* static, trusted markup */
    return b;
  }
  onBack(){ this.router.go(""); }

  build(){}
  /** @param {import("../../game/GameState.js").GameState|null} state */
  render(/* state */){}

  /**
   * @param {object} [p]
   * @param {boolean} [p.swap]  true when replacing another screen: the
   *   backdrop is opaque at once and only the content fades in, so the
   *   map underneath never shows through mid-transition.
   */
  show({ swap = false } = {}){
    this.#stopLeaving();
    this.el.dataset.enter = swap ? "swap" : "rise";
    this.el.hidden = false;
    this.render(this.game.state);
    this.heading.focus({ preventScroll:true });
  }

  /**
   * @param {object} [p]
   * @param {boolean} [p.animate]  back to the map: the screen slides away
   *   (screens.css, data-leave) before it hides; to another screen it goes
   *   at once (the next one is already opaque over it).
   */
  hide({ animate = false } = {}){
    if(this.el.hidden || this.leaving) return;
    if(!animate || matchMedia("(prefers-reduced-motion: reduce)").matches){ this.el.hidden = true; return; }
    this.leaving = true;
    this.el.dataset.leave = "";
    this.leaveTimer = setTimeout(() => { this.#stopLeaving(); this.el.hidden = true; }, 200);
  }
  #stopLeaving(){
    clearTimeout(this.leaveTimer);
    this.leaving = false;
    delete this.el.dataset.leave;
  }
  /** On screen (not on its way out). */
  get visible(){ return !this.el.hidden && !this.leaving; }
}
