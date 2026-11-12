/**
 * Base class for full-screen views (join, tracker, wins, admin). A
 * screen owns its <section>, builds its DOM once, and updates it from
 * GameState in render(). Subclasses override build() and render().
 */
import { h } from "../dom.js";

const BACK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`;

export class Screen {
  /**
   * @param {string} name   route name, e.g. "tracker"
   * @param {string} title  heading text
   * @param {object} deps   { game, router, … } shared by all screens
   */
  constructor(name, title, deps){
    this.name = name;
    this.title = title;
    this.deps = deps;
    this.heading = h("h1", { tabindex:"-1" }, title);
    this.actions = h("div", { class:"screen-actions" });
    this.body = h("div", { class:"screen-body" });
    this.el = h("section", { class:"screen", "data-screen":name, "aria-label":title, hidden:true },
      h("div", { class:"screen-inner" },
        h("header", { class:"screen-head" }, this.backButton(), this.heading, this.actions),
        this.body));
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

  show(){
    this.el.hidden = false;
    this.render(this.game.state);
    this.heading.focus({ preventScroll:true });
  }
  hide(){ this.el.hidden = true; }
  get visible(){ return !this.el.hidden; }
}
