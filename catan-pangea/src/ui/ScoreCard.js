/**
 * The map score: a full card in the settings panel, and a compact chip
 * over the board on phones (tapping it opens the panel).
 */
import { h } from "./dom.js";

const COPY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>`;

export class ScoreCard {
  /**
   * @param {HTMLElement} card
   * @param {HTMLButtonElement} chip
   * @param {object} p
   * @param {() => void} p.onChipClick
   */
  constructor(card, chip, { onChipClick }){
    this.card = card;
    this.chip = chip;
    chip.addEventListener("click", onChipClick);
  }

  showPending(){
    this.chip.hidden = false;
    this.chip.dataset.key = "pending";
    this.chip.replaceChildren(h("span", { class:"dot" }), h("span", { class:"lbl" }, "Generating…"));
    const verdict = this.card.querySelector(".verdict");
    if(verdict){ verdict.dataset.key = "pending"; verdict.textContent = "Generating…"; }
  }

  /** @param {import("../engine/Board.js").Board} board */
  render(board){
    const { total, verdict, parts } = board.score;
    const rounded = Math.round(total);

    this.chip.hidden = false;
    this.chip.dataset.key = verdict.key;
    this.chip.setAttribute("aria-label", `Map score ${rounded} of 100, ${verdict.label}. Open details.`);
    this.chip.replaceChildren(
      h("span", { class:"dot" }),
      h("span", { class:"val" }, String(rounded)),
      h("span", { class:"lbl" }, verdict.label),
    );

    const copy = h("button", { type:"button", class:"icon-btn", "aria-label":"Copy seed", title:"Copy seed" });
    copy.innerHTML = COPY_ICON;   /* static, trusted markup */
    copy.addEventListener("click", () => this.#copy(board.seed, copy));

    this.card.replaceChildren(
      h("div", { class:"score-top" },
        h("div", { class:"score-total num" }, String(rounded), h("small", {}, " / 100")),
        h("span", { class:"verdict", "data-key":verdict.key }, verdict.label)),
      h("div", { class:"parts" }, parts.flatMap(p => [
        h("span", { class:"nm", title:p.note }, p.name),
        h("span", { class:"bar" }, h("i", { style:`width:${(p.value / 25 * 100).toFixed(0)}%` })),
        h("span", { class:"pt" }, p.value.toFixed(0)),
      ])),
      h("div", { class:"seed-line" }, "Seed", h("code", {}, board.seed), copy),
    );
  }

  async #copy(seed, btn){
    try{
      await navigator.clipboard.writeText(seed);
      btn.setAttribute("aria-label", "Seed copied");
      btn.title = "Copied";
    }catch{ /* clipboard unavailable (insecure context / denied) — the seed is visible anyway */ }
  }
}
