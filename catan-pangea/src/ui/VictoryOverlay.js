/**
 * Victory / defeat screen. Shown on every phone when a seated player
 * reaches 13 VP — "Victory" for them, "Defeat" for everyone else seated.
 * Continue dismisses it (the numbers are untouched). If that player drops
 * below 13 and climbs back, it shows again.
 *
 * The season wins' 8-bit badges (ui/badges.js): a big crown over "Victory"
 * (and over "Sam wins" for someone watching), a big turd over "Defeat";
 * in the standings a crown for whoever reached 13, a turd for everyone
 * else. onToggle tells App when it shows or hides (the mini bar and the
 * winter frost go while it's up).
 */
import { h } from "./dom.js";
import { crown, turd } from "./badges.js";
import { MAX_VP } from "../game/rules.js";

export class VictoryOverlay {
  /** @param {object} deps { game, router, onToggle?:(shown:boolean) => void } */
  constructor(deps){
    this.deps = deps;
    this.dismissed = new Set();       /* "sessionId:seatKey" already acknowledged */
    this.key = "";                    /* what's drawn: unchanged, it isn't redrawn (the badges animate on undisturbed) */
    this.el = h("div", { id:"victory", class:"victory", role:"alertdialog", "aria-modal":"true", "aria-labelledby":"victoryTitle", hidden:true });
    document.body.append(this.el);
  }

  /** @param {import("../game/GameState.js").GameState} state */
  update(state){
    if(!state?.session){ this.#hide(); return; }
    const sid = state.sessionId;
    const winners = state.winners;
    const current = new Set(winners.map(w => `${sid}:${w.key}`));
    /* forget acknowledgements for anyone no longer on 13, so a return to 13 shows again */
    for(const k of [...this.dismissed]) if(!current.has(k)) this.dismissed.delete(k);
    const fresh = winners.filter(w => !this.dismissed.has(`${sid}:${w.key}`));
    if(!fresh.length){ if(!winners.length) this.#hide(); return; }
    this.#show(state, fresh[0], current);
  }

  #show(state, winner, current){
    const me = this.deps.game.me;
    const kind = me?.id === winner.profileId ? "win" : this.deps.game.mySeat ? "loss" : "watch";
    const title = { win:"Victory", loss:"Defeat", watch:`${winner.profile.name} wins` }[kind];
    const sub = kind === "win" ? `You reached ${MAX_VP} victory points.`
              : `${winner.profile.name} reached ${MAX_VP} victory points.`;
    const standings = [...state.seats].filter(s => s.profile).sort((a, b) => b.vp - a.vp);
    const crowned = new Set(state.winners.map(w => w.key));      /* everyone on 13 (more than one: they share it) */

    const key = JSON.stringify([kind, title, [...current], standings.map(s => [s.key, s.profile.name, s.vp, crowned.has(s.key)])]);
    if(key !== this.key || this.el.hidden){
      this.key = key;
      this.el.dataset.kind = kind;
      this.el.replaceChildren(h("div", { class:"victory-card" },
        h("span", { class:"victory-badge" }, kind === "loss" ? turd() : crown()),
        h("h2", { id:"victoryTitle", class:"victory-title" }, title),
        h("p", { class:"victory-sub" }, sub),
        h("ol", { class:"victory-standings" }, standings.map(s =>
          h("li", { "data-winner":String(s.key === winner.key) },
            crowned.has(s.key) ? crown() : turd(), h("span", {}, s.profile.name), h("b", {}, String(s.vp))))),
        h("button", { type:"button", class:"btn primary", onClick:() => {
          for(const k of current) this.dismissed.add(k);
          this.#hide();
          this.deps.router.go("tracker");
        } }, "Continue")));
    }
    if(this.el.hidden){
      this.el.hidden = false;
      this.el.querySelector("button")?.focus({ preventScroll:true });
      this.deps.onToggle?.(true);
    }
  }

  #hide(){
    if(this.el.hidden) return;
    this.el.hidden = true;
    this.deps.onToggle?.(false);
  }
}
