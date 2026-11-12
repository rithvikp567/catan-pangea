/**
 * Welcome / join: pick your profile (or create one — one per device),
 * then a colour nobody else in this game has, then you're seated.
 */
import { h } from "../dom.js";
import { Screen } from "./Screen.js";
import { PLAYER_COLORS, NAME_MAX, colorById } from "../../game/rules.js";
import { getGenerator } from "../../engine/index.js";
import { syncStatusPill } from "./widgets.js";

export class JoinScreen extends Screen {
  constructor(deps){ super("join", "Who's playing?", deps); }

  build(){
    this.step = "profile";
    this.picked = null;

    this.banner = h("div", { class:"game-banner" });
    this.profileList = h("div", { class:"profile-grid", role:"list" });

    this.nameInput = h("input", {
      type:"text", maxlength:NAME_MAX, placeholder:"Your name", autocomplete:"nickname",
      autocapitalize:"words", "aria-label":"Your name", enterkeyhint:"done",
    });
    this.nameError = h("p", { class:"field-hint is-error", hidden:true });
    this.createForm = h("form", { class:"card create-profile", onSubmit:e => { e.preventDefault(); this.#create(); } },
      h("label", { class:"field-label" }, "New here? Make your profile"),
      h("div", { class:"seed-row" }, this.nameInput, h("button", { type:"submit", class:"btn" }, "Create")),
      this.nameError,
      h("p", { class:"field-hint" }, "One profile per device — use the same browser each game night."));

    this.profileStep = h("div", { class:"step" }, this.profileList, this.createForm);

    this.colorTitle = h("h2", { class:"step-title" });
    this.colorGrid = h("div", { class:"color-grid", role:"radiogroup", "aria-label":"Your colour" });
    this.joinBtn = h("button", { type:"button", class:"btn primary", onClick:() => this.#join() }, "Join game");
    this.colorStep = h("div", { class:"step", hidden:true },
      this.colorTitle, this.colorGrid,
      h("div", { class:"step-actions" },
        h("button", { type:"button", class:"btn", onClick:() => this.#setStep("profile") }, "Back"),
        this.joinBtn));

    const link = (label, route) => h("button", { type:"button", class:"link-btn", onClick:() => this.router.go(route) }, label);
    this.body.append(this.banner, this.profileStep, this.colorStep,
      h("nav", { class:"screen-links" }, link("Season wins", "wins"), link("Admin", "admin"), link("Just show me the map", "")));
  }

  onBack(){ this.step === "color" ? this.#setStep("profile") : this.router.go(""); }

  show(){
    /* returning players land straight on the colour step */
    this.#setStep(this.game.me && this.game.state?.session ? "color" : "profile");
    super.show();
  }

  render(state){
    if(!state) return;
    const game = this.game, me = game.me;
    this.actions.replaceChildren(syncStatusPill(game.status));
    this.#renderBanner(state);

    /* profiles */
    this.profileList.replaceChildren(...state.profiles.map(p => {
      const seat = state.seatOf(p.id);
      return h("button", {
        type:"button", role:"listitem", class:"profile-card",
        "aria-pressed":String(me?.id === p.id), onClick:() => this.#pick(p.id),
      },
        h("span", { class:"avatar", style: seat?.colorHex ? `--c:${seat.colorHex}` : null, "data-colored":String(!!seat?.colorHex) }, p.name.slice(0, 1).toUpperCase()),
        h("span", { class:"profile-name" }, p.name,
          h("small", {}, seat ? `Playing · ${colorById(seat.color)?.label}` : p.deviceId === game.identity.deviceId ? "This device" : "")));
    }));
    if(!state.profiles.length) this.profileList.append(h("p", { class:"empty" }, "No profiles yet — create the first one."));
    this.createForm.hidden = !game.canCreateProfile;

    /* colours */
    if(me){
      const mine = state.seatOf(me.id);
      this.colorTitle.textContent = mine ? `${me.name}, you're in — change colour?` : `Pick your colour, ${me.name}`;
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
      this.joinBtn.disabled = !canSeat || !this.picked;
      this.joinBtn.textContent = mine ? "Save colour" : "Join game";
    }
  }

  #renderBanner(state){
    const s = state.session;
    if(!s){ this.banner.replaceChildren(h("p", {}, "No game yet — it starts with the map on screen when the first player joins.")); return; }
    const filled = state.players - state.openSeats;
    const full = !this.game.mySeat && state.openSeats === 0;
    const lines = [h("p", {}, h("b", {}, `${getGenerator(s.settings?.mode).name} · ${state.players} players`), ` — ${filled} of ${state.players} seats taken`)];
    if(full) lines.push(h("p", { class:"is-warn" }, "Every seat is taken — you can still watch the tracker."));
    this.banner.replaceChildren(...lines);
  }

  #pick(id){
    this.game.selectProfile(id);
    this.picked = null;
    this.#setStep("color");
  }

  #setStep(step){
    this.step = step;
    this.profileStep.hidden = step !== "profile";
    this.colorStep.hidden = step !== "color";
    this.heading.textContent = step === "color" ? "Your colour" : "Who's playing?";
    this.render(this.game.state);
  }

  async #create(){
    const id = await this.game.createProfile(this.nameInput.value);
    if(id){ this.nameInput.value = ""; this.nameError.hidden = true; this.#setStep("color"); }
  }

  async #join(){
    const color = this.picked;
    await this.deps.ensureSession?.();      /* safety net: the map on screen becomes the game */
    if(await this.game.join(color)){
      this.deps.toast.show(`You're in as ${colorById(color).label}.`);
      this.router.go("");
    }
  }
}
