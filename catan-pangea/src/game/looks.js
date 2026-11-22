/**
 * How the app looks: a theme and an accent color, as plain ids. A person's
 * look is saved on their profile (profiles/{id}/look), so it follows them
 * to every device they sign in on; signed out, a device keeps its own.
 *
 * Only ids, names and families live here (DOM-free: GameService validates
 * with it, the UI lists from it). The colors are in css/tokens.css,
 * selected by data-scheme / data-theme / data-accent on <html>
 * (ui/ThemeController.js). index.html's head script paints the first
 * frame from copies: the theme → family map (FAM) and the accent ids (ACC)
 * below, and each theme's --bg from css/tokens.css (BG, for the browser
 * bar) — keep them in step (tests/look.test.js checks).
 */

/**
 * The themes, in two families of three. Each has a partner in the other
 * family (the top bar's light / dark switch). "system" is Light or Dark,
 * whichever the device is set to — each device decides for itself.
 */
export const THEMES = Object.freeze([
  { id:"system",   label:"Match device", scheme:null },
  { id:"light",    label:"Light",        scheme:"light", pair:"dark" },
  { id:"sand",     label:"Sand",         scheme:"light", pair:"hearth" },
  { id:"mist",     label:"Mist",         scheme:"light", pair:"midnight" },
  { id:"dark",     label:"Dark",         scheme:"dark",  pair:"light" },
  { id:"hearth",   label:"Hearth",       scheme:"dark",  pair:"sand" },
  { id:"midnight", label:"Midnight",     scheme:"dark",  pair:"mist" },
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

export const DEFAULT_LOOK = Object.freeze({ theme:"system", accent:"graphite" });

export const themeById = id => THEMES.find(t => t.id === id) ?? null;
export const accentById = id => ACCENTS.find(a => a.id === id) ?? null;

/**
 * Only the known fields with known ids — anything else (junk, or an id
 * from a newer version of the app) is dropped.
 * @returns {{ theme?:string, accent?:string }}
 */
export function cleanLook(raw){
  const out = {};
  if(raw && typeof raw === "object"){
    if(typeof raw.theme === "string" && themeById(raw.theme)) out.theme = raw.theme;
    if(typeof raw.accent === "string" && accentById(raw.accent)) out.accent = raw.accent;
  }
  return out;
}

/**
 * The look to show: field by field, the person's own (their profile) if
 * they picked it, else this device's, else the default.
 * @returns {{ theme:string, accent:string }}
 */
export function resolveLook(profileLook, deviceLook){
  return { ...DEFAULT_LOOK, ...cleanLook(deviceLook), ...cleanLook(profileLook) };
}

/** "light" or "dark": the theme's family — for "system", whatever the device is set to. */
export function schemeOf(theme, systemDark){
  return themeById(theme)?.scheme ?? (systemDark ? "dark" : "light");
}

/**
 * The top bar's light / dark switch: a theme's partner in the other family
 * (Sand ⇄ Hearth); from "Match device", the opposite of what shows now.
 */
export function flipTheme(theme, systemDark){
  return themeById(theme)?.pair ?? (schemeOf(theme, systemDark) === "dark" ? "light" : "dark");
}

export const sameLook = (a, b) => !!a && !!b && a.theme === b.theme && a.accent === b.accent;
