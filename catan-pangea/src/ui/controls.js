/**
 * Touch-friendly form controls. Both expose `.el`, `.value`, `set(value)`
 * and call `onChange(value)` only for user-initiated changes.
 */
import { h } from "./dom.js";

/** A row of mutually exclusive options (an ARIA radiogroup). */
export class SegmentedControl {
  /**
   * @param {object} p
   * @param {string} p.label accessible name
   * @param {{value:any, label:string}[]} p.options
   * @param {any} p.value
   * @param {(value:any) => void} [p.onChange]
   */
  constructor({ label, options, value, onChange = () => {} }){
    this.options = options;
    this.onChange = onChange;
    this.buttons = options.map(o => h("button", {
      type:"button", class:"seg", role:"radio",
      onClick:() => this.#choose(o.value),
    }, o.label));
    this.el = h("div", { class:"segmented", role:"radiogroup", "aria-label":label, onKeydown:e => this.#onKey(e) }, this.buttons);
    this.set(value);
  }

  set(value){
    this.value = value;
    this.options.forEach((o, i) => {
      const on = o.value === value;
      this.buttons[i].setAttribute("aria-checked", String(on));
      this.buttons[i].tabIndex = on ? 0 : -1;   /* roving tabindex */
    });
  }

  #choose(value){
    if(value === this.value) return;
    this.set(value);
    this.onChange(value);
  }

  #onKey(e){
    const dir = { ArrowRight:1, ArrowDown:1, ArrowLeft:-1, ArrowUp:-1 }[e.key];
    if(!dir) return;
    e.preventDefault();
    const i = this.options.findIndex(o => o.value === this.value);
    const next = (i + dir + this.options.length) % this.options.length;
    this.#choose(this.options[next].value);
    this.buttons[next].focus();
  }
}

/** − value + with press-and-hold repeat; replaces fiddly sliders on phones. */
export class Stepper {
  /**
   * @param {object} p
   * @param {string} p.label   accessible name, e.g. "Land tiles"
   * @param {number} p.value
   * @param {number} p.min
   * @param {number} p.max
   * @param {(value:number) => void} [p.onChange]
   */
  constructor({ label, value, min, max, onChange = () => {} }){
    Object.assign(this, { min, max, onChange });
    this.out = h("output", { "aria-live":"polite" });
    this.dec = this.#button("−", `Fewer ${label.toLowerCase()}`, -1);
    this.inc = this.#button("+", `More ${label.toLowerCase()}`, +1);
    this.el = h("div", { class:"stepper", role:"group", "aria-label":label }, this.dec, this.out, this.inc);
    this.set(value);
  }

  set(value){
    this.value = Math.max(this.min, Math.min(this.max, value));
    this.out.textContent = String(this.value);
    this.dec.disabled = this.value <= this.min;
    this.inc.disabled = this.value >= this.max;
  }

  setBounds(min, max){
    Object.assign(this, { min, max });
    this.set(this.value);
  }

  #step(delta){
    const before = this.value;
    this.set(this.value + delta);
    if(this.value !== before) this.onChange(this.value);
    return this.value !== before;
  }

  #button(text, ariaLabel, delta){
    const btn = h("button", { type:"button", "aria-label":ariaLabel }, text);
    let delay = null, repeat = null;
    const stop = () => { clearTimeout(delay); clearInterval(repeat); delay = repeat = null; };
    btn.addEventListener("pointerdown", e => {
      if(e.button !== 0 || btn.disabled) return;
      e.preventDefault();
      this.#step(delta);
      delay = setTimeout(() => { repeat = setInterval(() => { if(!this.#step(delta)) stop(); }, 90); }, 380);
    });
    for(const ev of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(ev, stop);
    /* keyboard activation (pointer presses are handled above) */
    btn.addEventListener("click", e => { if(e.detail === 0) this.#step(delta); });
    return btn;
  }
}

/** Label + control (+ optional hint) wrapper. */
export function field(label, control, hint = null, { inline = false } = {}){
  const lab = h("span", { class:"field-label" }, label);
  return h("div", { class:"field" },
    inline ? h("div", { class:"field-row" }, lab, control) : [lab, control],
    hint);
}
