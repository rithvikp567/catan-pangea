/**
 * Who's playing? — pick your profile (or create one — one per device).
 * Then it's "Welcome, Lord …" and on to today's games (RoomsScreen),
 * where you open a room or make one; the color is picked per room
 * (SeatScreen). A centred, welcome-style layout: brand, question, then
 * the profiles, with secondary links underneath.
 */
import { h } from "../dom.js";
import { Screen } from "./Screen.js";
import { NAME_MAX } from "../../game/rules.js";
import { syncStatusPill, icon, ICONS } from "./widgets.js";
import { IOS_STEPS } from "../../app/InstallHelper.js";

export class JoinScreen extends Screen {
  constructor(deps){ super("join", "Who's playing?", deps, { layout:"centered" }); }

  build(){
    const brand = h("div", { class:"join-brand" }, icon(ICONS.brand, "join-logo"), "Pangaea");
    this.body.append(h("header", { class:"join-hero" }, brand, this.heading));

    this.profileList = h("div", { class:"profile-list", role:"list" });
    this.nameInput = h("input", {
      type:"text", maxlength:NAME_MAX, placeholder:"New player? Your name", autocomplete:"nickname",
      autocapitalize:"words", "aria-label":"Your name", enterkeyhint:"done",
    });
    this.createForm = h("form", { class:"create-profile", onSubmit:e => { e.preventDefault(); this.#create(); } },
      h("div", { class:"seed-row" }, this.nameInput, h("button", { type:"submit", class:"btn" }, "Create")));

    /* "Get the app": until it's installed, or the card is closed */
    this.installText = h("small", {});
    this.installAction = h("button", { type:"button", class:"btn", onClick:() => this.deps.installApp?.() }, "Install");
    const close = h("button", { type:"button", class:"icon-btn", "aria-label":"Hide this", title:"Hide this", onClick:() => this.deps.install?.dismiss() });
    close.innerHTML = ICONS.close;
    this.installCard = h("div", { class:"install-card", hidden:true },
      h("img", { class:"install-icon", src:"icons/icon-192.png", alt:"", width:44, height:44 }),
      h("span", { class:"install-text" }, h("b", {}, "Get the app"), this.installText),
      this.installAction, close);
    this.deps.install?.onChange(() => { if(this.visible) this.render(this.game.state); });

    const link = (label, route) => h("button", { type:"button", class:"link-btn", onClick:() => this.router.go(route) }, label);
    this.pillSlot = h("div", { class:"join-status" });
    this.body.append(h("div", { class:"step" }, this.profileList, this.createForm), this.installCard,
      h("footer", { class:"join-foot" },
        h("nav", { class:"screen-links" }, link("Admin", "admin"), link("View map", "")),   /* (season wins: the top bar's trophy) */
        this.pillSlot));
  }

  render(state){
    if(!state) return;
    const game = this.game, me = game.me;
    this.pillSlot.replaceChildren(syncStatusPill(game.status));
    const install = this.deps.install, mode = install?.mode;
    this.installCard.hidden = !mode || install.dismissed;
    this.installText.textContent = mode === "ios" ? IOS_STEPS : "Full screen, no browser bars — opens like an app.";
    this.installAction.hidden = mode !== "prompt";

    this.profileList.replaceChildren(...state.profiles.map(p => h("button", {
      type:"button", role:"listitem", class:"profile-row",
      "aria-pressed":String(me?.id === p.id), onClick:() => this.#pick(p.id),
    },
      h("span", { class:"avatar", "data-colored":"false" }, p.name.slice(0, 1).toUpperCase()),
      h("span", { class:"profile-name" }, p.name, p.deviceId === game.identity.deviceId ? h("small", {}, "This device") : null),
      icon(ICONS.chevronRight, "row-chevron"))));
    if(!state.profiles.length) this.profileList.append(h("p", { class:"empty" }, "No players yet — add the first one below."));
    this.createForm.hidden = !game.canCreateProfile;
  }

  /** Signing in: "Welcome, Lord Sam", then today's games. */
  #pick(id){
    this.game.selectProfile(id);
    this.#welcome(this.game.me?.name ?? "");
  }

  #welcome(name){
    if(this.deps.welcome) this.deps.welcome({ name }, { covered:() => this.router.go("rooms") });
    else this.router.go("rooms");
  }

  async #create(){
    const id = await this.game.createProfile(this.nameInput.value);
    if(id){ this.nameInput.value = ""; this.#welcome(this.game.me?.name ?? ""); }
  }
}
