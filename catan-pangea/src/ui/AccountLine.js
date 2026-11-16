/**
 * Who's signed in on this device, in the top bar next to the brand:
 * "Sam · Sign out" (or "Sign in" when nobody is). Signing out only forgets
 * the profile on this device — the seat stays, so picking the profile again
 * (here or on another phone) is straight back in the game.
 */
import { h } from "./dom.js";

export class AccountLine {
  /**
   * @param {HTMLElement} el
   * @param {object} p
   * @param {import("../app/GameController.js").GameController} p.game
   * @param {() => void} p.onSignOut
   * @param {() => void} p.onSignIn
   */
  constructor(el, { game, onSignOut, onSignIn }){
    Object.assign(this, { el, game, onSignOut, onSignIn });
    this.key = null;
    game.onChange(() => this.render());
    this.render();
  }

  render(){
    const me = this.game.me, ready = !!this.game.state;
    const key = !ready ? "" : me ? `me|${me.id}|${me.name}` : "none";
    if(key === this.key) return;
    this.key = key;
    this.el.hidden = !ready;
    if(!ready) return;
    this.el.replaceChildren(...(me
      ? [h("span", { class:"account-name", title:`Signed in as ${me.name}` }, me.name),
         h("span", { class:"account-sep", "aria-hidden":"true" }, "·"),
         h("button", { type:"button", class:"account-btn", "aria-label":`Sign out ${me.name}`, onClick:() => this.onSignOut() }, "Sign out")]
      : [h("button", { type:"button", class:"account-btn", onClick:() => this.onSignIn() }, "Sign in")]));
  }
}
