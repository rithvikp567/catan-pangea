/**
 * Paints a look (game/looks.js — app/LookSync decides whose) on the page,
 * as three attributes on <html> that css/tokens.css turns into colors:
 *   data-scheme  light | dark — the theme's family; for "Match device",
 *                what this device is set to (and it follows a change)
 *   data-theme   the theme (none for "Match device")
 *   data-accent  the accent color (none for the default, Graphite)
 * index.html's head script sets them before the first frame; this keeps
 * them — and the browser bar's color, the theme's background — up to date.
 * Listeners hear what changed: `colors` when the theme's colors did (the
 * board bakes them in, the snow has a palette for each family), `accent`
 * for the accent; nothing when nothing did.
 */
import { DEFAULT_LOOK, schemeOf } from "../game/looks.js";

export class ThemeController {
  constructor(root = document.documentElement){
    this.root = root;
    this.listeners = new Set();
    this.system = matchMedia("(prefers-color-scheme: dark)");
    const ds = root.dataset;
    this.look = { theme:ds.theme ?? DEFAULT_LOOK.theme, accent:ds.accent ?? DEFAULT_LOOK.accent };   /* as the head script painted it */
    this.system.addEventListener("change", () => this.#paint());
    this.#paint();
    this.#barColor();
  }

  /** "light" | "dark", as it shows now. */
  get scheme(){ return schemeOf(this.look.theme, this.system.matches); }
  /** Is this device set to dark? ("Match device" follows it.) */
  get systemDark(){ return this.system.matches; }

  /** @param {{ theme:string, accent:string }} look */
  set(look){
    this.look = { theme:look.theme, accent:look.accent };
    this.#paint();
  }

  /** @param {(change:{ colors:boolean, accent:boolean, scheme:"light"|"dark" }) => void} fn */
  onChange(fn){ this.listeners.add(fn); }

  #paint(){
    const ds = this.root.dataset, { theme, accent } = this.look, scheme = this.scheme;
    const colorsWere = `${ds.theme ?? ""}|${ds.scheme ?? ""}`, accentWas = ds.accent ?? "";
    if(theme === DEFAULT_LOOK.theme) delete ds.theme;
    else ds.theme = theme;
    ds.scheme = scheme;
    if(accent === DEFAULT_LOOK.accent) delete ds.accent;
    else ds.accent = accent;
    const colors = colorsWere !== `${ds.theme ?? ""}|${scheme}`, accentChanged = accentWas !== (ds.accent ?? "");
    if(colors) this.#barColor();
    if(colors || accentChanged) for(const fn of this.listeners) fn({ colors, accent:accentChanged, scheme });
  }

  /** The browser's own bar (and the installed app's status bar) in the theme's background. */
  #barColor(){
    const bg = getComputedStyle(this.root).getPropertyValue("--bg").trim();
    if(bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
  }
}
