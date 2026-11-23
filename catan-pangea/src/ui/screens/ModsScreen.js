/**
 * New game: the room's name and its mods — Karma & Robber, Walker,
 * Battle, and the points to win (the board's own — 13 on Cities &
 * Knights, 10 in the base game — or a number of the table's own). Create
 * game opens the room with the map on screen as its first game, and goes
 * on to picking a color. Back: today's games.
 */
import { h } from "../dom.js";
import { Screen } from "./Screen.js";
import { Toggle, Stepper } from "../controls.js";
import { section } from "./widgets.js";
import { Mods, VP_TO_WIN, defaultVP } from "../../game/mods.js";
import { ROOM_NAME_MAX } from "../../game/rules.js";

export class ModsScreen extends Screen {
  constructor(deps){ super("mods", "New game", deps); }

  build(){
    this.mods = new Mods();
    this.nameInput = h("input", {
      type:"text", class:"room-name-input", maxlength:ROOM_NAME_MAX, autocomplete:"off", autocapitalize:"words",
      "aria-label":"Name of the game", enterkeyhint:"done",
    });
    this.switches = Mods.SWITCHES.map(({ key, label }) =>
      [key, new Toggle({ label, onChange:on => { this.mods = this.mods.with({ [key]: on }); } })]);

    /* the points to win: the board's own, or a custom number */
    this.vpStepper = new Stepper({ label:"Points to win", value:defaultVP(this.boardProfile()), min:VP_TO_WIN.min, max:VP_TO_WIN.max,
      onChange:vp => { this.mods = this.mods.with({ vpToWin:vp }); } });
    this.customVP = new Toggle({ label:"Custom points to win", value:false, onChange:on => {
      this.mods = this.mods.with({ vpToWin: on ? this.vpStepper.value : null });   /* (on: starts from the board's own) */
      this.#paintVP();
    } });
    this.vpRow = h("div", { class:"toggle-row mods-vp" }, h("span", { class:"toggle-label" }, "Points to win"), this.vpStepper.el);

    this.createBtn = h("button", { type:"submit", class:"btn primary" }, "Create game");
    this.body.append(h("form", { class:"mods-form", onSubmit:e => { e.preventDefault(); this.#create(); } },
      section("Name", this.nameInput),
      section("Mods", h("div", { class:"mods-toggles" }, ...this.switches.map(([, t]) => t.el))),
      section("Victory points", h("div", { class:"mods-toggles" }, this.customVP.el, this.vpRow)),
      this.createBtn));
  }

  /** The board the room would start on: the map on screen's rules ("ck" | "base").
      (Not #private: build() runs inside the base constructor.) */
  boardProfile(){ return this.deps.boardProfile?.() ?? "ck"; }

  onBack(){ this.router.go("rooms"); }

  /** A fresh form each time: default mods, and a name nobody's used today. */
  show(opts){
    this.mods = new Mods();
    for(const [key, t] of this.switches) t.set(this.mods[key]);
    this.customVP.set(false);
    this.#paintVP();
    this.nameInput.value = this.#suggestName();
    this.creating = false;
    super.show(opts);
  }

  render(){ this.createBtn.disabled = !!this.creating || !this.game.ready; }

  /** The stepper counts only with Custom on; otherwise it shows the board's own number, fixed. */
  #paintVP(){
    const custom = this.mods.vpToWin != null;
    this.vpStepper.set(custom ? this.mods.vpToWin : defaultVP(this.boardProfile()));
    if(!custom) this.vpStepper.dec.disabled = this.vpStepper.inc.disabled = true;
    this.vpRow.dataset.off = String(!custom);
  }

  /** "Sam's game", "Sam's game 2", … — unique among today's games. */
  #suggestName(){
    const me = this.game.me, taken = new Set((this.game.state?.rooms(this.game.now()) ?? []).map(r => r.name.toLowerCase()));
    const base = me ? `${me.name}'s game` : "Game";
    for(let n = 1; ; n++){
      const name = n === 1 ? base : `${base} ${n}`;
      if(!taken.has(name.toLowerCase())) return name.slice(0, ROOM_NAME_MAX);
    }
  }

  async #create(){
    if(this.creating) return;
    this.creating = true;
    this.createBtn.textContent = "Creating…";
    this.render();
    try{
      const id = await this.deps.createRoom?.(this.nameInput.value, this.mods.toJSON());
      if(id) this.router.go("seat");
    }finally{
      this.creating = false;
      this.createBtn.textContent = "Create game";
      this.render();
    }
  }
}
