/**
 * Settings → Player Settings: a drop-down (like Advanced) with each
 * person's own settings — Accent color and Theme (the lists, or a custom
 * color off the color wheel: ui/ColorPicker), Map animations and Sound
 * effects. Like SettingsPanel it only reports picks (`onPick` →
 * app/LookSync, which shows and saves them on the person's profile, so
 * they follow them to every device) and reflects the settings it's given
 * (`sync`); none of it is part of the map's settings (those go out to
 * every phone with each new map).
 *
 * A custom color shows on the whole app as it's picked — each time the
 * wheel (or a slider) is let go — but is only picked, and saved, with Use
 * color; Cancel puts back what was there (`onTry` → LookSync.preview).
 *
 * Each swatch and theme preview carries its own data-accent / data-scheme /
 * data-theme, so css/tokens.css colors it as itself; a custom one gets its
 * colors from game/colors.js as properties.
 */
import { h } from "./dom.js";
import { SegmentedControl, Toggle } from "./controls.js";
import { animateDetails } from "./SettingsPanel.js";
import { ColorPicker, css } from "./ColorPicker.js";
import { THEMES, ACCENTS, CUSTOM, themeById, accentById } from "../game/looks.js";
import { customTheme, customAccent, addRecent, normalHex } from "../game/colors.js";

export class PlayerSettings {
  /**
   * @param {HTMLElement} root
   * @param {object} p
   * @param {(patch:object) => void} p.onPick   some fields of a look (game/looks.js)
   * @param {(patch:object|null) => void} [p.onTry]  show a look without picking it (null: back to what's picked)
   * @param {() => "light"|"dark"} p.scheme      what the device is set to (the default theme follows it)
   */
  constructor(root, { onPick, onTry = () => {}, scheme }){
    this.onPick = onPick;
    this.onTry = onTry;
    this.scheme = scheme;
    this.look = null;
    this.picker = null;          /* made the first time it's needed */

    this.accentName = h("span", { class:"look-value", "aria-hidden":"true" });
    this.themeName = h("span", { class:"look-value", "aria-hidden":"true" });
    this.accent = new SegmentedControl({
      label:"Accent color", value:null,
      options:ACCENTS.map(a => ({ value:a.id, label:a.label })),
      className:"accent-grid", optionClass:"accent-choice",
      attrs:o => ({ "aria-label":o.label, title:o.label, "data-accent":o.value }),
      render:() => h("span", { class:"accent-dot", "aria-hidden":"true" }),
      onChange:accent => onPick({ accent }),
    });
    this.accentDot = h("span", { class:"accent-dot is-custom", "aria-hidden":"true" });
    this.accentCustom = h("button", {
      type:"button", class:"accent-choice accent-custom", "data-accent":CUSTOM, "aria-pressed":"false",
      "aria-label":"Custom accent color…", title:"Custom color", onClick:() => this.#pickAccent(),
    }, this.accentDot);

    this.theme = new SegmentedControl({
      label:"Theme", value:null,
      options:THEMES.map(t => ({ value:t.id, label:t.label, scheme:t.scheme })),
      className:"theme-grid", optionClass:"theme-choice",
      attrs:o => ({ "data-theme-id":o.value }),
      render:o => [
        h("span", { class:"theme-thumb", "aria-hidden":"true" }, preview(o.scheme, o.value)),
        h("span", { class:"theme-name" }, o.label),
      ],
      onChange:theme => onPick({ theme }),
      /* someone who never picked a theme sees their device's Light or Dark as picked: a tap on it saves it,
         so their other devices show it too (whatever they're set to) */
      onSame:theme => { if(this.look && this.look.theme !== theme) onPick({ theme }); },
    });
    this.themeMini = h("span", { class:"theme-mini is-custom" }, h("i"));
    this.themeCustom = h("button", {
      type:"button", class:"theme-choice theme-custom", "aria-pressed":"false",
      "aria-label":"Custom theme color…", onClick:() => this.#pickTheme(),
    },
      h("span", { class:"theme-thumb", "aria-hidden":"true" }, this.themeMini),
      h("span", { class:"theme-name" }, "Custom"),
      h("span", { class:"theme-hint", "aria-hidden":"true" }, "Any color"));

    this.animations = new Toggle({ label:"Map animations", onChange:on => onPick({ animations:on }) });
    this.sounds = new Toggle({ label:"Sound effects", onChange:on => onPick({ sounds:on }) });

    const details = h("details", { class:"advanced player-settings" },
      h("summary", {}, "Player Settings"),
      h("div", { class:"group" },
        h("div", { class:"look-group" },
          h("div", { class:"look-head" }, h("h3", { class:"section-title" }, "Accent color"), this.accentName),
          h("div", { class:"accent-row" }, this.accent.el, this.accentCustom)),
        h("div", { class:"look-group" },
          h("div", { class:"look-head" }, h("h3", { class:"section-title" }, "Theme"), this.themeName),
          this.theme.el,
          this.themeCustom),
        h("div", { class:"look-group look-toggles" }, this.animations.el, this.sounds.el)));
    animateDetails(details);
    root.replaceChildren(details);
  }

  /**
   * @param {object} look  the settings applying now (a whole look, game/looks.js)
   */
  sync(look){
    this.look = look;
    /* someone who never picked a theme sees Light or Dark, as their device is set: that one shows picked */
    const theme = themeById(look.theme) || look.theme === CUSTOM ? look.theme : this.scheme();
    this.accent.set(look.accent);
    this.theme.set(theme);
    const customA = look.accent === CUSTOM, customT = theme === CUSTOM;
    this.accentCustom.setAttribute("aria-pressed", String(customA));
    this.themeCustom.setAttribute("aria-pressed", String(customT));
    this.accentName.textContent = customA ? "Custom" : accentById(look.accent)?.label ?? "";
    this.themeName.textContent = customT ? "Custom" : themeById(theme)?.label ?? "";
    /* the custom swatch and tile in the person's custom color (a rainbow until they've picked one) */
    this.accentDot.style.cssText = look.customAccent ? `--accent-l:${css(look.customAccent)};--accent-d:${css(look.customAccent)}` : "";
    this.accentDot.classList.toggle("is-empty", !look.customAccent);
    paintTheme(this.themeMini, look.customTheme);
    this.animations.set(look.animations);
    this.sounds.set(look.sounds);
  }

  async #pickAccent(){
    const look = this.look;
    const hex = await this.#picker().open({
      title:"Custom accent color", value:look?.customAccent ?? null, recent:look?.recent ?? [],
      preview:(el, value) => accentPreview(el, value),
      onTry:value => this.onTry({ accent:CUSTOM, customAccent:value }),
    });
    if(hex) this.onPick({ accent:CUSTOM, customAccent:hex, recent:addRecent(this.look?.recent, hex) });
    this.onTry(null);             /* (picked: it shows as picked now; cancelled: what was there comes back) */
    this.accentCustom.focus({ preventScroll:true });
  }

  async #pickTheme(){
    const look = this.look;
    const hex = await this.#picker().open({
      title:"Custom theme color", value:look?.customTheme ?? null, recent:look?.recent ?? [],
      preview:(el, value) => themePreview(el, value, scheme => this.#accentFill(scheme)),
      onTry:value => this.onTry({ theme:CUSTOM, customTheme:value }),
    });
    if(hex) this.onPick({ theme:CUSTOM, customTheme:hex, recent:addRecent(this.look?.recent, hex) });
    this.onTry(null);
    this.themeCustom.focus({ preventScroll:true });
  }

  #picker(){ return this.picker ??= new ColorPicker(); }

  /**
   * The accent's fill as it would show on a theme of this family ("#rrggbbaa"), for the theme preview:
   * the custom one, or a preset's from tokens.css (read off its own swatch); null for Graphite.
   */
  #accentFill(scheme){
    const look = this.look;
    if(!look) return null;
    if(look.accent === CUSTOM) return look.customAccent ?? null;
    const i = ACCENTS.findIndex(a => a.id === look.accent);
    if(i < 0 || look.accent === ACCENTS[0].id) return null;
    const value = getComputedStyle(this.accent.buttons[i]).getPropertyValue(scheme === "dark" ? "--accent-d" : "--accent-l").trim();
    return normalHex(value);
  }
}

/** A tiny picture of a theme: its background, a card, a stripe of the accent. */
function preview(scheme, theme){
  return h("span", { class:"theme-mini", "data-scheme":scheme, "data-theme":theme }, h("i"));
}

/** A custom theme's colors on an element (none: a rainbow, css). */
function paintTheme(el, hex){
  el.style.cssText = "";
  el.classList.toggle("is-empty", !hex);
  if(!hex){ delete el.dataset.scheme; return; }
  const { scheme, vars } = customTheme(hex);
  el.dataset.scheme = scheme;
  el.dataset.theme = CUSTOM;
  for(const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
}

/**
 * The picker's preview for a theme: the page, a card on it with a line of text, the accent — the
 * person's accent worked out for this theme, as ThemeController would (`accentFill(scheme)`: its fill).
 */
function themePreview(el, hex, accentFill){
  if(!el.firstChild) el.append(h("span", { class:"pv-page" }, h("span", { class:"pv-card" }, h("b", {}, "Pangaea"), h("span", {}, "Settings")), h("span", { class:"pv-btn" }, "New map")));
  const page = el.firstChild;
  page.style.cssText = "";
  const { scheme, vars } = customTheme(hex);
  page.dataset.scheme = scheme;
  const fill = accentFill(scheme);
  const acc = fill ? customAccent(fill, { bg:vars["--bg"], surface:vars["--surface"], raised:vars["--raised"], ink:vars["--ink"], scheme }) : {};
  /* (--accent too: data-scheme on the page works it out again from --accent-l / -d) */
  for(const [k, v] of Object.entries({ ...vars, ...acc, ...(fill ? { "--accent":acc["--accent-l"] } : {}) })) page.style.setProperty(k, v);
}

/** The picker's preview for an accent: a filled button and a picked choice, on this theme's card. */
function accentPreview(el, hex){
  if(!el.firstChild) el.append(h("span", { class:"pv-page is-accent" }, h("span", { class:"pv-btn" }, "New map"), h("span", { class:"pv-pick" }, "Picked")));
  const page = el.firstChild, cs = getComputedStyle(document.documentElement), get = k => cs.getPropertyValue(k).trim();
  const theme = { bg:get("--bg"), surface:get("--surface"), raised:get("--raised"), ink:get("--ink"), scheme:document.documentElement.dataset.scheme };
  /* (--accent itself too: on <html> it was worked out from the accent showing there) */
  const vars = customAccent(hex, theme);
  for(const [k, v] of Object.entries({ ...vars, "--accent":vars["--accent-l"] })) page.style.setProperty(k, v);
}

