/**
 * Today's games: every open room — its name, board and seats, who's in it
 * and its mods — to open (or join, or watch), or delete; and New game,
 * which opens the Mods screen to make one. Where everyone lands after
 * signing in (JoinScreen) and what the top bar's Pangaea leads back to.
 * Rooms nobody has touched for hours close by themselves
 * (GameService.pruneRooms).
 */
import { h } from "../dom.js";
import { Screen } from "./Screen.js";
import { getGenerator } from "../../engine/index.js";
import { syncStatusPill, icon, ICONS, inkOn } from "./widgets.js";

export class RoomsScreen extends Screen {
  constructor(deps){ super("rooms", "Today's games", deps, { layout:"centered" }); }

  build(){
    this.listKey = null;
    const brand = h("div", { class:"join-brand" }, icon(ICONS.brand, "join-logo"), "Pangaea");
    this.body.append(h("header", { class:"join-hero" }, brand, this.heading));
    this.list = h("div", { class:"room-list", role:"list" });
    this.newBtn = h("button", { type:"button", class:"btn primary room-new", onClick:() => this.router.go("mods") }, "New game");
    const link = (label, route) => h("button", { type:"button", class:"link-btn", onClick:() => this.router.go(route) }, label);
    this.pillSlot = h("div", { class:"join-status" });
    this.body.append(h("div", { class:"step" }, this.list, this.newBtn),
      h("footer", { class:"join-foot" },
        h("nav", { class:"screen-links" }, link("Admin", "admin"), link("View map", "")),
        this.pillSlot));
  }

  /** Back from today's games: to the map. */
  onBack(){ this.router.go(""); }

  render(state){
    this.pillSlot.replaceChildren(syncStatusPill(this.game.status));
    if(!state) return;
    const me = this.game.me, here = this.game.roomId;
    const rooms = state.rooms(this.game.now());
    /* rebuilt only when something it shows changed (a tap in a game doesn't disturb the list) */
    const key = JSON.stringify([me?.id, here, rooms.map(r => [r.id, r.name, r.players, r.boardProfile, r.session?.settings?.mode,
      r.mods.toJSON(), r.seated.map(s => [s.profileId, s.color, s.profile.name])])]);
    if(key === this.listKey) return;
    this.listKey = key;
    this.list.replaceChildren(...rooms.map(r => this.#card(r, me, r.id === here)));
    if(!rooms.length) this.list.append(h("p", { class:"empty" }, "No games yet today."));
  }

  /** One room: name, board and seats, who's in it, its mods; open / join / watch, and delete. */
  #card(room, me, here){
    const seat = me ? room.seatOf(me.id) : null, full = !seat && room.openSeats === 0;
    const board = getGenerator(room.session?.settings?.mode).name;
    const del = h("button", { type:"button", class:"icon-btn room-delete", "aria-label":`Delete ${room.name}`, title:"Delete", onClick:() => this.#delete(room) });
    del.innerHTML = ICONS.trash;
    const who = room.seated.map(s => h("span", {
      class:"avatar room-avatar", "data-colored":"true", style:`--c:${s.colorHex};color:${inkOn(s.colorHex)}`, title:s.profile.name,
    }, s.profile.name.slice(0, 1).toUpperCase()));
    const action = seat ? "Open" : full ? "Watch" : "Join";
    return h("article", { class:"room-card card", role:"listitem", "data-here":String(here), "data-seated":String(!!seat) },
      h("div", { class:"room-head" },
        h("h2", { class:"room-name" }, room.name),
        del),
      h("p", { class:"room-meta" }, `${board} · ${room.players} players · ${room.players - room.openSeats} of ${room.players} seats`),
      h("div", { class:"room-chips" },
        who.length ? h("span", { class:"room-who" }, who) : null,
        ...room.mods.summary(room.boardProfile).map(m => h("span", { class:"chip" }, m))),
      h("button", { type:"button", class:`btn ${seat ? "primary" : ""} room-open`, onClick:() => this.#open(room) }, action));
  }

  /** Into a room: seated, straight to the game (the tracker once it's under way); otherwise pick a color. */
  #open(room){
    this.game.enterRoom(room.id);
    const seat = this.game.mySeat;
    this.router.go(!seat ? "seat" : room.hasProgress ? "tracker" : "");
  }

  async #delete(room){
    if(!this.deps.confirm(`Delete “${room.name}”? Its game ends for everyone in it. Season wins are kept.`)) return;
    await this.game.deleteRoom(room.id);
  }
}
