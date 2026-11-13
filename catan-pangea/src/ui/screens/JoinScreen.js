/**
 * Welcome / join: pick your profile (or create one — one per device),
 * then a color nobody else in this game has, then you're seated.
 * A centred, welcome-style layout: brand, question, the game in one line,
 * then the step's content, with secondary links underneath.
 */
import { h } from "../dom.js";
import { Screen } from "./Screen.js";
import { PLAYER_COLORS, NAME_MAX, colorById } from "../../game/rules.js";
import { getGenerator } from "../../engine/index.js";
import { syncStatusPill, icon, ICONS } from "./widgets.js";
import { IOS_STEPS } from "../../app/InstallHelper.js";

export class JoinScreen extends Screen {
  constructor(deps){ super("join", "Who's playing?", deps, { layout:"centered" }); }

  build(){
    this.step = "profile";
    this.picked = null;

    this.banner = h("p", { class:"game-banner" });
    const brand = h("div", { class:"join-brand" }, icon(ICONS.brand, "join-logo"), "Pangaea");
    this.body.append(h("header", { class:"join-hero" }, brand, this.heading, this.banner));

    /* step 1: who are you? */
    this.profileList = h("div", { class:"profile-list", role:"list" });
    this.nameInput = h("input", {
      type:"text", maxlength:NAME_MAX, placeholder:"New player? Your name", autocomplete:"nickname",
      autocapitalize:"words", "aria-label":"Your name", enterkeyhint:"done",
    });
    this.nameError = h("p", { class:"field-hint is-error", hidden:true });
    this.createForm = h("form", { class:"create-profile", onSubmit:e => { e.preventDefault(); this.#create(); } },
      h("div", { class:"seed-row" }, this.nameInput, h("button", { type:"submit", class:"btn" }, "Create")),
      this.nameError);
    this.profileStep = h("div", { class:"step" }, this.profileList, this.createForm);

    /* step 2: your color */
    this.colorGrid = h("div", { class:"color-grid", role:"radiogroup", "aria-label":"Your color" });
    this.joinBtn = h("button", { type:"button", class:"btn primary", onClick:() => this.#join() }, "Join game");
    this.colorStep = h("div", { class:"step", hidden:true },
      this.colorGrid,
      h("div", { class:"step-actions" },
        h("button", { type:"button", class:"btn", onClick:() => this.#setStep("profile") }, "Back"),
        this.joinBtn));

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
    this.body.append(this.profileStep, this.colorStep, this.installCard,
      h("footer", { class:"join-foot" },
        h("nav", { class:"screen-links" }, link("Season wins", "wins"), link("Admin", "admin"), link("View map", "")),
        this.pillSlot));
  }

  onBack(){ this.step === "color" ? this.#setStep("profile") : this.router.go(""); }

  show(opts){
    /* returning players land straight on the color step */
    this.#setStep(this.game.me && this.game.state?.session ? "color" : "profile");
    super.show(opts);
  }

  render(state){
    if(!state) return;
    const game = this.game, me = game.me;
    const mine = me ? state.seatOf(me.id) : null;
    this.heading.textContent = this.step === "color" ? (mine ? "Your color" : "Pick your color") : "Who's playing?";
    this.pillSlot.replaceChildren(syncStatusPill(game.status));
    this.#renderBanner(state);
    const install = this.deps.install, mode = install?.mode;
    this.installCard.hidden = !mode || install.dismissed;
    this.installText.textContent = mode === "ios" ? IOS_STEPS : "Full screen, no browser bars — opens like an app.";
    this.installAction.hidden = mode !== "prompt";

    /* profiles */
    this.profileList.replaceChildren(...state.profiles.map(p => {
      const seat = state.seatOf(p.id);
      const note = seat ? `Playing · ${colorById(seat.color)?.label}` : p.deviceId === game.identity.deviceId ? "This device" : "";
      return h("button", {
        type:"button", role:"listitem", class:"profile-row",
        "aria-pressed":String(me?.id === p.id), onClick:() => this.#pick(p.id),
      },
        h("span", { class:"avatar", style: seat?.colorHex ? `--c:${seat.colorHex}` : null, "data-colored":String(!!seat?.colorHex) }, p.name.slice(0, 1).toUpperCase()),
        h("span", { class:"profile-name" }, p.name, note ? h("small", {}, note) : null),
        icon(ICONS.chevronRight, "row-chevron"));
    }));
    if(!state.profiles.length) this.profileList.append(h("p", { class:"empty" }, "No players yet — add the first one below."));
    this.createForm.hidden = !game.canCreateProfile;

    /* colors */
    if(me){
      const taken = state.takenColors(me.id);
      if(!this.picked || taken.has(this.picked)) this.picked = mine?.color ?? PLAYER_COLORS.find(c => !taken.has(c.id))?.id ?? null;
      this.colorGrid.replaceChildren(...PLAYER_COLORS.map(c => {
        const by = taken.get(c.id);
        return h("button", {
          type:"button", role:"radio", class:"swatch", style:`--c:${c.hex}`,
          "aria-checked":String(this.picked === c.id), disabled:!!by,
          "aria-label": by ? `${c.label}, taken by ${by}` : c.label,
          onClick:() => { this.picked = c.id; this.render(this.game.state); },
        }, h("span", { class:"swatch-dot" }), h("span", {}, c.label, by ? h("small", {}, by) : null));
      }));
      const canSeat = !state.session || mine || state.openSeats > 0;
      this.joinBtn.disabled = this.joining || !canSeat || !this.picked;
      this.joinBtn.textContent = this.joining ? "Joining…" : mine ? "Save color" : "Join game";
    }
  }

  /** One line about the game (and who you are, on the color step). */
  #renderBanner(state){
    const s = state.session, me = this.game.me;
    const parts = [];
    if(this.step === "color" && me) parts.push(h("b", {}, me.name));
    if(s){
      const filled = state.players - state.openSeats;
      parts.push(`${getGenerator(s.settings?.mode).name} · ${state.players} players`, `${filled} of ${state.players} seats taken`);
    }else parts.push("A new game starts when you join");
    const line = parts.flatMap((p, i) => i ? [" · ", p] : [p]);
    const full = s && !this.game.mySeat && state.openSeats === 0;
    this.banner.replaceChildren(...line, ...(full ? [h("span", { class:"is-warn" }, "Every seat is taken — you can still watch.")] : []));
  }

  /**
   * Logging in. On any device: if you're already seated in this game you're
   * straight back at the tracker, and the music picks up where you were.
   */
  #pick(id){
    this.game.selectProfile(id);
    this.picked = null;
    this.deps.music?.resumeFor(id, { play:true });
    const state = this.game.state, seat = state?.session ? state.seatOf(id) : null;
    if(seat){
      this.deps.toast.show(`Welcome back, ${seat.profile.name} — you're ${colorById(seat.color)?.label ?? "seated"}.`);
      this.router.go("tracker");
      return;
    }
    this.#setStep("color");
  }

  #setStep(step){
    this.step = step;
    this.profileStep.hidden = step !== "profile";
    this.colorStep.hidden = step !== "color";
    this.render(this.game.state);
  }

  async #create(){
    const id = await this.game.createProfile(this.nameInput.value);
    if(id){ this.nameInput.value = ""; this.nameError.hidden = true; this.#setStep("color"); }
  }

  async #join(){
    const color = this.picked;
    this.joining = true;
    this.render(this.game.state);           /* remote updates keep it in this state too */
    try{
      await this.deps.ensureSession?.();    /* the map on screen becomes the game (waits for the first map) */
      if(await this.game.join(color)){
        this.deps.toast.show(`You're in as ${colorById(color).label}.`);
        this.router.go("");
      }
    }finally{
      this.joining = false;
      this.render(this.game.state);
    }
  }
}
