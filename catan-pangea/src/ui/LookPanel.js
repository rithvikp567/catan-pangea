/**
 * Settings → Accent color and Theme, under the map's settings. Like
 * SettingsPanel it only reports picks (`onPick` → app/LookSync, which shows
 * and saves them) and reflects the look it's given (`sync`); a look is
 * never part of the map's settings (those go out to every phone with each
 * new map).
 *
 * Each swatch and theme preview carries its own data-accent / data-scheme /
 * data-theme, so css/tokens.css colors it as itself — no colors here.
 */
import { h } from "./dom.js";
import { SegmentedControl } from "./controls.js";
import { THEMES, ACCENTS, themeById, accentById } from "../game/looks.js";

export class LookPanel {
  /**
   * @param {HTMLElement} root
   * @param {{ onPick:(patch:{ theme?:string, accent?:string }) => void }} p
   */
  constructor(root, { onPick }){
    this.accentName = h("span", { class:"look-value", "aria-hidden":"true" });
    this.themeName = h("span", { class:"look-value", "aria-hidden":"true" });
    this.where = h("p", { class:"field-hint look-where", id:"lookWhere" });
    this.accent = new SegmentedControl({
      label:"Accent color", value:null,
      options:ACCENTS.map(a => ({ value:a.id, label:a.label })),
      className:"accent-grid", optionClass:"accent-choice",
      attrs:o => ({ "aria-label":o.label, title:o.label, "data-accent":o.value }),
      render:() => h("span", { class:"accent-dot", "aria-hidden":"true" }),
      onChange:accent => onPick({ accent }),
    });
    this.theme = new SegmentedControl({
      label:"Theme", value:null,
      options:THEMES.map(t => ({ value:t.id, label:t.label, scheme:t.scheme })),
      className:"theme-grid", optionClass:"theme-choice",
      attrs:o => ({
        "data-theme-id":o.value,
        "aria-label":o.scheme ? null : `${o.label}: Light or Dark, as this device is set`,
      }),
      render:o => [
        h("span", { class:"theme-thumb", "aria-hidden":"true" },
          o.scheme ? preview(o.scheme, o.value) : [preview("light", "light"), preview("dark", "dark")]),
        h("span", { class:"theme-name" }, o.label),
      ],
      onChange:theme => onPick({ theme }),
    });
    /* where picks are saved: read once per group, not on every swatch */
    for(const group of [this.accent.el, this.theme.el]) group.setAttribute("aria-describedby", "lookWhere");
    root.replaceChildren(
      h("div", { class:"group look-group" },
        h("div", { class:"look-head" }, h("h3", { class:"section-title" }, "Accent color"), this.accentName),
        this.accent.el),
      h("div", { class:"group look-group" },
        h("div", { class:"look-head" }, h("h3", { class:"section-title" }, "Theme"), this.themeName),
        this.theme.el,
        this.where),
    );
  }

  /**
   * @param {{ theme:string, accent:string }} look
   * @param {string|null} owner  the signed-in person (their picks follow them), or null: this device's own
   */
  sync(look, owner){
    this.accent.set(look.accent);
    this.theme.set(look.theme);
    this.accentName.textContent = accentById(look.accent)?.label ?? "";
    this.themeName.textContent = themeById(look.theme)?.label ?? "";
    /* signed out, a pick stays on this device; signing in shows the person's own look instead
       (it never takes this device's along — app/LookSync) */
    this.where.textContent = owner
      ? `Saved for ${owner} — it follows you to every device you sign in on.`
      : "Saved on this device only. Signed in, you get your own theme and accent instead — saved with your profile, the same on every device.";
  }
}

/** A tiny picture of a theme: its background, a card, a stripe of the accent. */
function preview(scheme, theme){
  return h("span", { class:"theme-mini", "data-scheme":scheme, "data-theme":theme }, h("i"));
}
