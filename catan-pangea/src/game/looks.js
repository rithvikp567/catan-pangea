/**
 * A person's Player Settings: how the app looks — a theme and an accent
 * color, each one of the lists below or a custom color off the color wheel
 * (game/colors.js) — plus the map's build animation and the sound effects.
 * They're saved on the person's profile (profiles/{id}/look), so they
 * follow them to every device they sign in on; signed out, a device keeps
 * its own.
 *
 *   { theme, accent, customTheme?, customAccent?, recent, animations, sounds }
 *     theme / accent    an id below, or "custom" (then customTheme / customAccent: "#rrggbbaa")
 *     recent            the person's last 5 custom colors, newest first (the picker shows them)
 *     animations        false: a new map just appears on their devices (no build-in)
 *     sounds            false: no sound effects on their devices (never the music)
 *
 * Only ids, names, families and validation live here (DOM-free: GameService
 * validates with it, the UI lists from it). The colors are in
 * css/tokens.css, selected by data-scheme / data-theme / data-accent on
 * <html> (ui/ThemeController.js) — a custom color's are worked out by
 * game/colors.js and set on <html> as properties. index.html's head script
 * paints the first frame from copies: the theme → family map (FAM) and the
 * accent ids (ACC) below, and each theme's --bg from css/tokens.css (BG,
 * for the browser bar) — keep them in step (tests/look.test.js checks); a
 * custom look it paints from what ThemeController saved (`lastPaint`).
 */
import { normalHex } from "./colors.js";

/**
 * The themes, in two families of three. Each has a partner in the other
 * family (the top bar's light / dark switch). Someone who never picked
 * one sees Light or Dark, whichever their device is set to ("system" —
 * the default, not offered as a choice since 2.13.0).
 */
export const THEMES = Object.freeze([
  { id:"light",    label:"Light",    scheme:"light", pair:"dark" },
  { id:"sand",     label:"Sand",     scheme:"light", pair:"hearth" },
  { id:"mist",     label:"Mist",     scheme:"light", pair:"midnight" },
  { id:"dark",     label:"Dark",     scheme:"dark",  pair:"light" },
  { id:"hearth",   label:"Hearth",   scheme:"dark",  pair:"sand" },
  { id:"midnight", label:"Midnight", scheme:"dark",  pair:"mist" },
].map(Object.freeze));

/** The accent colors: buttons, borders, what's selected. Graphite (ink) is the app's original look. */
export const ACCENTS = Object.freeze([
  { id:"graphite", label:"Graphite" },
  { id:"sea",      label:"Sea" },
  { id:"harbor",   label:"Harbor" },
  { id:"forest",   label:"Forest" },
  { id:"wheat",    label:"Wheat" },
  { id:"brick",    label:"Brick" },
  { id:"plum",     label:"Plum" },
  { id:"rose",     label:"Rose" },
].map(Object.freeze));

/** A custom color off the color wheel (customTheme / customAccent hold it). */
export const CUSTOM = "custom";
/** The theme of someone who never picked one: Light or Dark, as their device is set. */
export const SYSTEM = "system";
/** How many custom colors the picker remembers. */
export const RECENT_MAX = 5;

export const DEFAULT_LOOK = Object.freeze({
  theme:SYSTEM, accent:"graphite", customTheme:null, customAccent:null,
  recent:Object.freeze([]), animations:true, sounds:true,
});

export const themeById = id => THEMES.find(t => t.id === id) ?? null;
export const accentById = id => ACCENTS.find(a => a.id === id) ?? null;
const isTheme = id => !!themeById(id) || id === SYSTEM || id === CUSTOM;
const isAccent = id => !!accentById(id) || id === CUSTOM;

/** A list from the database: an array, or (Firebase's way with one) an object keyed 0, 1, 2… */
const listOf = v => Array.isArray(v) ? v : v && typeof v === "object" ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : [];

/**
 * Only the known fields with known values — anything else (junk, or an id
 * from a newer version of the app) is dropped.
 * @returns {{ theme?:string, accent?:string, customTheme?:string, customAccent?:string,
 *             recent?:string[], animations?:boolean, sounds?:boolean }}
 */
export function cleanLook(raw){
  const out = {};
  if(raw && typeof raw === "object"){
    if(typeof raw.theme === "string" && isTheme(raw.theme)) out.theme = raw.theme;
    if(typeof raw.accent === "string" && isAccent(raw.accent)) out.accent = raw.accent;
    for(const key of ["customTheme", "customAccent"]){
      const h = normalHex(raw[key]);
      if(h) out[key] = h;
    }
    if(raw.recent != null){
      const seen = [];
      for(const v of listOf(raw.recent)){ const h = normalHex(v); if(h && !seen.includes(h)) seen.push(h); }
      out.recent = seen.slice(0, RECENT_MAX);
    }
    for(const key of ["animations", "sounds"]) if(typeof raw[key] === "boolean") out[key] = raw[key];
  }
  return out;
}

/**
 * The settings to show: field by field, the person's own (their profile)
 * if they picked it, else this device's, else the default. A custom theme
 * or accent without its color shows the default instead.
 */
export function resolveLook(profileLook, deviceLook){
  const look = { ...DEFAULT_LOOK, ...cleanLook(deviceLook), ...cleanLook(profileLook) };
  if(look.theme === CUSTOM && !look.customTheme) look.theme = DEFAULT_LOOK.theme;
  if(look.accent === CUSTOM && !look.customAccent) look.accent = DEFAULT_LOOK.accent;
  look.recent = [...look.recent];
  return look;
}

/**
 * "light" or "dark": the theme's family — for the default, whatever the
 * device is set to; for a custom theme, its own (`customScheme`, from
 * game/colors.js customTheme).
 */
export function schemeOf(theme, systemDark, customScheme = null){
  if(theme === CUSTOM && customScheme) return customScheme;
  return themeById(theme)?.scheme ?? (systemDark ? "dark" : "light");
}

/**
 * The top bar's light / dark switch: a theme's partner in the other family
 * (Sand ⇄ Hearth); from the default or a custom theme, Light or Dark —
 * the opposite of what shows now (`darkNow`).
 */
export function flipTheme(theme, darkNow){
  return themeById(theme)?.pair ?? (darkNow ? "light" : "dark");
}

const KEYS = ["theme", "accent", "customTheme", "customAccent", "animations", "sounds"];
export const sameLook = (a, b) => !!a && !!b
  && KEYS.every(k => (a[k] ?? null) === (b[k] ?? null))
  && (a.recent ?? []).join() === (b.recent ?? []).join();
