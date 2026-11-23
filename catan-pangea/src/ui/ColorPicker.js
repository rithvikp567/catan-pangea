/**
 * The custom color pop-up (Player Settings → a custom accent or theme): a
 * color wheel — hue round it, saturation out from the middle — with a
 * Brightness slider under it, an Opacity slider (how see-through the color
 * is), the color as hex, a preview, and the person's last five custom
 * colors (tap one to start from it). `open()` resolves with the color
 * picked ("#rrggbbaa") or null. Each time a color is settled on — the
 * wheel or a slider let go, a hex entered, a recent color tapped, the arrow
 * keys let go — `onTry` hears it, so the app can show it before Use color.
 *
 * It's a modal <dialog>, laid out around the open music player like every
 * overlay (css/app.css "color picker"): never over the YouTube player.
 */
import { h } from "./dom.js";
import { normalHex, parseHex, toHex, toHex6, hsvToRgb, rgbToHsv } from "../game/colors.js";

/** The Opacity slider's floor: a color nobody can see isn't one. */
const MIN_ALPHA = 0.05;

const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

export class ColorPicker {
  constructor(){
    this.hsv = { h:0, s:0, v:1 };
    this.alpha = 1;
    this.resolve = null;
    this.paintPreview = () => {};
    this.onTry = () => {};
    this.tried = null;

    this.title = h("h2", { class:"picker-title", id:"pickerTitle" });
    const close = h("button", { type:"button", class:"icon-btn", "aria-label":"Close", onClick:() => this.#finish(null) });
    close.innerHTML = CLOSE_ICON;     /* static, trusted markup */

    /* the wheel: the knob is the slider (arrow keys: ←→ hue, ↑↓ saturation) */
    this.knob = h("span", {
      class:"picker-knob", role:"slider", tabindex:"0", "aria-label":"Color wheel: hue and saturation",
      "aria-valuemin":"0", "aria-valuemax":"360", onKeydown:e => this.#wheelKey(e),
      onKeyup:e => { if(e.key.startsWith("Arrow")) this.#try(); },
    });
    this.shade = h("span", { class:"picker-shade", "aria-hidden":"true" });
    this.wheel = h("div", { class:"picker-wheel" }, this.shade, this.knob);
    this.wheel.addEventListener("pointerdown", e => this.#wheelDown(e));

    this.bright = h("input", { type:"range", min:"0", max:"100", step:"1", class:"picker-range picker-bright", "aria-label":"Brightness",
      onInput:() => { this.hsv.v = this.bright.value / 100; this.#paint(); }, onChange:() => this.#try() });
    this.opacity = h("input", { type:"range", min:"5", max:"100", step:"1", class:"picker-range picker-alpha", "aria-label":"Opacity",
      onInput:() => { this.alpha = this.opacity.value / 100; this.#paint(); }, onChange:() => this.#try() });
    this.alphaOut = h("output", { class:"picker-alpha-out num" });

    this.hex = h("input", {
      type:"text", class:"picker-hex", maxlength:"9", spellcheck:"false", autocomplete:"off", autocapitalize:"off",
      "aria-label":"Hex color", onChange:() => this.#typed(), onKeydown:e => { if(e.key === "Enter"){ e.preventDefault(); this.#typed(); } },
    });
    this.preview = h("div", { class:"picker-preview", "aria-hidden":"true" });
    this.recentRow = h("div", { class:"picker-recent-row" });
    this.recentBox = h("div", { class:"picker-recent" }, h("span", { class:"field-label" }, "Recent"), this.recentRow);

    this.use = h("button", { type:"button", class:"btn primary", onClick:() => this.#finish(this.value) }, "Use color");
    this.el = h("dialog", { class:"picker", "aria-labelledby":"pickerTitle" },
      h("div", { class:"picker-head" }, this.title, close),
      h("div", { class:"picker-body" },
        this.wheel,
        h("label", { class:"picker-field" }, h("span", { class:"field-label" }, "Brightness"), this.bright),
        h("label", { class:"picker-field" },
          h("span", { class:"picker-field-head" }, h("span", { class:"field-label" }, "Opacity"), this.alphaOut),
          this.opacity),
        h("div", { class:"picker-out" }, this.preview, this.hex),
        this.recentBox),
      h("div", { class:"picker-foot" },
        h("button", { type:"button", class:"btn", onClick:() => this.#finish(null) }, "Cancel"),
        this.use));
    /* Esc closes the pop-up only, not the settings sheet under it */
    this.el.addEventListener("keydown", e => { if(e.key === "Escape") e.stopPropagation(); });
    this.el.addEventListener("cancel", e => { e.preventDefault(); this.#finish(null); });
    /* a tap outside the card — pressed and let go there (a drag that ends outside, selecting the hex, doesn't count) */
    this.el.addEventListener("pointerdown", e => { this.downOutside = e.target === this.el; });
    this.el.addEventListener("click", e => { if(e.target === this.el && this.downOutside) this.#finish(null); this.downOutside = false; });
    document.body.append(this.el);
  }

  /** The color as picked now: "#rrggbbaa". */
  get value(){ return toHex({ ...hsvToRgb(this.hsv), a:this.alpha }); }

  /**
   * @param {object} p
   * @param {string} p.title
   * @param {string|null} [p.value]     the color to start from ("#rrggbbaa")
   * @param {string[]} [p.recent]       the person's last custom colors, newest first
   * @param {(el:HTMLElement, hex:string) => void} [p.preview]  draw the preview of a color
   * @param {(hex:string) => void} [p.onTry]  a color settled on (not picked yet: that's Use color)
   * @returns {Promise<string|null>}
   */
  open({ title, value = null, recent = [], preview = () => {}, onTry = () => {} }){
    this.#finish(null);
    this.title.textContent = title;
    this.paintPreview = preview;
    this.onTry = onTry;
    this.tried = null;
    this.preview.replaceChildren();          /* (each kind draws its own: an accent's and a theme's differ) */
    this.#load(value ?? recent[0] ?? "#2a5f9eff");
    this.recentBox.hidden = !recent.length;
    this.recentRow.replaceChildren(...recent.map(hex => {
      const b = h("button", { type:"button", class:"picker-swatch", "aria-label":`Recent color ${hex.slice(0, 7)}${hex.endsWith("ff") ? "" : `, ${Math.round(parseHex(hex).a * 100)}% opacity`}`,
        title:hex.slice(0, 7), onClick:() => { this.#load(hex); this.#try(); } }, h("i", { style:`background:${css(hex)}` }));
      return b;
    }));
    this.el.showModal();
    this.knob.focus({ preventScroll:true });
    return new Promise(r => { this.resolve = r; });
  }

  /** Show the color as it is now on the app (once per color), before it's picked. */
  #try(){
    if(!this.resolve) return;
    const hex = this.value;
    if(hex === this.tried) return;
    this.tried = hex;
    this.onTry(hex);
  }

  #finish(result){
    const r = this.resolve;
    this.resolve = null;
    if(this.el.open) this.el.close();
    r?.(result);
  }

  #load(hex){
    const c = parseHex(hex);
    this.hsv = rgbToHsv(c);
    this.alpha = Math.min(1, Math.max(MIN_ALPHA, c.a));   /* (a typed or older color too: never under the slider's floor) */
    this.#paint();
  }

  #typed(){
    const raw = this.hex.value.trim(), hex = normalHex(raw.startsWith("#") ? raw : `#${raw}`);
    if(!hex){ this.#paint(); return; }
    /* a 6-digit color keeps the opacity set below */
    const c = parseHex(hex), keep = /^#?[0-9a-f]{3}$|^#?[0-9a-f]{6}$/i.test(raw);
    this.#load(toHex({ ...c, a:keep ? this.alpha : c.a }));
    this.#showHex();          /* (as it's used: written out in full, the opacity floor applied) */
    this.#try();
  }

  #showHex(){
    const hex = this.value;
    this.hex.value = hex.endsWith("ff") ? hex.slice(0, 7) : hex;
  }

  #paint(){
    const { h:hue, s, v } = this.hsv, rgb = hsvToRgb(this.hsv), full = hsvToRgb({ h:hue, s, v:1 });
    /* the knob: hue as its angle from the top, clockwise (the wheel's conic gradient), saturation as its distance out */
    const a = hue * Math.PI / 180;
    this.knob.style.left = `${50 + Math.sin(a) * s * 50}%`;
    this.knob.style.top = `${50 - Math.cos(a) * s * 50}%`;
    this.knob.style.background = toHex6(rgb);
    this.knob.setAttribute("aria-valuenow", String(Math.round(hue)));
    this.knob.setAttribute("aria-valuetext", `Hue ${Math.round(hue)}°, saturation ${Math.round(s * 100)}%`);
    this.shade.style.opacity = String(1 - v);          /* the wheel darkens with the brightness */
    this.bright.value = String(Math.round(v * 100));
    this.bright.style.setProperty("--to", toHex6(full));
    this.opacity.value = String(Math.round(this.alpha * 100));
    this.opacity.style.setProperty("--to", toHex6(rgb));
    this.alphaOut.textContent = `${Math.round(this.alpha * 100)}%`;
    if(document.activeElement !== this.hex) this.#showHex();     /* (not while it's being typed in) */
    this.paintPreview(this.preview, this.value);
  }

  #wheelDown(e){
    if(e.button !== 0) return;
    e.preventDefault();
    this.knob.focus({ preventScroll:true });
    const move = ev => {
      const r = this.wheel.getBoundingClientRect(), x = ev.clientX - (r.left + r.width / 2), y = ev.clientY - (r.top + r.height / 2);
      const hue = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
      this.hsv = { ...this.hsv, h:hue, s:Math.min(1, Math.hypot(x, y) / (r.width / 2)) };
      if(this.hsv.v < 0.15) this.hsv.v = 1;              /* (picking on a black wheel would show nothing happening) */
      this.#paint();
    };
    move(e);
    this.wheel.setPointerCapture?.(e.pointerId);
    /* let go: the color shows on the app (picked only with Use color) */
    const up = () => { this.wheel.removeEventListener("pointermove", move); this.wheel.removeEventListener("pointerup", up); this.wheel.removeEventListener("pointercancel", up); this.#try(); };
    this.wheel.addEventListener("pointermove", move);
    this.wheel.addEventListener("pointerup", up);
    this.wheel.addEventListener("pointercancel", up);
  }

  #wheelKey(e){
    const big = e.shiftKey ? 3 : 1;
    const d = { ArrowLeft:[-5, 0], ArrowRight:[5, 0], ArrowUp:[0, 0.05], ArrowDown:[0, -0.05] }[e.key];
    if(!d) return;
    e.preventDefault();
    this.hsv = { ...this.hsv, h:(this.hsv.h + d[0] * big + 360) % 360, s:Math.max(0, Math.min(1, this.hsv.s + d[1] * big)) };
    this.#paint();
  }
}

/** A "#rrggbbaa" as CSS (with its opacity). */
export function css(hex){
  const { r, g, b, a } = parseHex(hex);
  return a >= 1 ? toHex6({ r, g, b }) : `rgb(${r} ${g} ${b} / ${a})`;
}
