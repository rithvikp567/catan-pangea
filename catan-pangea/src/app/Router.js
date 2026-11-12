/**
 * Hash routing between the map (route "") and full-screen views
 * (#/join, #/tracker, #/wins, #/admin). Using the URL means the phone's
 * back gesture closes a screen, and a reload stays where you were.
 */
export class Router {
  /**
   * @param {object} p
   * @param {HTMLElement} p.mapEl   the map shell, made inert under a screen
   * @param {(route:string) => void} [p.onRoute]
   */
  constructor({ mapEl, onRoute = () => {} }){
    this.mapEl = mapEl;
    this.onRoute = onRoute;
    this.screens = new Map();
    addEventListener("hashchange", () => this.#apply());
  }

  /** @param {import("../ui/screens/Screen.js").Screen} screen */
  register(screen){
    this.screens.set(screen.name, screen);
    document.body.append(screen.el);
  }

  get route(){
    const r = location.hash.replace(/^#\/?/, "");
    return this.screens.has(r) ? r : "";
  }

  /** @param {string} route "" for the map */
  go(route, { replace = false } = {}){
    const hash = route ? `#/${route}` : "#/";
    if(location.hash === hash) return this.#apply();
    if(replace){ history.replaceState(null, "", hash); this.#apply(); }
    else location.hash = hash;          /* hashchange applies it */
  }

  start(){ this.#apply(); }

  /** Return to wherever the user came from (the map if unknown). */
  back(){ this.go(this.previous && this.previous !== this.current ? this.previous : ""); }

  #apply(){
    const route = this.route;
    if(route !== this.current){ this.previous = this.current; this.current = route; }
    for(const [name, screen] of this.screens){
      if(name === route){ if(!screen.visible) screen.show(); }
      else if(screen.visible) screen.hide();
    }
    this.mapEl.inert = !!route;
    document.body.dataset.route = route || "map";
    this.onRoute(route);
  }
}
