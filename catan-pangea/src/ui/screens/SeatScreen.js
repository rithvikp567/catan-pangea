/**
 * Your color in this device's room: pick one nobody else in the room has,
 * and you're seated (Join game) — or, seated already, change it (Save
 * color). A full room can still be watched. The welcome-style layout of
 * the other sign-in screens.
 */
import { h } from "../dom.js";
import { Screen } from "./Screen.js";
import { PLAYER_COLORS, colorById } from "../../game/rules.js";
import { getGenerator } from "../../engine/index.js";
import { syncStatusPill, icon, ICONS } from "./widgets.js";

export class SeatScreen extends Screen {
  constructor(deps){ super("seat", "Pick your color", deps, { layout:"centered" }); }

  build(){
    this.picked = null;
    this.banner = h("p", { class:"game-banner" });
    const brand = h("div", { class:"join-brand" }, icon(ICONS.brand, "join-logo"), "Pangaea");
    this.body.append(h("header", { class:"join-hero" }, brand, this.heading, this.banner));

    this.colorGrid = h("div", { class:"color-grid", role:"radiogroup", "aria-label":"Your color" });
    this.joinBtn = h("button", { type:"button", class:"btn primary", onClick:() => this.#join() }, "Join game");
    this.watchBtn = h("button", { type:"button", class:"btn primary", onClick:() => this.router.go("") }, "Watch");
    this.pillSlot = h("div", { class:"join-status" });
    this.body.append(
      h("div", { class:"step" }, this.colorGrid,
        h("div", { class:"step-actions" },
          h("button", { type:"button", class:"btn", onClick:() => this.onBack() }, "Back"),
          this.joinBtn, this.watchBtn)),
      h("footer", { class:"join-foot" }, this.pillSlot));
  }

  onBack(){ this.router.go("rooms"); }

  show(opts){ this.picked = null; super.show(opts); }

  render(state){
    this.pillSlot.replaceChildren(syncStatusPill(this.game.status));
    const room = this.game.room, me = this.game.me;
    if(!state || !room || !me) return;
    const mine = room.seatOf(me.id), full = !mine && room.openSeats === 0;
    this.heading.textContent = mine ? "Your color" : "Pick your color";
    const filled = room.players - room.openSeats;
    this.banner.replaceChildren(h("b", {}, room.name), ` · ${getGenerator(room.session.settings?.mode).name} · ${filled} of ${room.players} seats taken`,
      ...(full ? [h("span", { class:"is-warn" }, "Every seat is taken — you can still watch.")] : []));

    const taken = room.takenColors(me.id);
    if(!this.picked || taken.has(this.picked)) this.picked = mine?.color ?? PLAYER_COLORS.find(c => !taken.has(c.id))?.id ?? null;
    this.colorGrid.replaceChildren(...PLAYER_COLORS.map(c => {
      const by = taken.get(c.id);
      return h("button", {
        type:"button", role:"radio", class:"swatch", style:`--c:${c.hex}`,
        "aria-checked":String(this.picked === c.id), disabled:!!by || full,
        "aria-label": by ? `${c.label}, taken by ${by}` : c.label,
        onClick:() => { this.picked = c.id; this.render(this.game.state); },
      }, h("span", { class:"swatch-dot" }), h("span", {}, c.label, by ? h("small", {}, by) : null));
    }));
    this.joinBtn.hidden = full;
    this.watchBtn.hidden = !full;
    this.joinBtn.disabled = this.joining || !this.picked;
    this.joinBtn.textContent = this.joining ? "Joining…" : mine ? "Save color" : "Join game";
  }

  async #join(){
    const color = this.picked, wasSeated = !!this.game.mySeat;
    this.joining = true;
    this.render(this.game.state);           /* remote updates keep it in this state too */
    try{
      if(await this.game.join(color)){
        this.deps.toast.show(wasSeated ? `You're ${colorById(color).label} now.` : `You're ${colorById(color).label} in ${this.game.room?.name ?? "the game"}.`);
        this.router.go(wasSeated ? "tracker" : "");      /* just seated: the map first */
      }
    }finally{
      this.joining = false;
      this.render(this.game.state);
    }
  }
}
