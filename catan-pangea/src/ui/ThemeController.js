/**
 * Paints a look (game/looks.js — app/LookSync decides whose) on the page,
 * as three attributes on <html> that css/tokens.css turns into colors:
 *   data-scheme  light | dark — the theme's family; for someone who never
 *                picked a theme, what this device is set to (and it follows
 *                a change); for a custom theme, its own (game/colors.js)
 *   data-theme   the theme (none for the default; "custom" for a custom one)
 *   data-accent  the accent color (none for the default, Graphite)
 * A custom theme or accent also sets its colors as custom properties on
 * <html> (game/colors.js works them out); so does a preset accent on a
 * custom theme — its text and focus ring are worked out for that theme. index.html's head script sets
 * all of it before the first frame — a custom look from `lastPaint`, which
 * this saves — and this keeps it, and the browser bar's color (the theme's
 * background), up to date. Listeners hear what changed: `colors` when the
 * theme's colors did (the board bakes them in, the snow has a palette for
 * each family), `accent` for the accent; nothing when nothing did.
 */
import { DEFAULT_LOOK, CUSTOM, schemeOf, accentById } from "../game/looks.js";
import { customTheme, customAccent, normalHex } from "../game/colors.js";

/** Every property a custom theme or accent may set on <html> (cleared when it isn't custom any more). */
const THEME_VARS = ["--bg", "--surface", "--surface-2", "--raised", "--ink", "--ink-2", "--ink-3", "--line", "--board-sea", "--focus-ring"];
const ACCENT_VARS = ["--accent-l", "--accent-d", "--accent-ink", "--accent-text", "--focus"];

export class ThemeController {
  /**
   * @param {HTMLElement} [root]
   * @param {{ storage?: import("../app/storage.js").SafeStorage }} [p]  this device's storage
   *   (Identity's), where the last custom paint is kept for index.html's head script
   */
  constructor(root = document.documentElement, { storage = null } = {}){
    this.root = root;
    this.storage = storage;
    this.listeners = new Set();
    this.system = matchMedia("(prefers-color-scheme: dark)");
    const ds = root.dataset;
    /* as the head script painted it (a custom color's properties too) — app/LookSync sets the whole look next */
    this.look = { ...DEFAULT_LOOK, theme:ds.theme ?? DEFAULT_LOOK.theme, accent:ds.accent ?? DEFAULT_LOOK.accent };
    this.painted = "";
    this.system.addEventListener("change", () => this.#paint());
    this.#barColor();
  }

  /** "light" | "dark", as it shows now. */
  get scheme(){ return schemeOf(this.look.theme, this.system.matches, this.#custom?.scheme); }
  /** Is this device set to dark? (Someone who never picked a theme follows it.) */
  get systemDark(){ return this.system.matches; }

  /** @param {object} look  a whole look (game/looks.js) */
  set(look){
    this.look = { ...look };
    this.#paint();
  }

  /** @param {(change:{ colors:boolean, accent:boolean, scheme:"light"|"dark" }) => void} fn */
  onChange(fn){ this.listeners.add(fn); }

  /** The custom theme's colors (or null when the theme isn't custom). */
  get #custom(){
    const { theme, customTheme:hex } = this.look;
    if(theme !== CUSTOM || !hex) return null;
    if(this.customKey !== hex){ this.customKey = hex; this.customCache = customTheme(hex); }
    return this.customCache;
  }

  #paint(){
    const ds = this.root.dataset, style = this.root.style, { theme, accent } = this.look, scheme = this.scheme;
    const custom = this.#custom;
    const colorsWere = `${ds.theme ?? ""}|${ds.scheme ?? ""}|${THEME_VARS.map(k => style.getPropertyValue(k)).join()}`;
    const accentWas = `${ds.accent ?? ""}|${ACCENT_VARS.map(k => style.getPropertyValue(k)).join()}`;
    if(theme === DEFAULT_LOOK.theme) delete ds.theme;
    else ds.theme = theme;
    ds.scheme = scheme;
    if(accent === DEFAULT_LOOK.accent) delete ds.accent;
    else ds.accent = accent;
    /* a custom theme's colors, then the accent's — a custom one on any theme, and a preset one on a
       custom theme (its fill as tokens.css has it, the text on it and the focus ring worked out for this
       theme: the presets were only checked against the six) */
    const vars = {};
    for(const k of [...THEME_VARS, ...ACCENT_VARS]) style.removeProperty(k);
    if(custom) Object.assign(vars, custom.vars);
    for(const [k, v] of Object.entries(vars)) style.setProperty(k, v);
    const css = getComputedStyle(this.root), get = k => css.getPropertyValue(k).trim();
    const fill = accent === CUSTOM ? this.look.customAccent
      : custom && accent !== DEFAULT_LOOK.accent && accentById(accent) ? get(scheme === "dark" ? "--accent-d" : "--accent-l")
      : null;
    if(normalHex(fill)){             /* (a preset's fill as tokens.css has it: plain hex) */
      const theme = { bg:get("--bg"), surface:get("--surface"), raised:get("--raised"), ink:get("--ink"), scheme };
      const acc = customAccent(fill, theme);
      /* a preset keeps its fill for each family from tokens.css (data-accent): the theme thumbnails of the
         other family in Settings inherit --accent-l / --accent-d from here and must show that family's own */
      if(accent !== CUSTOM){ delete acc["--accent-l"]; delete acc["--accent-d"]; }
      for(const [k, v] of Object.entries(acc)) style.setProperty(k, v);
      Object.assign(vars, acc);
    }
    const colorsNow = `${ds.theme ?? ""}|${scheme}|${THEME_VARS.map(k => style.getPropertyValue(k)).join()}`;
    const accentNow = `${ds.accent ?? ""}|${ACCENT_VARS.map(k => style.getPropertyValue(k)).join()}`;
    const colors = colorsWere !== colorsNow, accentChanged = accentWas !== accentNow;
    this.#keep(scheme, vars);
    if(colors) this.#barColor();
    if(colors || accentChanged) for(const fn of this.listeners) fn({ colors, accent:accentChanged, scheme });
  }

  /** What index.html's head script paints a custom look from, before the first frame. */
  #keep(scheme, vars){
    if(!this.storage) return;
    const { theme, accent } = this.look;
    const paint = theme === CUSTOM || accent === CUSTOM ? { theme, accent, scheme, vars } : null;
    const key = JSON.stringify(paint);
    if(key === this.painted) return;
    this.painted = key;
    this.storage.set("lastPaint", paint);
  }

  /** The browser's own bar (and the installed app's status bar) in the theme's background. */
  #barColor(){
    const bg = getComputedStyle(this.root).getPropertyValue("--bg").trim();
    if(bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
  }
}
