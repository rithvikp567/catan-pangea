/* The look — themes and accent colors (game/looks.js), their colors
   (css/tokens.css), the first-frame copy of the lists (index.html), and how
   a person's pick follows them from device to device (app/LookSync.js over
   GameController, on one shared store). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  THEMES, ACCENTS, DEFAULT_LOOK, themeById, accentById, cleanLook, resolveLook, schemeOf, flipTheme, sameLook,
} from "../catan-pangea/src/game/looks.js";
import { MemoryStore } from "../catan-pangea/src/sync/MemoryStore.js";
import { SafeStorage } from "../catan-pangea/src/app/storage.js";
import { Identity } from "../catan-pangea/src/app/Identity.js";
import { GameController } from "../catan-pangea/src/app/GameController.js";
import { LookSync } from "../catan-pangea/src/app/LookSync.js";

const read = rel => readFileSync(new URL(`../catan-pangea/${rel}`, import.meta.url), "utf8");

/* ---------------- the lists ---------------- */

test("themes: two families of three, each theme paired with one in the other family; Match device on top", () => {
  assert.equal(new Set(THEMES.map(t => t.id)).size, THEMES.length);
  assert.equal(THEMES[0].id, "system");
  assert.equal(THEMES[0].scheme, null);
  const rest = THEMES.slice(1);
  assert.deepEqual(rest.filter(t => t.scheme === "light").map(t => t.id), ["light", "sand", "mist"]);
  assert.deepEqual(rest.filter(t => t.scheme === "dark").map(t => t.id), ["dark", "hearth", "midnight"]);
  for(const t of rest){
    const pair = themeById(t.pair);
    assert.ok(pair, `${t.id} has a partner`);
    assert.notEqual(pair.scheme, t.scheme, `${t.id}'s partner is in the other family`);
    assert.equal(pair.pair, t.id, `${t.id} ⇄ ${pair.id}`);
  }
  assert.equal(new Set(ACCENTS.map(a => a.id)).size, ACCENTS.length);
  assert.equal(ACCENTS[0].id, "graphite", "Graphite (the original look) first");
  assert.ok(themeById(DEFAULT_LOOK.theme) && accentById(DEFAULT_LOOK.accent));
});

test("cleanLook keeps known ids only; resolveLook: the profile's pick, else the device's, else the default — field by field", () => {
  assert.deepEqual(cleanLook({ theme:"sand", accent:"rose", at:5, extra:1 }), { theme:"sand", accent:"rose" });
  assert.deepEqual(cleanLook({ theme:"neon", accent:7 }), {});
  for(const junk of [null, undefined, "sand", 3, []]) assert.deepEqual(cleanLook(junk), {});
  assert.deepEqual(resolveLook(null, null), DEFAULT_LOOK);
  assert.deepEqual(resolveLook(null, { theme:"mist" }), { theme:"mist", accent:"graphite" });
  assert.deepEqual(resolveLook({ accent:"plum" }, { theme:"mist", accent:"sea" }), { theme:"mist", accent:"plum" });
  assert.deepEqual(resolveLook({ theme:"hearth", accent:"wheat", at:1 }, { theme:"mist" }), { theme:"hearth", accent:"wheat" });
  assert.deepEqual(resolveLook({ theme:"from-a-newer-app" }, { theme:"sand" }), { theme:"sand", accent:"graphite" });
  assert.ok(sameLook({ theme:"sand", accent:"sea" }, { theme:"sand", accent:"sea", at:9 }));
  assert.ok(!sameLook(null, DEFAULT_LOOK));
});

test("schemeOf and the light / dark switch: a theme's partner; Match device flips to the opposite of what shows", () => {
  assert.equal(schemeOf("sand", true), "light");
  assert.equal(schemeOf("system", true), "dark");
  assert.equal(schemeOf("system", false), "light");
  assert.equal(flipTheme("sand", false), "hearth");
  assert.equal(flipTheme("midnight", false), "mist");
  assert.equal(flipTheme("light", true), "dark");
  assert.equal(flipTheme("system", true), "light");
  assert.equal(flipTheme("system", false), "dark");
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
  assert.deepEqual(phone.current, { theme:"hearth", accent:"graphite" }, "it shows at once on the phone");
  await wait(SAVED);
  assert.deepEqual(laptop.current, { theme:"hearth", accent:"graphite" }, "and on the laptop once it's saved");
  laptop.look.pick({ accent:"rose" });
  await wait(SAVED);
  assert.deepEqual(phone.current, { theme:"hearth", accent:"rose" }, "and the other way round, merged");
  assert.deepEqual(tv.current, DEFAULT_LOOK, "nobody's signed in on the TV: its own look");
  assert.equal(tv.owners.at(-1), null);

  /* saved on the profile, not the devices */
  assert.deepEqual(cleanLook(phone.game.state.profile(id).look), { theme:"hearth", accent:"rose" });
  assert.equal(phone.storage.get("theme"), null);
  assert.deepEqual(phone.storage.get("lastLook"), { theme:"hearth", accent:"rose" }, "the head script's copy");

  /* signing out brings back the device's own look; signing in again, the person's */
  laptop.game.signOut();
  assert.deepEqual(laptop.current, DEFAULT_LOOK);
  laptop.look.pick({ theme:"mist" });                         /* signed out: this device only */
  assert.equal(laptop.storage.get("theme"), "mist");
  await wait(SAVED);
  assert.deepEqual(phone.current, { theme:"hearth", accent:"rose" }, "a signed-out pick stays on its device");
  laptop.game.selectProfile(id);
  assert.deepEqual(laptop.current, { theme:"hearth", accent:"rose" });
  laptop.game.signOut();
  assert.deepEqual(laptop.current, { theme:"mist", accent:"graphite" });
  assert.deepEqual(phone.toasts, []);
});

test("a run of picks is saved once, when it settles; signed in, what the person never picked shows the default, not this device's own", async () => {
  const store = new MemoryStore();
  const phone = await device(store, "phone");
  phone.look.pick({ accent:"sea" });                          /* before signing in: this device's accent */
  assert.deepEqual(phone.current, { theme:"system", accent:"sea" });
  const id = await phone.game.createProfile("Ana");
  assert.deepEqual(phone.current, DEFAULT_LOOK, "signed in: Ana's look (she hasn't picked one) — the same on all her devices");
  let saves = 0;
  const transact = store.transact.bind(store);
  store.transact = (path, fn) => { if(String(path).includes("profiles")) saves++; return transact(path, fn); };
  for(const theme of ["light", "sand", "mist", "dark", "hearth"]){   /* arrow keys through the themes, a moment on each */
    phone.look.pick({ theme });
    assert.deepEqual(phone.current, { theme, accent:"graphite" }, "each shows at once");
    await wait(200);                                          /* (under the 400 ms: still one run) */
  }
  assert.equal(saves, 0, "nothing saved mid-run");
  await wait(SAVED);
  assert.equal(saves, 1);
  const saved = phone.game.state.profile(id).look;
  assert.equal(saved.theme, "hearth");
  assert.equal(saved.accent, undefined, "the device's accent isn't copied to the profile");
  assert.deepEqual(phone.current, { theme:"hearth", accent:"graphite" });
  /* the same pick again changes nothing on the profile */
  phone.look.pick({ theme:"hearth" });
  await wait(SAVED);
  assert.deepEqual(phone.game.state.profile(id).look, saved);
  assert.equal(await phone.game.saveLook({ theme:"hearth" }), "same");
  phone.game.signOut();
  assert.deepEqual(phone.current, { theme:"system", accent:"sea" }, "signed out: the device's own again");
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
  assert.deepEqual(tv.current, { theme:"hearth", accent:"graphite" });
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
  assert.deepEqual(tv.current, { theme:"system", accent:"rose" }, "Ana's own look and her pick — not Sam's theme");
  await wait(SAVED);                                          /* Ana's save starts, held too */
  releaseSam();
  await wait(40);
  assert.equal(tv.game.state.profile(sam).look?.theme, "hearth", "Sam's pick saved for Sam");
  tv.look.flush();                                            /* the page is hidden: Ana's is already on its way */
  releaseAna();
  await wait(40);
  assert.deepEqual(cleanLook(tv.game.state.profile(ana).look), { accent:"rose" }, "Ana gets only her own pick");
  assert.equal(anaSaves, 1, "saved once");
  assert.deepEqual(tv.current, { theme:"system", accent:"rose" });
  assert.deepEqual(anaPhone.current, { theme:"system", accent:"rose" });
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
  assert.deepEqual(phone.current, { theme:"sand", accent:"forest" }, "at once");
  await wait(350);                                            /* the first save lands meanwhile */
  assert.equal(cleanLook(phone.game.state.profile(id).look).theme, "sand");
  assert.deepEqual(phone.current, { theme:"sand", accent:"forest" }, "no flash back to the first pick alone");
  await wait(SAVED);
  assert.deepEqual(cleanLook(phone.game.state.profile(id).look), { theme:"sand", accent:"forest" });
  assert.deepEqual(phone.current, { theme:"sand", accent:"forest" });
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
  assert.deepEqual(shown, [{ theme:"midnight", accent:"plum" }], "the last look, before the data");
  look.pick({ accent:"forest" });
  /* (checked once the data's here: a failure before then would leave the save waiting for it, and the run hanging) */
  const beforeData = look.current;
  await game.connect(store);
  assert.deepEqual(beforeData, { theme:"midnight", accent:"forest" }, "the pick shows at once");
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
  assert.deepEqual(beforeData, { theme:"mist", accent:"graphite" }, "it shows while the data loads");
  assert.deepEqual(look.current, { theme:"mist", accent:"graphite" }, "still showing once the data's here");
  await wait(SAVED * 2);
  assert.equal(game.state.profile(id).look?.theme, "mist", "saved once the data arrived");
  assert.deepEqual(look.current, { theme:"mist", accent:"graphite" });
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
  assert.deepEqual(phone.current, { theme:"sand", accent:"graphite" });
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
  assert.deepEqual(phone.current, { theme:"sand", accent:"graphite" });
  assert.deepEqual(phone.toasts, []);
});
