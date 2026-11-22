/**
 * Color math for the custom colors in Player Settings (a theme or an accent
 * the person picks on the color wheel, with its opacity) — pure, DOM-free
 * (tests/look.test.js runs it in Node).
 *
 * A custom color is "#rrggbbaa" (lowercase; aa: its opacity). From it:
 *
 *  - customTheme(hex): a whole theme — the family (light or dark: whichever
 *    of black or white text reads better on it), the background (the color
 *    over the family's own background, as strong as its opacity: 100% is the
 *    color itself, 30% a tint of it), and the cards, lines and text worked
 *    out from that background so the text keeps its contrast.
 *  - customAccent(hex, theme): the accent's fill (as picked, opacity and
 *    all), the text on it (white or dark, whichever reads better) and the
 *    accent as text (moved toward the ink until it reads on the cards) —
 *    also the focus ring. ThemeController runs a preset accent through it
 *    too when the theme is custom (the presets were only checked against
 *    the six themes).
 *
 * Both return CSS custom properties, which ui/ThemeController sets on
 * <html> (and on the previews in Settings).
 */

const clamp01 = v => Math.max(0, Math.min(1, v));

/** "#rgb", "#rrggbb" or "#rrggbbaa" → "#rrggbbaa" (lowercase), or null. */
export function normalHex(value){
  if(typeof value !== "string") return null;
  let m = value.trim().toLowerCase().match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if(!m) return null;
  let h = m[1];
  if(h.length === 3) h = h.split("").map(c => c + c).join("");
  if(h.length === 6) h += "ff";
  return `#${h}`;
}

/** @returns {{ r:number, g:number, b:number, a:number }}  r, g, b 0–255; a 0–1 */
export function parseHex(value){
  const h = normalHex(value);
  if(!h) throw new Error(`not a color: ${value}`);
  const n = i => parseInt(h.slice(i, i + 2), 16);
  return { r:n(1), g:n(3), b:n(5), a:Math.round(n(7) / 255 * 1000) / 1000 };
}

const byte = v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
/** { r, g, b, a? } → "#rrggbbaa" */
export function toHex({ r, g, b, a = 1 }){ return `#${byte(r)}${byte(g)}${byte(b)}${byte(clamp01(a) * 255)}`; }
/** { r, g, b } → "#rrggbb" (opaque) */
export function toHex6({ r, g, b }){ return `#${byte(r)}${byte(g)}${byte(b)}`; }
/** A CSS color: "#rrggbb" when opaque, else rgb(r g b / a). */
export function cssColor(c){
  return c.a == null || c.a >= 1 ? toHex6(c) : `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)} / ${+c.a.toFixed(3)})`;
}

/** `a` mixed with `b`: t of a, the rest b (like color-mix(in srgb, a t, b)). Opaque. */
export function mix(a, b, t){
  return { r:a.r * t + b.r * (1 - t), g:a.g * t + b.g * (1 - t), b:a.b * t + b.b * (1 - t), a:1 };
}
/** A translucent color laid over an opaque one: what the eye sees. */
export const over = (top, under) => mix(top, under, top.a ?? 1);

/** WCAG relative luminance (0 black … 1 white). */
export function luminance({ r, g, b }){
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
/** WCAG contrast ratio, 1 … 21. */
export function contrast(a, b){
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/* ---------- HSV (the color wheel: hue round it, saturation out from the middle, then brightness) ---------- */

/** @returns {{ h:number, s:number, v:number }}  h 0–360, s and v 0–1 */
export function rgbToHsv({ r, g, b }){
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if(d){
    if(max === r) h = ((g - b) / d) % 6;
    else if(max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if(h < 0) h += 360;
  }
  return { h, s:max ? d / max : 0, v:max };
}
/** @returns {{ r:number, g:number, b:number }} */
export function hsvToRgb({ h, s, v }){
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r:(r + m) * 255, g:(g + m) * 255, b:(b + m) * 255 };
}

/* ---------- a custom theme ---------- */

const C = v => parseHex(v);
const WHITE = C("#ffffff"), BLACK = C("#000000");
/** What the light and dark families start from (Light's and Dark's own, css/tokens.css; ring: --focus-ring). */
const FAMILY = {
  light:{ base:C("#f5f4f0"), ink:C("#1b1b19"), sea:C("#dce5e8"), ring:C("#2c6e8e") },
  dark:{ base:C("#121211"), ink:C("#eceae4"), sea:C("#1b2529"), ring:C("#7db6d2") },
};

/**
 * Walk `color` toward `to` until it reads on every one of `on` (or it gets
 * there). A little over `ratio`, so the color still makes it once rounded to hex.
 */
function readable(color, to, on, ratio){
  ratio += 0.1;
  for(let t = 1; t >= 0; t -= 0.05){
    const c = mix(color, to, t);
    if(on.every(bg => contrast(c, bg) >= ratio)) return c;
  }
  return to;
}

/**
 * A whole theme from one color.
 * @param {string} hex  "#rrggbbaa"
 * @returns {{ scheme:"light"|"dark", vars:Record<string,string> }}
 */
export function customTheme(hex){
  const pick = parseHex(hex), solid = { ...pick, a:1 };
  const scheme = contrast(solid, BLACK) >= contrast(solid, WHITE) ? "light" : "dark";
  const fam = FAMILY[scheme];
  let bg = over(pick, fam.base);
  /* the text must read on it: a light background is kept light enough for dark text at 7:1, a dark
     one dark enough for light text at 8:1 (a mid-tone moves a little toward white / black) */
  bg = scheme === "light" ? readable(bg, WHITE, [BLACK], 7) : readable(bg, BLACK, [WHITE], 8);
  let surface, surface2, raised, line;
  if(scheme === "light"){
    surface = mix(bg, WHITE, 0.3);           /* cards: lighter than the background */
    surface2 = mix(bg, surface, 0.6);        /* a track or a pressed button on a card: between the two */
    raised = mix(surface, WHITE, 0.5);
    line = mix(bg, fam.ink, 0.9);
  }else{
    surface = mix(bg, WHITE, 0.95);
    surface2 = mix(bg, WHITE, 0.9);
    raised = mix(bg, WHITE, 0.87);
    line = mix(bg, WHITE, 0.92);
  }
  /* the ink: the family's, tinted a little with the color — at least 7:1 on the background and the cards */
  const ink = readable(mix(fam.ink, solid, 0.9), scheme === "light" ? BLACK : WHITE, [bg, surface, surface2, raised], 7);
  const ink2 = readable(mix(ink, bg, 0.62), ink, [bg, surface, surface2], 4.5);
  const ink3 = readable(mix(ink, bg, 0.45), ink, [bg, surface], 2.6);
  const sea = mix(fam.sea, solid, 0.8);
  /* the focus ring (with Graphite): the family's blue, toward the ink until it shows (3:1) on the background and the cards */
  const ring = readable(fam.ring, ink, [bg, surface, surface2, raised], 3);
  const vars = {
    "--bg":bg, "--surface":surface, "--surface-2":surface2, "--raised":raised,
    "--ink":ink, "--ink-2":ink2, "--ink-3":ink3, "--line":line, "--board-sea":sea, "--focus-ring":ring,
  };
  return { scheme, vars:Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, toHex6(v)])) };
}

/* ---------- a custom accent ---------- */

/**
 * The accent's colors on a theme.
 * @param {string} hex  "#rrggbbaa"
 * @param {{ bg:string, surface:string, raised?:string, ink:string, scheme:"light"|"dark" }} theme  the theme's colors (plain hex)
 * @returns {Record<string,string>}
 */
export function customAccent(hex, theme){
  const pick = parseHex(hex);
  const bg = C(theme.bg), surface = C(theme.surface), raised = C(theme.raised ?? theme.surface), ink = C(theme.ink);
  /* a filled button is the accent over the card color wherever it sits (css: .btn.primary has the
     card's color under it), so a see-through accent always looks the same */
  const fills = [over(pick, surface)];
  /* the text on it: the family's own (white on a light theme, the background on a dark one) if it
     reads at 4.5:1, else white or black, whichever reads better (one of them always does) */
  const score = c => Math.min(...fills.map(f => contrast(c, f)));
  const own = theme.scheme === "dark" ? bg : WHITE;
  const onFill = score(own) >= 4.6 ? own : score(WHITE) >= score(BLACK) ? WHITE : BLACK;
  /* the accent as text (what's picked or playing): toward the ink until it reads on the cards and on its own tint */
  const soft = mix(over(pick, surface), surface, 0.12);
  const text = readable({ ...pick, a:1 }, ink, [bg, surface, raised, soft], 4.5);
  const fill = cssColor(pick);
  /* the focus ring: the accent as text (opaque, and it reads on the background and the cards) — never the
     fill itself, which may be see-through or the background's own color */
  return { "--accent-l":fill, "--accent-d":fill, "--accent-ink":toHex6(onFill), "--accent-text":toHex6(text), "--focus":toHex6(text) };
}

/** The person's last few custom colors, newest first: `hex` added to the front of `list`. */
export function addRecent(list, hex, max = 5){
  const h = normalHex(hex);
  if(!h) return [...(list ?? [])].slice(0, max);
  return [h, ...(list ?? []).filter(x => x !== h)].slice(0, max);
}
