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
/** The custom properties a selector's block sets (the first block for it). */
function block(selector){
  const at = tokens.indexOf(`${selector}{`);
  assert.ok(at >= 0, `tokens.css has a ${selector} block`);
  const body = tokens.slice(at + selector.length + 1, tokens.indexOf("}", at));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}
const FAMILY = { light:block(':root, [data-scheme="light"]'), dark:block('[data-scheme="dark"]') };
/** A theme's colors: its family's, with its own on top. */
const colorsOf = theme => ({ ...FAMILY[themeById(theme).scheme], ...(["light", "dark"].includes(theme) ? {} : block(`[data-theme="${theme}"]`)) });

const hex = v => { assert.match(v, /^#[0-9A-F]{6}$/i, `a plain color: ${v}`); return v; };
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
    const c = colorsOf(theme.id), dark = theme.scheme === "dark";
    assert.ok(contrast(c["--ink"], c["--surface"]) >= 7, `${theme.id}: ink on a card`);
    assert.ok(contrast(c["--ink-2"], c["--bg"]) >= AA, `${theme.id}: secondary text`);
    for(const a of ACCENTS){
      /* Graphite is the ink itself, with white / the background on it */
      const fill = a.id === "graphite" ? c["--ink"] : block(`[data-accent="${a.id}"]`)[dark ? "--accent-d" : "--accent-l"];
      const onFill = dark ? c["--bg"] : "#FFFFFF";
      const where = `${a.id} in ${theme.id}`;
      assert.ok(contrast(onFill, fill) >= AA, `${where}: a primary button's text (${contrast(onFill, fill).toFixed(2)})`);
      for(const bgKey of ["--bg", "--surface", "--raised"]){
        assert.ok(contrast(fill, c[bgKey]) >= AA, `${where}: the accent as text on ${bgKey} (${contrast(fill, c[bgKey]).toFixed(2)})`);
      }
      const soft = mix(fill, c["--surface"], 0.12);   /* --accent-soft: behind the song playing */
      assert.ok(contrast(fill, soft) >= AA, `${where}: the song playing (${contrast(fill, soft).toFixed(2)})`);
    }
  }
});

test("index.html paints the first frame from the same lists (keep its head script in step with looks.js)", () => {
  const html = read("index.html");
  const fam = JSON.parse(html.match(/var FAM = (\{[^}]*\})/)[1].replace(/(\w+):/g, '"$1":'));
  const acc = JSON.parse(html.match(/var ACC = (\[[^\]]*\])/)[1]);
  assert.deepEqual(fam, Object.fromEntries(THEMES.filter(t => t.scheme).map(t => [t.id, t.scheme])));
  assert.deepEqual(acc, ACCENTS.filter(a => a.id !== DEFAULT_LOOK.accent).map(a => a.id));
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

test("a run of picks is saved once, when it settles; a field never picked falls back to the device's own", async () => {
  const store = new MemoryStore();
  const phone = await device(store, "phone");
  phone.look.pick({ accent:"sea" });                          /* before signing in: this device's accent */
  const id = await phone.game.createProfile("Ana");
  let saves = 0;
  const transact = store.transact.bind(store);
  store.transact = (path, fn) => { if(String(path).includes("profiles")) saves++; return transact(path, fn); };
  for(const theme of ["light", "sand", "mist", "dark", "hearth"]) phone.look.pick({ theme });   /* arrow keys through the themes */
  assert.deepEqual(phone.current, { theme:"hearth", accent:"sea" });
  await wait(SAVED);
  assert.equal(saves, 1);
  const saved = phone.game.state.profile(id).look;
  assert.equal(saved.theme, "hearth");
  assert.equal(saved.accent, undefined, "the device's accent isn't copied to the profile");
  assert.deepEqual(phone.current, { theme:"hearth", accent:"sea" });
  /* the same pick again changes nothing on the profile */
  phone.look.pick({ theme:"hearth" });
  await wait(SAVED);
  assert.deepEqual(phone.game.state.profile(id).look, saved);
  assert.equal(await phone.game.saveLook({ theme:"hearth" }), false);
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
  assert.deepEqual(look.current, { theme:"midnight", accent:"forest" });
  await game.connect(store);
  await wait(SAVED * 2);
  assert.deepEqual(cleanLook(game.state.profile(id).look), { theme:"midnight", accent:"forest" });
  assert.equal(phone.storage.get("accent"), null, "saved on the profile, not the device");
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
