/* Player Settings — themes and accent colors (game/looks.js), their colors
   (css/tokens.css), custom colors (game/colors.js), the first-frame copy of
   the lists (index.html), and how a person's settings follow them from
   device to device (app/LookSync.js over GameController, on one shared
   store). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  THEMES, ACCENTS, DEFAULT_LOOK, CUSTOM, SYSTEM, RECENT_MAX, themeById, accentById, cleanLook, resolveLook, schemeOf, flipTheme, sameLook,
} from "../catan-pangea/src/game/looks.js";
import {
  normalHex, parseHex, toHex, customTheme, customAccent, addRecent, contrast as contrastOf, over, hsvToRgb, rgbToHsv,
} from "../catan-pangea/src/game/colors.js";
import { MemoryStore } from "../catan-pangea/src/sync/MemoryStore.js";
import { SafeStorage } from "../catan-pangea/src/app/storage.js";
import { Identity } from "../catan-pangea/src/app/Identity.js";
import { GameController } from "../catan-pangea/src/app/GameController.js";
import { LookSync } from "../catan-pangea/src/app/LookSync.js";

const read = rel => readFileSync(new URL(`../catan-pangea/${rel}`, import.meta.url), "utf8");
/** A whole look: the default with these fields picked. */
const L = patch => ({ ...DEFAULT_LOOK, recent:[], ...patch });

/* ---------------- the lists ---------------- */

test("themes: two families of three, each theme paired with one in the other family (no Match device since 2.13)", () => {
  assert.equal(new Set(THEMES.map(t => t.id)).size, THEMES.length);
  assert.deepEqual(THEMES.filter(t => t.scheme === "light").map(t => t.id), ["light", "sand", "mist"]);
  assert.deepEqual(THEMES.filter(t => t.scheme === "dark").map(t => t.id), ["dark", "hearth", "midnight"]);
  assert.equal(THEMES.length, 6, "nothing else is offered: not the default (\"system\"), not Custom (its own tile)");
  for(const t of THEMES){
    const pair = themeById(t.pair);
    assert.ok(pair, `${t.id} has a partner`);
    assert.notEqual(pair.scheme, t.scheme, `${t.id}'s partner is in the other family`);
    assert.equal(pair.pair, t.id, `${t.id} ⇄ ${pair.id}`);
  }
  assert.equal(new Set(ACCENTS.map(a => a.id)).size, ACCENTS.length);
  assert.equal(ACCENTS[0].id, "graphite", "Graphite (the original look) first");
  assert.equal(DEFAULT_LOOK.theme, SYSTEM, "never picked: Light or Dark, as the device is set");
  assert.ok(accentById(DEFAULT_LOOK.accent));
  assert.deepEqual([DEFAULT_LOOK.animations, DEFAULT_LOOK.sounds, DEFAULT_LOOK.recent.length], [true, true, 0]);
});

test("cleanLook keeps known fields and values only; resolveLook: the profile's pick, else the device's, else the default — field by field", () => {
  assert.deepEqual(cleanLook({ theme:"sand", accent:"rose", at:5, extra:1 }), { theme:"sand", accent:"rose" });
  assert.deepEqual(cleanLook({ theme:"neon", accent:7 }), {});
  for(const junk of [null, undefined, "sand", 3, []]) assert.deepEqual(cleanLook(junk), {});
  assert.deepEqual(cleanLook({ theme:SYSTEM, accent:CUSTOM }), { theme:SYSTEM, accent:CUSTOM }, "(a Match device pick from 2.12 is the default)");
  assert.deepEqual(resolveLook(null, null), DEFAULT_LOOK);
  assert.deepEqual(resolveLook(null, { theme:"mist" }), L({ theme:"mist" }));
  assert.deepEqual(resolveLook({ accent:"plum" }, { theme:"mist", accent:"sea" }), L({ theme:"mist", accent:"plum" }));
  assert.deepEqual(resolveLook({ theme:"hearth", accent:"wheat", at:1 }, { theme:"mist" }), L({ theme:"hearth", accent:"wheat" }));
  assert.deepEqual(resolveLook({ theme:"from-a-newer-app" }, { theme:"sand" }), L({ theme:"sand" }));
  assert.ok(sameLook({ theme:"sand", accent:"sea" }, { theme:"sand", accent:"sea", at:9 }));
  assert.ok(!sameLook(null, DEFAULT_LOOK));
  assert.ok(!sameLook(L({ recent:["#112233ff"] }), L({})), "the recent colors count");
  assert.ok(!sameLook(L({ sounds:false }), L({})));
});

test("custom colors, map animations, sound effects: cleaned, remembered, and a custom pick without its color shows the default", () => {
  assert.deepEqual(cleanLook({ customTheme:"#ABC", customAccent:"#2A5F9E80", animations:false, sounds:"no" }),
    { customTheme:"#aabbccff", customAccent:"#2a5f9e80", animations:false });
  assert.deepEqual(cleanLook({ customTheme:"red", customAccent:"#12345" }), {});
  /* the last five custom colors, newest first, no repeats — read back from Firebase as an array or an object keyed 0, 1, 2… */
  assert.deepEqual(cleanLook({ recent:["#111111", "#222222ff", "#111111ff", "junk", "#333", "#444", "#555", "#666"] }).recent,
    ["#111111ff", "#222222ff", "#333333ff", "#444444ff", "#555555ff"]);
  assert.deepEqual(cleanLook({ recent:{ 1:"#222222", 0:"#111111" } }).recent, ["#111111ff", "#222222ff"]);
  assert.equal(RECENT_MAX, 5);
  assert.deepEqual(addRecent(["#111111ff", "#222222ff"], "#222222"), ["#222222ff", "#111111ff"]);
  const five = ["#100000ff", "#200000ff", "#300000ff", "#400000ff", "#500000ff"];
  assert.deepEqual(addRecent(five, "#abcdef"), ["#abcdefff", ...five.slice(0, 4)], "the oldest drops off");
  assert.equal(addRecent(null, "#abcdef")[0], "#abcdefff");
  /* Custom with its color shows it; without, the default */
  assert.deepEqual(resolveLook({ theme:CUSTOM, customTheme:"#335577" }, null), L({ theme:CUSTOM, customTheme:"#335577ff" }));
  assert.equal(resolveLook({ theme:CUSTOM }, null).theme, SYSTEM);
  assert.equal(resolveLook({ accent:CUSTOM }, null).accent, "graphite");
  assert.equal(resolveLook({ animations:false }, { animations:true }).animations, false);
});

test("schemeOf and the light / dark switch: a theme's partner; from the default or a custom theme, the opposite of what shows", () => {
  assert.equal(schemeOf("sand", true), "light");
  assert.equal(schemeOf(SYSTEM, true), "dark");
  assert.equal(schemeOf(SYSTEM, false), "light");
  assert.equal(schemeOf(CUSTOM, false, "dark"), "dark");
  assert.equal(flipTheme("sand", false), "hearth");
  assert.equal(flipTheme("midnight", false), "mist");
  assert.equal(flipTheme("light", true), "dark");
  assert.equal(flipTheme(SYSTEM, true), "light");
  assert.equal(flipTheme(SYSTEM, false), "dark");
  assert.equal(flipTheme(CUSTOM, true), "light");
});

/* ---------------- the colors ---------------- */

const tokens = read("css/tokens.css");
/** The custom properties a selector's block sets (the first block for it, from `from` on). */
function block(selector, from = 0){
  const at = tokens.indexOf(`${selector}{`, from);
  assert.ok(at >= 0, `tokens.css has a ${selector} block`);
  const body = tokens.slice(at + selector.length + 1, tokens.indexOf("}", at));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}
const FAMILY = { light:block(':root, [data-scheme="light"]'), dark:block('[data-scheme="dark"]') };
/** A theme's colors on <html>: the light family's (`:root` always matches it), the dark family's on top
    for a dark theme, then the theme's own — the order they come in tokens.css, as the cascade takes them. */
const colorsOf = theme => ({
  ...FAMILY.light,
  ...(themeById(theme).scheme === "dark" ? FAMILY.dark : {}),
  ...(["light", "dark"].includes(theme) ? {} : block(`[data-theme="${theme}"]`)),
});
/** The same in every theme (`:root`): what the accent drives, with Graphite. */
const SHARED = block(":root");
/** With an accent picked: what `:root[data-accent]` sets — plain, and its tints inside @supports (color-mix). */
const SUPPORTS = tokens.indexOf("@supports (color: color-mix(");
const PICKED = { ...block(":root[data-accent]"), ...(SUPPORTS >= 0 ? block(":root[data-accent]", SUPPORTS) : {}) };
/** Every custom property on <html> with this theme and accent, as the cascade settles them: the
    family, theme and accent blocks, then `:root` (the same weight, later in the file), then
    `:root[data-accent]` (heavier). */
const varsOf = (theme, accent) => accent === "graphite"
  ? { ...colorsOf(theme), ...SHARED }
  : { ...colorsOf(theme), ...block(`[data-accent="${accent}"]`), ...SHARED, ...PICKED };

const hex = v => { assert.match(v, /^#[0-9A-F]{6}$/i, `a plain color: ${v}`); return v; };
/**
 * A token's value as the plain color the browser ends up with: var(--x) and
 * var(--x, fallback) looked up in `vars`, color-mix(in srgb, a N%, b) mixed.
 * Anything else must be a plain color — a value this can't read fails the test.
 */
function resolve(value, vars, seen = []){
  let m;
  if((m = value.match(/^var\((--[\w-]+)\s*(?:,\s*(.+))?\)$/))){
    const [, name, fallback] = m;
    assert.ok(!seen.includes(name), `a loop through ${name}`);
    const own = vars[name];
    if(own !== undefined && own !== "initial") return resolve(own, vars, [...seen, name]);
    assert.ok(fallback, `${name} is set (${seen.join(" → ") || "asked for"})`);
    return resolve(fallback.trim(), vars, seen);
  }
  if((m = value.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*(.+)\)$/))){
    return mix(resolve(m[1], vars, seen), resolve(m[3].trim(), vars, seen), Number(m[2]) / 100);
  }
  return hex(value);
}
const lum = v => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex(v).slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** color-mix(in srgb, a t, b) */
const mix = (a, b, t) => "#" + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * t + parseInt(b.slice(i, i + 2), 16) * (1 - t)).toString(16).padStart(2, "0")).join("");

test("tokens.css: a block for every theme and accent color, plain colors the board can copy", () => {
  for(const t of THEMES.filter(t => t.scheme && !["light", "dark"].includes(t.id))){
    const own = block(`[data-theme="${t.id}"]`);
    for(const k of ["--bg", "--surface", "--surface-2", "--raised", "--ink", "--ink-2", "--ink-3", "--line"]) assert.ok(own[k], `${t.id} sets ${k}`);
  }
  for(const theme of THEMES.filter(t => t.scheme)){
    const c = colorsOf(theme.id);
    for(const k of ["--board-sea", "--board-token", "--board-token-ink", "--board-red", "--board-port", "--board-port-3"]) hex(c[k]);
  }
  for(const a of ACCENTS.filter(a => a.id !== "graphite")){
    const c = block(`[data-accent="${a.id}"]`);
    hex(c["--accent-l"]); hex(c["--accent-d"]);
  }
});

test("contrast: text on every accent, the accent as text, and the ink, in every theme (WCAG AA, 4.5:1)", () => {
  const AA = 4.5;
  for(const theme of THEMES.filter(t => t.scheme)){
    const c = colorsOf(theme.id);
    assert.ok(contrast(c["--ink"], c["--surface"]) >= 7, `${theme.id}: ink on a card`);
    assert.ok(contrast(c["--ink-2"], c["--bg"]) >= AA, `${theme.id}: secondary text`);
    for(const a of ACCENTS){
      /* every color read from tokens.css as the browser resolves it (Graphite: the ink, with white / the background on it) */
      const v = varsOf(theme.id, a.id), get = name => resolve(`var(${name})`, v);
      const fill = get("--accent"), onFill = get("--accent-ink"), text = get("--accent-text"), soft = get("--accent-soft");
      const where = `${a.id} in ${theme.id}`;
      assert.ok(contrast(onFill, fill) >= AA, `${where}: a primary button's text (${contrast(onFill, fill).toFixed(2)})`);
      for(const bgKey of ["--bg", "--surface", "--raised"]){
        const bg = get(bgKey);
        assert.ok(contrast(text, bg) >= AA, `${where}: the accent as text on ${bgKey} (${contrast(text, bg).toFixed(2)})`);
      }
      assert.ok(contrast(text, soft) >= AA, `${where}: the song playing — the accent on --accent-soft (${contrast(text, soft).toFixed(2)})`);
    }
  }
});

test("tokens.css: the accent's tints are mixed only where color-mix() works; elsewhere the neutral ones stay", () => {
  assert.ok(SUPPORTS >= 0, "an @supports (color: color-mix(…)) block");
  assert.ok(SHARED["--accent-soft"] && SHARED["--accent-line"], ":root sets neutral ones for every browser");
  for(const name of ["--accent-soft", "--accent-line"]){
    assert.match(block(":root[data-accent]", SUPPORTS)[name] ?? "", /^color-mix\(/, `${name} is mixed inside @supports`);
  }
  /* outside @supports, nothing uses color-mix() for the accent (an older browser would drop the value, and with it every outline) */
  const outside = tokens.slice(0, SUPPORTS) + tokens.slice(tokens.indexOf("}", tokens.indexOf("}", SUPPORTS) + 1) + 1);
  assert.doesNotMatch(outside, /--accent[\w-]*\s*:\s*color-mix/);
});

test("index.html paints the first frame from the same lists (keep its head script in step with looks.js and tokens.css)", () => {
  const html = read("index.html");
  const object = name => JSON.parse(html.match(new RegExp(`var ${name} = (\\{[^}]*\\})`))[1].replace(/(\w+):/g, '"$1":'));
  const fam = object("FAM"), bg = object("BG");
  const acc = JSON.parse(html.match(/var ACC = (\[[^\]]*\])/)[1]);
  assert.deepEqual(fam, Object.fromEntries(THEMES.filter(t => t.scheme).map(t => [t.id, t.scheme])));
  assert.deepEqual(acc, ACCENTS.filter(a => a.id !== DEFAULT_LOOK.accent).map(a => a.id));
  assert.deepEqual(bg, Object.fromEntries(THEMES.filter(t => t.scheme).map(t => [t.id, colorsOf(t.id)["--bg"]])), "the browser bar: each theme's background");
  assert.ok(html.indexOf("var FAM") < html.indexOf('href="css/tokens.css"'), "before the stylesheets");
});

/* ---------------- custom colors (game/colors.js) ---------------- */

/** A sample of colors at several opacities: a coarse cube of the RGB space, plus the corners. */
const SAMPLE = (() => {
  const out = [];
  for(let r = 0; r <= 255; r += 51) for(let g = 0; g <= 255; g += 51) for(let b = 0; b <= 255; b += 51){
    for(const a of [1, 0.6, 0.25, 0.05]) out.push(toHex({ r, g, b, a }));
  }
  return out;
})();
const P = parseHex;

test("hex and the color wheel: colors read and written as #rrggbbaa; hue / saturation / brightness round-trip", () => {
  assert.equal(normalHex("#ABC"), "#aabbccff");
  assert.equal(normalHex("2a5f9e"), "#2a5f9eff");
  assert.equal(normalHex("#2A5F9E80"), "#2a5f9e80");
  for(const junk of ["", "#12", "#12345", "red", null, 7, "#gggggg"]) assert.equal(normalHex(junk), null);
  assert.deepEqual(parseHex("#ff000080"), { r:255, g:0, b:0, a:0.502 });
  for(const hex of ["#2a5f9eff", "#ffffffff", "#000000ff", "#e5484dff", "#46a758ff", "#808080ff"]){
    assert.equal(toHex({ ...hsvToRgb(rgbToHsv(P(hex))), a:1 }), hex, `${hex} round-trips through the wheel`);
  }
  assert.deepEqual(rgbToHsv(P("#ff0000")), { h:0, s:1, v:1 }, "red is at the top of the wheel");
});

test("a custom theme: light or dark by its color, and its text always reads (every color, every opacity)", () => {
  assert.equal(customTheme("#f3ecdeff").scheme, "light");
  assert.equal(customTheme("#0e131bff").scheme, "dark");
  assert.equal(customTheme("#f3ecdeff").vars["--bg"], "#f3ecde", "an opaque light color is the background as picked");
  assert.equal(customTheme("#ff000000").vars["--bg"], "#f5f4f0", "fully see-through: the family's own background (Light's)");
  assert.equal(customTheme("#0000ff00").vars["--bg"], "#121211", "(Dark's)");
  const faint = customTheme("#2a5f9e33"), strong = customTheme("#2a5f9eff");
  assert.notEqual(faint.vars["--bg"], strong.vars["--bg"], "the opacity is how strongly the color shows");
  for(const hex of SAMPLE){
    const { scheme, vars } = customTheme(hex), c = k => P(vars[k]);
    assert.ok(["light", "dark"].includes(scheme));
    for(const k of ["--bg", "--surface", "--surface-2", "--raised", "--ink", "--ink-2", "--ink-3", "--line", "--board-sea", "--focus-ring"]) hex6(vars[k]);
    const at = (fg, bg, min) => assert.ok(contrastOf(c(fg), c(bg)) >= min, `${hex}: ${fg} on ${bg} (${contrastOf(c(fg), c(bg)).toFixed(2)})`);
    at("--ink", "--bg", 7); at("--ink", "--surface", 7);
    at("--ink", "--surface-2", 4.5); at("--ink", "--raised", 4.5);
    at("--ink-2", "--bg", 4.5); at("--ink-2", "--surface", 4.5); at("--ink-2", "--surface-2", 4.5);
    /* the focus ring (with Graphite) shows on the background and every card (WCAG's 3:1 for an outline) */
    for(const bg of ["--bg", "--surface", "--surface-2", "--raised"]) at("--focus-ring", bg, 3);
  }
});

test("a custom accent: the text on it and the accent as text read (4.5:1) on every theme — the six and custom ones", () => {
  const themes = [
    ...THEMES.map(t => { const c = colorsOf(t.id); return { name:t.id, bg:c["--bg"], surface:c["--surface"], raised:c["--raised"], ink:c["--ink"], scheme:t.scheme }; }),
    ...["#f3ecdeff", "#0e131bff", "#e5484d66", "#46a758ff", "#808080ff"].map(hex => {
      const { scheme, vars } = customTheme(hex);
      return { name:`custom ${hex}`, bg:vars["--bg"], surface:vars["--surface"], raised:vars["--raised"], ink:vars["--ink"], scheme };
    }),
  ];
  for(const theme of themes) for(const hex of SAMPLE.filter((_, i) => i % 3 === 0)){
    const v = customAccent(hex, theme), where = `${hex} on ${theme.name}`;
    /* a filled button is the accent over the card color (css: .btn.primary) */
    const fill = over(P(hex), P(theme.surface));
    assert.ok(contrastOf(P(v["--accent-ink"]), fill) >= 4.5, `${where}: a filled button's text (${contrastOf(P(v["--accent-ink"]), fill).toFixed(2)})`);
    for(const bg of [theme.bg, theme.surface, theme.raised]){
      assert.ok(contrastOf(P(v["--accent-text"]), P(bg)) >= 4.5, `${where}: the accent as text on ${bg}`);
      /* the focus ring is never the raw fill (a see-through one, or the background's own color, would hide it) */
      assert.ok(contrastOf(P(v["--focus"]), P(bg)) >= 3, `${where}: the focus ring on ${bg}`);
    }
    assert.equal(v["--accent-l"], v["--accent-d"], "one color, whichever the family");
  }
  /* the fill keeps its opacity; an opaque one is plain hex */
  assert.equal(customAccent("#2a5f9eff", themes[0])["--accent-l"], "#2a5f9e");
  assert.match(customAccent("#2a5f9e80", themes[0])["--accent-l"], /^rgb\(42 95 158 \/ 0\.502\)$/);
});

test("a preset accent on a custom theme is worked out for it, as ThemeController does: its text, the accent as text and the focus ring read", () => {
  /* the presets' fills, from tokens.css: -l on a light theme, -d on a dark one (ThemeController reads the same) */
  const presets = ACCENTS.filter(a => a.id !== DEFAULT_LOOK.accent).map(a => ({ id:a.id, ...block(`[data-accent="${a.id}"]`) }));
  for(const hex of SAMPLE.filter((_, i) => i % 2 === 0)){
    const { scheme, vars } = customTheme(hex), theme = { bg:vars["--bg"], surface:vars["--surface"], raised:vars["--raised"], ink:vars["--ink"], scheme };
    for(const a of presets){
      const fillHex = a[scheme === "dark" ? "--accent-d" : "--accent-l"], v = customAccent(fillHex, theme), where = `${a.id} on custom ${hex}`;
      assert.equal(v["--accent-l"].toLowerCase(), fillHex.toLowerCase(), `${where}: the preset's own fill`);
      const fill = P(fillHex), soft = mix(fillHex, vars["--surface"], 0.12);
      assert.ok(contrastOf(P(v["--accent-ink"]), fill) >= 4.5, `${where}: a filled button's text (${contrastOf(P(v["--accent-ink"]), fill).toFixed(2)})`);
      for(const bg of [vars["--bg"], vars["--surface"], vars["--raised"], soft]){
        assert.ok(contrastOf(P(v["--accent-text"]), P(bg)) >= 4.5, `${where}: the accent as text on ${bg} (${contrastOf(P(v["--accent-text"]), P(bg)).toFixed(2)})`);
      }
      for(const bg of [vars["--bg"], vars["--surface"], vars["--raised"]]) assert.ok(contrastOf(P(v["--focus"]), P(bg)) >= 3, `${where}: the focus ring on ${bg}`);
    }
  }
  /* and ThemeController does run them through it on a custom theme */
  const src = read("src/ui/ThemeController.js");
  assert.match(src, /custom && accent !== DEFAULT_LOOK\.accent && accentById\(accent\) \? get\(scheme === "dark" \? "--accent-d" : "--accent-l"\)/);
  for(const k of ["--focus", "--focus-ring"]) assert.ok(src.includes(`"${k}"`), `ThemeController clears ${k} when it isn't custom any more`);
  /* …setting only what's worked out for the theme: the preset's fills stay tokens.css's, one for each family
     (the other family's theme thumbnails in Settings inherit them) */
  assert.match(src, /if\(accent !== CUSTOM\)\{ delete acc\["--accent-l"\]; delete acc\["--accent-d"\]; \}/);
});

test("filled accent controls have the card color under the accent, so a see-through accent's text still reads", () => {
  const css = ["app.css", "music.css", "screens.css"].map(f => read(`css/${f}`)).join("\n");
  for(const sel of [".btn.primary", ".rob-btn", ".music-btn.is-play", ".music-mini .mini-play"]){
    const at = css.indexOf(`${sel}{`);
    assert.ok(at >= 0, sel);
    assert.match(css.slice(at, css.indexOf("}", at)), /background:linear-gradient\(var\(--accent\), var\(--accent\)\), var\(--surface\)/, sel);
  }
});

test("index.html's head script paints a custom look before the first frame, from what ThemeController kept", () => {
  const html = read("index.html");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const paint = (stored, { dark = false } = {}) => {
    const attrs = {}, props = {}, meta = { content:null, setAttribute(k, v){ this[k] = v; } };
    const root = { setAttribute:(k, v) => { attrs[k] = v; }, getAttribute:k => attrs[k] ?? null, style:{ setProperty:(k, v) => { props[k] = v; } } };
    const doc = { documentElement:root, querySelector:() => meta };
    const storage = { getItem:k => k.startsWith("pangaea:") && stored[k.slice(8)] !== undefined ? JSON.stringify(stored[k.slice(8)]) : null };
    new Function("document", "localStorage", "matchMedia", "location", script)(doc, storage, () => ({ matches:dark }), { hostname:"example.com", search:"" });
    return { attrs, props, bar:meta.content };
  };
  const vars = { "--bg":"#101820", "--ink":"#eeeeee", "--accent-l":"rgb(42 95 158 / 0.5)" };
  const custom = paint({ lastLook:{ theme:"custom", accent:"custom" }, lastPaint:{ theme:"custom", accent:"custom", scheme:"dark", vars } });
  assert.deepEqual(custom.attrs, { "data-theme":"custom", "data-accent":"custom", "data-scheme":"dark" });
  assert.deepEqual(custom.props, vars);
  assert.equal(custom.bar, "#101820", "the browser bar: the custom background");
  /* a paint for another look (stale) is ignored; a name that isn't a custom property never gets set */
  const stale = paint({ lastLook:{ theme:"sand", accent:"sea" }, lastPaint:{ theme:"custom", accent:"sea", scheme:"dark", vars } });
  assert.deepEqual(stale.props, {});
  assert.deepEqual(stale.attrs, { "data-theme":"sand", "data-accent":"sea", "data-scheme":"light" });
  const junk = paint({ lastLook:{ theme:"light", accent:"custom" }, lastPaint:{ theme:"light", accent:"custom", vars:{ "color":"red", "--accent-l":"#123456" } } });
  assert.deepEqual(junk.props, { "--accent-l":"#123456" });
  assert.equal(junk.attrs["data-accent"], "custom");
  /* nothing picked: the device's light / dark */
  assert.equal(paint({}, { dark:true }).attrs["data-scheme"], "dark");
});

const hex6 = v => { assert.match(v, /^#[0-9a-f]{6}$/, `a plain color: ${v}`); return v; };

/* ---------------- following a person from device to device ---------------- */

/** A browser's localStorage, kept in a Map. */
const memoryStorage = () => { const m = new Map(); return { getItem:k => m.get(k) ?? null, setItem:(k, v) => m.set(k, String(v)), map:m }; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const SAVED = 450;   /* LookSync saves a pick once a run of picks settles (400 ms) */

/** One device: its own storage and identity, the shared store, a LookSync painting into `shown`. */
async function device(store, name){
  const backend = memoryStorage();
  const storage = new SafeStorage("pangaea:", backend);
  const identity = new Identity(storage);
  const toasts = [];
  const game = new GameController({ identity, toast:{ show:msg => toasts.push(msg) } });
  const shown = [];
  const look = new LookSync({ game, storage, apply:l => shown.push(l) });
  const owners = [];
  look.onChange((l, owner) => owners.push(owner));
  await game.connect(store);
  return { name, storage, backend, identity, game, look, shown, owners, toasts, get current(){ return look.current; } };
}

test("signed in: a pick on the phone shows on the laptop too; signed out, each device keeps its own", async () => {
  const store = new MemoryStore();
  const phone = await device(store, "phone"), laptop = await device(store, "laptop"), tv = await device(store, "tv");
  const id = await phone.game.createProfile("Sam");          /* created and signed in on the phone */
  laptop.game.selectProfile(id);                              /* Sam signs in on the laptop too */
  assert.deepEqual(laptop.current, DEFAULT_LOOK);
  assert.equal(laptop.owners.at(-1), "Sam");

  phone.look.pick({ theme:"hearth" });
  assert.deepEqual(phone.current, L({ theme:"hearth", accent:"graphite" }), "it shows at once on the phone");
  await wait(SAVED);
  assert.deepEqual(laptop.current, L({ theme:"hearth", accent:"graphite" }), "and on the laptop once it's saved");
  laptop.look.pick({ accent:"rose" });
  await wait(SAVED);
  assert.deepEqual(phone.current, L({ theme:"hearth", accent:"rose" }), "and the other way round, merged");
  assert.deepEqual(tv.current, DEFAULT_LOOK, "nobody's signed in on the TV: its own look");
  assert.equal(tv.owners.at(-1), null);

  /* saved on the profile, not the devices */
  assert.deepEqual(cleanLook(phone.game.state.profile(id).look), { theme:"hearth", accent:"rose" });
  assert.equal(phone.storage.get("theme"), null);
  assert.deepEqual(phone.storage.get("lastLook"), L({ theme:"hearth", accent:"rose" }), "the head script's copy");

  /* signing out brings back the device's own look; signing in again, the person's */
  laptop.game.signOut();
  assert.deepEqual(laptop.current, DEFAULT_LOOK);
  laptop.look.pick({ theme:"mist" });                         /* signed out: this device only */
  assert.equal(laptop.storage.get("theme"), "mist");
  await wait(SAVED);
  assert.deepEqual(phone.current, L({ theme:"hearth", accent:"rose" }), "a signed-out pick stays on its device");
  laptop.game.selectProfile(id);
  assert.deepEqual(laptop.current, L({ theme:"hearth", accent:"rose" }));
  laptop.game.signOut();
  assert.deepEqual(laptop.current, L({ theme:"mist", accent:"graphite" }));
  assert.deepEqual(phone.toasts, []);
});

test("the color wheel: a color tried on shows at once but is saved nowhere until Use color; Cancel puts back what was there", async () => {
  const store = new MemoryStore();
  const phone = await device(store, "phone"), laptop = await device(store, "laptop");
  const id = await phone.game.createProfile("Sam");
  laptop.game.selectProfile(id);
  phone.look.pick({ theme:"sand" });
  await wait(SAVED);
  const told = phone.owners.length;
  const tried = { theme:"custom", customTheme:"#1e3a5fff" };

  phone.look.preview(tried);                                  /* let go of the wheel */
  assert.deepEqual(phone.shown.at(-1), L({ ...tried, accent:"graphite" }), "it shows at once");
  assert.deepEqual(phone.current, L({ theme:"sand", accent:"graphite" }), "but it isn't what's picked");
  assert.equal(phone.owners.length, told, "Player Settings isn't told: nothing was picked");
  assert.deepEqual(phone.storage.get("lastLook"), L({ theme:"sand", accent:"graphite" }), "nor kept for the next launch");
  await wait(SAVED);
  assert.deepEqual(laptop.current, L({ theme:"sand", accent:"graphite" }), "nor saved on the profile");

  laptop.look.pick({ accent:"rose" });                        /* a pick on another device meanwhile shows under it */
  await wait(SAVED);
  assert.deepEqual(phone.shown.at(-1), L({ ...tried, accent:"rose" }));

  phone.look.preview(null);                                   /* Cancel */
  assert.deepEqual(phone.shown.at(-1), L({ theme:"sand", accent:"rose" }), "Cancel: what's picked comes back");

  phone.look.preview(tried);                                  /* tried again, then Use color */
  phone.look.pick(tried);
  phone.look.preview(null);
  assert.deepEqual(phone.shown.at(-1), L({ ...tried, accent:"rose" }), "Use color: it stays");
  await wait(SAVED);
  assert.deepEqual(laptop.current, L({ ...tried, accent:"rose" }), "and follows them to their other devices");
  assert.deepEqual(phone.toasts, []);
});

test("a run of picks is saved once, when it settles; signed in, what the person never picked shows the default, not this device's own", async () => {
  const store = new MemoryStore();
  const phone = await device(store, "phone");
  phone.look.pick({ accent:"sea" });                          /* before signing in: this device's accent */
  assert.deepEqual(phone.current, L({ theme:"system", accent:"sea" }));
  const id = await phone.game.createProfile("Ana");
  assert.deepEqual(phone.current, DEFAULT_LOOK, "signed in: Ana's look (she hasn't picked one) — the same on all her devices");
  let saves = 0;
  const transact = store.transact.bind(store);
  store.transact = (path, fn) => { if(String(path).includes("profiles")) saves++; return transact(path, fn); };
  for(const theme of ["light", "sand", "mist", "dark", "hearth"]){   /* arrow keys through the themes, a moment on each */
    phone.look.pick({ theme });
    assert.deepEqual(phone.current, L({ theme }), "each shows at once");
    await wait(200);                                          /* (under the 400 ms: still one run) */
  }
  assert.equal(saves, 0, "nothing saved mid-run");
  await wait(SAVED);
  assert.equal(saves, 1);
  const saved = phone.game.state.profile(id).look;
  assert.equal(saved.theme, "hearth");
  assert.equal(saved.accent, undefined, "the device's accent isn't copied to the profile");
  assert.deepEqual(phone.current, L({ theme:"hearth", accent:"graphite" }));
  /* the same pick again changes nothing on the profile */
  phone.look.pick({ theme:"hearth" });
  await wait(SAVED);
  assert.deepEqual(phone.game.state.profile(id).look, saved);
  assert.equal(await phone.game.saveLook({ theme:"hearth" }), "same");
  phone.game.signOut();
  assert.deepEqual(phone.current, L({ theme:"system", accent:"sea" }), "signed out: the device's own again");
});

test("a pick belongs to whoever made it: signed out, or someone else signed in, before it's saved — it's saved for them and nowhere else", async () => {
  const store = new MemoryStore();
  const tv = await device(store, "tv"), anaPhone = await device(store, "ana");
  const sam = await tv.game.createProfile("Sam");
  const ana = await anaPhone.game.createProfile("Ana");
  tv.look.pick({ theme:"hearth" });
  tv.game.signOut();                                          /* within the 400 ms */
  assert.deepEqual(tv.current, DEFAULT_LOOK, "the TV shows its own look at once");
  await wait(60);
  assert.equal(tv.game.state.profile(sam).look?.theme, "hearth", "saved for Sam straight away");
  assert.equal(tv.storage.get("theme"), null, "the TV doesn't keep it");
  tv.game.selectProfile(sam);
  assert.deepEqual(tv.current, L({ theme:"hearth", accent:"graphite" }));
  tv.look.pick({ accent:"plum" });
  tv.game.selectProfile(ana);                                 /* someone else signs in on the TV, within the 400 ms */
  assert.deepEqual(tv.current, DEFAULT_LOOK, "Ana's look at once — not Sam's pick");
  await wait(SAVED);
  assert.equal(tv.game.state.profile(sam).look?.accent, "plum", "Sam's pick saved for Sam");
  assert.equal(tv.game.state.profile(ana).look, undefined, "Ana's profile untouched");
  assert.deepEqual(anaPhone.current, DEFAULT_LOOK);
  assert.deepEqual(tv.toasts, []);
});

test("a pick made while the last person's is still on its way (a slow connection) is saved for its maker only", async () => {
  const store = new MemoryStore();
  const tv = await device(store, "tv"), anaPhone = await device(store, "ana");
  const sam = await tv.game.createProfile("Sam");
  const ana = await anaPhone.game.createProfile("Ana");
  /* hold each profile's saves until released; count Ana's */
  const gates = new Map(), transact = store.transact.bind(store);
  let anaSaves = 0;
  store.transact = async (path, fn) => {
    if(String(path).includes(ana)) anaSaves++;
    for(const [id, gate] of gates) if(String(path).includes(id)) await gate.promise;
    return transact(path, fn);
  };
  const hold = id => { let release; gates.set(id, { promise:new Promise(r => release = r) }); return () => { gates.delete(id); release(); }; };

  const releaseSam = hold(sam);
  tv.look.pick({ theme:"hearth" });
  tv.game.signOut();                                          /* Sam's pick: on its way, held */
  tv.game.selectProfile(ana);
  const releaseAna = hold(ana);
  tv.look.pick({ accent:"rose" });
  assert.deepEqual(tv.current, L({ theme:"system", accent:"rose" }), "Ana's own look and her pick — not Sam's theme");
  await wait(SAVED);                                          /* Ana's save starts, held too */
  releaseSam();
  await wait(40);
  assert.equal(tv.game.state.profile(sam).look?.theme, "hearth", "Sam's pick saved for Sam");
  tv.look.flush();                                            /* the page is hidden: Ana's is already on its way */
  releaseAna();
  await wait(40);
  assert.deepEqual(cleanLook(tv.game.state.profile(ana).look), { accent:"rose" }, "Ana gets only her own pick");
  assert.equal(anaSaves, 1, "saved once");
  assert.deepEqual(tv.current, L({ theme:"system", accent:"rose" }));
  assert.deepEqual(anaPhone.current, L({ theme:"system", accent:"rose" }));
  assert.deepEqual(tv.toasts, []);
});

test("a second pick while the first is being saved: it shows at once, stays, and both are saved", async () => {
  const store = new MemoryStore();
  const phone = await device(store, "phone");
  const id = await phone.game.createProfile("Max");
  /* only the first save is slow (300 ms): the second's timer is always due before the test's last wait,
     so a stalled runner can't make this fail */
  let slow = 1;
  const transact = store.transact.bind(store);
  store.transact = async (path, fn) => { if(String(path).includes(id) && slow-- > 0) await wait(300); return transact(path, fn); };
  phone.look.pick({ theme:"sand" });
  await wait(SAVED);                                          /* the first save is on its way */
  phone.look.pick({ accent:"forest" });
  assert.deepEqual(phone.current, L({ theme:"sand", accent:"forest" }), "at once");
  await wait(350);                                            /* the first save lands meanwhile */
  assert.equal(cleanLook(phone.game.state.profile(id).look).theme, "sand");
  assert.deepEqual(phone.current, L({ theme:"sand", accent:"forest" }), "no flash back to the first pick alone");
  await wait(SAVED);
  assert.deepEqual(cleanLook(phone.game.state.profile(id).look), { theme:"sand", accent:"forest" });
  assert.deepEqual(phone.current, L({ theme:"sand", accent:"forest" }));
  assert.deepEqual(phone.toasts, []);
});

test("flush() — the page is hidden or closed — saves a waiting pick at once", async () => {
  const store = new MemoryStore();
  const phone = await device(store, "phone");
  const id = await phone.game.createProfile("Lou");
  phone.look.pick({ theme:"mist" });
  phone.look.flush();
  await wait(40);
  assert.equal(phone.game.state.profile(id).look?.theme, "mist");
});

test("before the game data arrives, the last look shows; a pick then is saved for whoever's signed in", async () => {
  const store = new MemoryStore();
  const phone = await device(store, "phone");
  const id = await phone.game.createProfile("Lee");
  phone.look.pick({ theme:"midnight", accent:"plum" });
  await wait(SAVED);

  /* the phone reloads: same storage, nothing loaded yet */
  const identity = new Identity(phone.storage);
  const game = new GameController({ identity, toast:{ show(){} } });
  const shown = [];
  const look = new LookSync({ game, storage:phone.storage, apply:l => shown.push(l) });
  assert.deepEqual(shown, [L({ theme:"midnight", accent:"plum" })], "the last look, before the data");
  look.pick({ accent:"forest" });
  /* (checked once the data's here: a failure before then would leave the save waiting for it, and the run hanging) */
  const beforeData = look.current;
  await game.connect(store);
  assert.deepEqual(beforeData, L({ theme:"midnight", accent:"forest" }), "the pick shows at once");
  await wait(SAVED * 2);
  assert.deepEqual(cleanLook(game.state.profile(id).look), { theme:"midnight", accent:"forest" });
  assert.equal(phone.storage.get("accent"), null, "saved on the profile, not the device");
});

test("a pick while the game data is still loading (the intro, a slow connection): it waits for the data, then is saved, and stays", async () => {
  const store = new MemoryStore();
  const phone = await device(store, "phone");
  const id = await phone.game.createProfile("Lee");

  /* the phone reloads: same storage, nothing loaded yet */
  const game = new GameController({ identity:new Identity(phone.storage), toast:{ show(){} } });
  const look = new LookSync({ game, storage:phone.storage, apply(){} });
  look.pick({ theme:"mist" });
  await wait(SAVED + 150);                                    /* its moment to save comes before the data does */
  const beforeData = look.current;                            /* (checked after connecting: see the test above) */
  await game.connect(store);
  assert.deepEqual(beforeData, L({ theme:"mist", accent:"graphite" }), "it shows while the data loads");
  assert.deepEqual(look.current, L({ theme:"mist", accent:"graphite" }), "still showing once the data's here");
  await wait(SAVED * 2);
  assert.equal(game.state.profile(id).look?.theme, "mist", "saved once the data arrived");
  assert.deepEqual(look.current, L({ theme:"mist", accent:"graphite" }));
  assert.equal(phone.storage.get("theme"), null, "on the profile, not the device");
});

test("a profile removed while a pick waits: the pick stays on this device, and the profile isn't brought back", async () => {
  const store = new MemoryStore();
  const phone = await device(store, "phone"), admin = await device(store, "admin");
  const id = await phone.game.createProfile("Kim");
  phone.look.pick({ theme:"sand" });
  await admin.game.service.removeProfile(id);
  await wait(SAVED);
  assert.equal(phone.game.state.profile(id), null);
  assert.equal(phone.storage.get("theme"), "sand");
  assert.deepEqual(phone.current, L({ theme:"sand", accent:"graphite" }));
  assert.deepEqual(phone.toasts, []);
});

test("a profile removed while its pick is being saved: no toast, and the pick stays on this device", async () => {
  const store = new MemoryStore();
  const phone = await device(store, "phone"), admin = await device(store, "admin");
  const id = await phone.game.createProfile("Kim");
  const transact = store.transact.bind(store);
  store.transact = async (path, fn) => { await wait(150); return transact(path, fn); };   /* a slow connection */
  phone.look.pick({ theme:"sand" });
  await wait(SAVED);                                          /* the save is on its way */
  await admin.game.service.removeProfile(id);
  await wait(250);
  assert.equal(phone.game.state.profile(id), null, "not brought back");
  assert.equal(phone.storage.get("theme"), "sand");
  assert.deepEqual(phone.current, L({ theme:"sand", accent:"graphite" }));
  assert.deepEqual(phone.toasts, []);
});

test("all of Player Settings follow the person: custom colors, the recent ones, map animations and sound effects", async () => {
  const store = new MemoryStore();
  const phone = await device(store, "phone"), laptop = await device(store, "laptop");
  const id = await phone.game.createProfile("Pandi");
  laptop.game.selectProfile(id);
  phone.look.pick({ accent:CUSTOM, customAccent:"#2a5f9e80", recent:addRecent([], "#2a5f9e80") });
  phone.look.pick({ theme:CUSTOM, customTheme:"#335577ff", recent:addRecent(phone.current.recent, "#335577ff") });
  phone.look.pick({ animations:false });
  phone.look.pick({ sounds:false });
  const want = L({ theme:CUSTOM, accent:CUSTOM, customTheme:"#335577ff", customAccent:"#2a5f9e80",
    recent:["#335577ff", "#2a5f9e80"], animations:false, sounds:false });
  assert.deepEqual(phone.current, want, "at once on the phone");
  await wait(SAVED);
  assert.deepEqual(laptop.current, want, "the laptop follows");
  assert.deepEqual(laptop.shown.at(-1), want, "and applies it");
  assert.equal(await phone.game.saveLook({ recent:["#335577ff", "#2a5f9e80"], sounds:false }), "same", "the same list again: nothing to save");
  assert.deepEqual(phone.toasts, []);

  /* signed out: the laptop's own (all defaults); a pick there is kept on the device, each setting under its own key */
  laptop.game.signOut();
  assert.deepEqual(laptop.current, DEFAULT_LOOK);
  laptop.look.pick({ animations:false, recent:["#123456ff"] });
  assert.equal(laptop.storage.get("animations"), false);
  assert.deepEqual(laptop.storage.get("recent"), ["#123456ff"]);
  assert.deepEqual(laptop.current, L({ animations:false, recent:["#123456ff"] }));
  await wait(SAVED);
  assert.deepEqual(cleanLook(phone.game.state.profile(id).look).recent, ["#335577ff", "#2a5f9e80"], "Pandi's list untouched");
  laptop.game.selectProfile(id);
  assert.deepEqual(laptop.current, want, "signed in again: Pandi's");
});
