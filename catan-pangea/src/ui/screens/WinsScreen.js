/**
 * Season wins: each profile's wins for a calendar year. First place wears
 * a crown and everyone else gets a turd (ui/badges.js) — once anyone has
 * won that season.
 */
import { h } from "../dom.js";
import { crown, turd } from "../badges.js";
import { Screen } from "./Screen.js";
import { seasonOf } from "../../game/rules.js";
import { selectField } from "./widgets.js";

export class WinsScreen extends Screen {
  constructor(deps){ super("wins", "Season wins", deps); }

  build(){
    this.season = seasonOf(Date.now());
    this.select = h("select", { class:"season-select", "aria-label":"Season", onChange:e => { this.season = Number(e.target.value); this.render(this.game.state); } });
    this.list = h("ol", { class:"wins-list" });
    this.body.append(h("div", { class:"card" }, h("div", { class:"card-title-row" }, h("h2", { class:"card-title" }, "Standings"), selectField(this.select)), this.list));
  }

  /* opened from the tracker or the join screen; back returns there */
  onBack(){ this.router.back(); }

  render(state){
    if(!state) return;
    const seasons = state.seasons();
    if(!seasons.includes(this.season)) this.season = seasons[0];
    this.select.replaceChildren(...seasons.map(y => h("option", { value:y, selected:y === this.season }, `${y} season`)));
    const rows = state.winsFor(this.season);
    const meId = this.game.me?.id;
    const badges = rows.some(r => r.leader);
    /* unchanged standings aren't redrawn, so the badges' animations run on undisturbed */
    const key = JSON.stringify([meId, rows.map(r => [r.profile.id, r.profile.name, r.wins, r.leader])]);
    if(key === this.listKey) return;
    this.listKey = key;
    this.list.toggleAttribute("data-badges", badges);
    this.list.replaceChildren(...rows.map((r, i) =>
      h("li", { class:"wins-row", "data-me":String(r.profile.id === meId) },
        h("span", { class:"wins-rank" }, String(i + 1)),
        badges ? (r.leader ? crown() : turd()) : null,
        h("span", { class:"wins-name" }, r.profile.name),
        h("span", { class:"wins-count" }, String(r.wins), h("small", {}, r.wins === 1 ? " win" : " wins")))));
    if(!rows.length) this.list.append(h("li", { class:"empty" }, "No players yet."));
  }
}
