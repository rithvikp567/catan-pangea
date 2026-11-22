/**
 * The map score: one quiet line at the top of Settings (the board itself
 * stays clear — on phones it's one tap away behind Settings). The total, a
 * dot for each of its four parts (each filled as far as that part scored,
 * out of 25) and the seed with its copy button; a tap on the score opens
 * the four parts as bars underneath, and closes them again (2.13.0 — it
 * used to be a big number over the bars, always open, and a verdict).
 *
 * Built once and updated in place, so a new map keeps it open or closed;
 * hidden until the first map is in. Screen readers hear each new map as
 * one sentence ("Map score 92 out of 100. Seed cinder-4821."), from a
 * status line of its own — the card itself isn't a live region.
 */
import { h } from "./dom.js";

const COPY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>`;
const CHEVRON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
/** Each part is out of 25 (engine/scoring.js). */
const PART_MAX = 25;

export class ScoreCard {
  /** @param {HTMLElement} card */
  constructor(card){
    this.card = card;
    this.seed = "";
    this.anim = null;
    card.hidden = true;            /* (until the first map: no empty, nameless button) */

    this.total = h("span", { class:"score-num num" });
    this.dots = h("span", { class:"score-dots", "aria-hidden":"true" });
    const chevron = h("span", { class:"score-chevron", "aria-hidden":"true" });
    chevron.innerHTML = CHEVRON;   /* static, trusted markup */
    this.toggle = h("button", {
      type:"button", class:"score-toggle", "aria-expanded":"false", "aria-controls":"scoreParts",
      onClick:() => this.#setOpen(this.toggle.getAttribute("aria-expanded") !== "true"),
    }, h("span", { class:"score-total" }, this.total, h("small", { "aria-hidden":"true" }, "/ 100")), this.dots, chevron);

    this.seedText = h("code", { class:"score-seed-text" });
    this.copy = h("button", { type:"button", class:"icon-btn", "aria-label":"Copy seed", title:"Copy seed", onClick:() => this.#copy() });
    this.copy.innerHTML = COPY_ICON;   /* static, trusted markup */

    this.parts = h("div", { class:"parts", id:"scoreParts", role:"group", "aria-label":"The score's four parts" });
    this.partsWrap = h("div", { class:"parts-wrap", hidden:true }, this.parts);
    this.status = h("span", { class:"visually-hidden", role:"status" });
    card.replaceChildren(
      h("div", { class:"score-row" }, this.toggle, h("span", { class:"score-seed" }, this.seedText, this.copy)),
      this.partsWrap,
      this.status,
    );
  }

  /** A new map is being made: the old score fades until the new one arrives (or the making ends without one). */
  setPending(on){
    if(on) this.card.dataset.pending = "";
    else delete this.card.dataset.pending;
  }

  /** @param {import("../engine/Board.js").Board} board */
  render(board){
    const { total, parts } = board.score;
    const rounded = Math.round(total);
    this.setPending(false);
    this.card.hidden = false;

    this.total.textContent = String(rounded);
    this.toggle.setAttribute("aria-label", `Map score ${rounded} out of 100: ${parts.map(p => `${p.name} ${p.value.toFixed(0)}`).join(", ")}`);
    this.dots.replaceChildren(...parts.map(p => h("i", { style:`--p:${Math.max(0, Math.min(1, p.value / PART_MAX)).toFixed(3)}` })));
    this.parts.replaceChildren(...parts.flatMap(p => [
      h("span", { class:"nm", title:p.note }, p.name),
      h("span", { class:"bar", "aria-hidden":"true" }, h("i", { style:`width:${(p.value / PART_MAX * 100).toFixed(0)}%` })),
      h("span", { class:"pt" }, p.value.toFixed(0)),
    ]));

    this.seed = board.seed;
    this.seedText.textContent = board.seed;
    this.seedText.title = `Seed ${board.seed}`;     /* (the whole of it, when it's cut short) */
    this.copy.setAttribute("aria-label", `Copy seed ${board.seed}`);
    this.copy.title = "Copy seed";
    this.status.textContent = `Map score ${rounded} out of 100. Seed ${board.seed}.`;
  }

  /** Open or close the four parts (they slide, like Advanced; not under reduce motion). */
  #setOpen(open){
    this.toggle.setAttribute("aria-expanded", String(open));
    this.card.classList.toggle("is-open", open);
    const wrap = this.partsWrap;
    /* a tap while it's still sliding turns it round from where it is, not from the end it was heading for */
    const from = this.anim ? (cs => ({ height:cs.height, opacity:cs.opacity }))(getComputedStyle(wrap)) : null;
    this.anim?.cancel();
    this.anim = null;
    if(matchMedia("(prefers-reduced-motion: reduce)").matches){ wrap.hidden = !open; return; }
    wrap.hidden = false;
    wrap.style.overflow = "hidden";
    const hgt = wrap.offsetHeight;
    const frames = open
      ? [from ?? { height:"0px", opacity:0, transform:"translateY(-6px)" }, { height:`${hgt}px`, opacity:1, transform:"none" }]
      : [from ?? { height:`${hgt}px`, opacity:1 }, { height:"0px", opacity:0 }];
    const anim = wrap.animate(frames, open ? { duration:280, easing:"cubic-bezier(.2,.8,.2,1)" } : { duration:200, easing:"ease-in" });
    this.anim = anim;
    anim.onfinish = () => {
      if(this.anim !== anim) return;
      this.anim = null;
      wrap.style.overflow = "";
      if(!open) wrap.hidden = true;
    };
  }

  async #copy(){
    if(!this.seed) return;
    try{
      await navigator.clipboard.writeText(this.seed);
      this.copy.setAttribute("aria-label", "Seed copied");
      this.copy.title = "Copied";
      this.status.textContent = "Seed copied.";
    }catch{ /* clipboard unavailable (insecure context / denied) — the seed is visible anyway */ }
  }
}
