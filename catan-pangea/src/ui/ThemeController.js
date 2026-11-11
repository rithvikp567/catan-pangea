/**
 * Light / dark theme. Follows the system until the user picks one, then
 * remembers the choice. Notifies listeners so the board (which bakes
 * colours in) can redraw.
 */
export class ThemeController {
  /** @param {import("../app/storage.js").SafeStorage} storage */
  constructor(storage, root = document.documentElement){
    this.storage = storage;
    this.root = root;
    this.listeners = new Set();
    this.system = matchMedia("(prefers-color-scheme: dark)");
    this.choice = ["light", "dark"].includes(storage.get("theme")) ? storage.get("theme") : null;
    this.system.addEventListener("change", () => { if(!this.choice) this.#apply(); });
    this.#apply();
  }

  get effective(){ return this.choice ?? (this.system.matches ? "dark" : "light"); }

  toggle(){
    this.choice = this.effective === "dark" ? "light" : "dark";
    this.storage.set("theme", this.choice);
    this.#apply();
  }

  /** @param {(theme:"light"|"dark") => void} fn */
  onChange(fn){ this.listeners.add(fn); }

  #apply(){
    if(this.choice) this.root.dataset.theme = this.choice;
    else delete this.root.dataset.theme;
    const bg = getComputedStyle(this.root).getPropertyValue("--bg").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
    for(const fn of this.listeners) fn(this.effective);
  }
}
