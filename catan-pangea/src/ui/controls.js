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
    holdRepeat(btn, () => this.#step(delta));
    return btn;
  }
}

/**
 * Press-and-hold repeat for a button: one step on press, then repeating
 * after a short delay until release (or until `step` returns false).
 * Keyboard activation still gives a single step.
 * @param {HTMLButtonElement} btn
 * @param {() => boolean|void} step  return false to stop repeating
 */
export function holdRepeat(btn, step, { delay = 380, interval = 110 } = {}){
  let wait = null, repeat = null;
  const stop = () => { clearTimeout(wait); clearInterval(repeat); wait = repeat = null; };
  btn.addEventListener("pointerdown", e => {
    if(e.button !== 0 || btn.disabled) return;
    e.preventDefault();
    if(step() === false) return;
    wait = setTimeout(() => { repeat = setInterval(() => { if(btn.disabled || step() === false) stop(); }, interval); }, delay);
  });
  for(const ev of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(ev, stop);
  btn.addEventListener("click", e => { if(e.detail === 0) step(); });
}

/**
 * − value + for a number that lives elsewhere (a shared tracker): it
 * reports steps (+1 / −1) instead of owning the value, so concurrent taps
 * from several phones all count. Call set() with the synced value.
 */
export class CounterControl {
  /**
   * @param {object} p
   * @param {string} p.label    accessible name, e.g. "Alice's victory points"
   * @param {number} p.min
   * @param {number} p.max
   * @param {(delta:number) => void} p.onStep
   * @param {(value:number) => string} [p.format]
   */
  constructor({ label, min, max, onStep, format = String }){
    Object.assign(this, { min, max, format, value:0 });
    this.out = h("output", { class:"counter-value", "aria-live":"polite" });
    const btn = (text, aria, delta) => {
      const b = h("button", { type:"button", class:"counter-btn", "aria-label":aria }, text);
      holdRepeat(b, () => {
        const next = this.value + delta;
        if(next < this.min || next > this.max) return false;
        this.value = next;                 /* optimistic; the synced value follows */
        this.#paint();
        onStep(delta);
        return true;
      });
      return b;
    };
    this.dec = btn("−", `Decrease ${label}`, -1);
    this.inc = btn("+", `Increase ${label}`, +1);
    this.el = h("div", { class:"counter", role:"group", "aria-label":label }, this.dec, this.out, this.inc);
    this.#paint();
  }

  set(value){ this.value = value; this.#paint(); }
  setBounds(min, max){ Object.assign(this, { min, max }); this.#paint(); }

  #paint(){
    this.out.textContent = this.format(this.value);
    this.dec.disabled = this.value <= this.min;
    this.inc.disabled = this.value >= this.max;
  }
}

/** Label + control (+ optional hint) wrapper. */
export function field(label, control, hint = null, { inline = false } = {}){
  const lab = h("span", { class:"field-label" }, label);
  return h("div", { class:"field" },
    inline ? h("div", { class:"field-row" }, lab, control) : [lab, control],
    hint);
}
