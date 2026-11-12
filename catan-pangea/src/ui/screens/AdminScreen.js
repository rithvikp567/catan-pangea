/**
 * Admin: a shared management account (password "password" — deliberately
 * not security). Remove profiles; correct anyone's season wins.
 */
import { h } from "../dom.js";
import { Screen } from "./Screen.js";
import { CounterControl } from "../controls.js";
import { ADMIN_PASSWORD, seasonOf } from "../../game/rules.js";

export class AdminScreen extends Screen {
  constructor(deps){ super("admin", "Admin", deps); }

  build(){
    this.unlocked = false;
    this.season = seasonOf(Date.now());

    this.password = h("input", { type:"password", autocomplete:"off", "aria-label":"Admin password", placeholder:"Password", enterkeyhint:"go" });
    this.error = h("p", { class:"field-hint is-error", hidden:true }, "That's not it.");
    this.gate = h("form", { class:"card", onSubmit:e => { e.preventDefault(); this.#unlock(); } },
      h("h2", { class:"card-title" }, "Admin sign-in"),
      h("div", { class:"seed-row" }, this.password, h("button", { type:"submit", class:"btn" }, "Unlock")),
      this.error,
      h("p", { class:"field-hint" }, "For fixing wins and removing profiles."));

    this.profileList = h("div", { class:"admin-list" });
    this.select = h("select", { class:"season-select", "aria-label":"Season", onChange:e => { this.season = Number(e.target.value); this.layoutKey = null; this.render(this.game.state); } });
    this.winsList = h("div", { class:"admin-list" });
    this.panel = h("div", { hidden:true },
      h("section", { class:"card" }, h("h2", { class:"card-title" }, "Profiles"), this.profileList),
      h("section", { class:"card" }, h("div", { class:"card-title-row" }, h("h2", { class:"card-title" }, "Wins"), this.select), this.winsList),
      h("button", { type:"button", class:"link-btn", onClick:() => { this.unlocked = false; this.render(this.game.state); } }, "Lock admin"));
    this.body.append(this.gate, this.panel);
  }

  onBack(){ this.router.back(); }

  #unlock(){
    if(this.password.value === ADMIN_PASSWORD){
      this.unlocked = true; this.password.value = ""; this.error.hidden = true;
      this.render(this.game.state);
    }else this.error.hidden = false;
  }

  render(state){
    this.gate.hidden = this.unlocked;
    this.panel.hidden = !this.unlocked;
    if(!this.unlocked || !state) return;

    this.profileList.replaceChildren(...state.profiles.map(p =>
      h("div", { class:"admin-row" },
        h("span", { class:"admin-name" }, p.name, h("small", {}, `since ${new Date(p.createdAt).toLocaleDateString()}`)),
        h("button", { type:"button", class:"btn danger", onClick:() => this.#remove(p) }, "Remove"))));
    if(!state.profiles.length) this.profileList.append(h("p", { class:"empty" }, "No profiles."));

    const seasons = state.seasons();
    if(!seasons.includes(this.season)) this.season = seasons[0];
    this.select.replaceChildren(...seasons.map(y => h("option", { value:y, selected:y === this.season }, `${y} season`)));

    /* counters are rebuilt only when the roster changes, so holds aren't cut off */
    const rows = state.winsFor(this.season);
    const key = this.season + "|" + rows.map(r => r.profile.id).sort().join(",");
    if(key !== this.layoutKey){
      this.layoutKey = key;
      this.winControls = new Map();
      this.winsList.replaceChildren(...rows.map(r => {
        const ctl = new CounterControl({ label:`${r.profile.name} wins`, min:0, max:999, onStep:d => this.game.adjustWins(r.profile.id, this.season, d) });
        this.winControls.set(r.profile.id, ctl);
        return h("div", { class:"admin-row" }, h("span", { class:"admin-name" }, r.profile.name), ctl.el);
      }));
    }
    for(const r of rows) this.winControls.get(r.profile.id)?.set(r.wins);
  }

  async #remove(profile){
    if(!this.deps.confirm(`Remove ${profile.name}? Their wins are deleted too, and their device can make a new profile.`)) return;
    await this.game.removeProfile(profile.id);
    this.deps.toast.show(`${profile.name} removed.`);
  }
}
