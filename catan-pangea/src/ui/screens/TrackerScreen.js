/**
 * The in-game tracker, shared live by everyone at the table:
 *   Victory points  — one row per seat, 0–13 (13 triggers the victory screen)
 *   Honor             — one coin per seat; you can only flip your own
 *   Cities and Knights — per island: mighty / strong / basic knights and
 *                        the knight strength they add up to (each tier is
 *                        one pool of 2 × players for both islands); plus
 *                        the shared city count (0–4 × players)
 *   Karma & robber    — karma ±; robber cycles 1→2→3, Collect takes it off karma
 *
 * Structure is rebuilt only when the seating changes; values update in
 * place so a press-and-hold isn't interrupted by other phones' updates.
 */
import { h } from "../dom.js";
import { Screen } from "./Screen.js";
import { CounterControl } from "../controls.js";
import { MAX_VP, COUNTERS, CITIES_PER_PLAYER, ISLANDS, KNIGHT_TIERS, knightCounter, knightPool, knightsLeft } from "../../game/rules.js";
import { syncStatusPill, section, inkOn, ICONS } from "./widgets.js";

const EMPTY_SEAT_HEX = "#B9B5AC";

export class TrackerScreen extends Screen {
  constructor(deps){ super("tracker", "Tracker", deps); }

  build(){
    this.layoutKey = null;
    this.lastFaces = new Map();
    const row = (label, control, hint) => h("div", { class:"track-row" }, h("span", { class:"track-label" }, label, hint), control);

    const wins = h("button", { type:"button", class:"icon-btn", "aria-label":"Season wins", title:"Season wins", onClick:() => this.router.go("wins") });
    wins.innerHTML = ICONS.trophy;
    this.pillSlot = h("span");
    this.actions.append(this.pillSlot, wins);

    this.meta = h("div", { class:"tracker-meta" });
    this.empty = h("p", { class:"card empty" }, "No game yet — generate a map to start one.");

    this.vpList = h("div", { class:"vp-list" });
    this.coinRow = h("div", { class:"coin-row" });

    /* bounded counters that scale with the table: name → { ctl, hint, hintOf(state) } */
    this.scaled = new Map();
    const scaled = (name, hintOf) => {
      const ctl = new CounterControl({ label:COUNTERS[name].label, min:0, max:0, onStep:d => this.game.adjustCounter(name, d) });
      const hint = h("small");
      this.scaled.set(name, { ctl, hint, hintOf });
      return { ctl, hint };
    };
    this.strength = new Map();
    const islandBlocks = ISLANDS.map(island => {
      const total = h("b", { class:"strength-value" }, "0");
      this.strength.set(island.id, total);
      return h("div", { class:"island" },
        h("div", { class:"island-head" },
          h("h3", {}, island.label),
          h("span", { class:"strength", "aria-label":`${island.label} knight strength` }, "Knight strength", total)),
        ...KNIGHT_TIERS.map(t => {
          const { ctl, hint } = scaled(knightCounter(island.id, t.id),
            st => `×${t.strength} · ${knightsLeft(st.counters, t.id, st.players)} of ${knightPool(st.players)} left`);
          return row(t.label, ctl.el, hint);
        }));
    });
    const cities = scaled("cities", st => `max ${CITIES_PER_PLAYER * st.players}`);

    this.karma = new CounterControl({
      label:"Karma", min:COUNTERS.karma.min(), max:COUNTERS.karma.max(),
      onStep:d => this.game.adjustCounter("karma", d), signed:true,
    });
    this.robberBtn = h("button", { type:"button", class:"robber-btn", onClick:() => this.game.cycleRobber() });
    this.collectBtn = h("button", { type:"button", class:"btn collect-btn", onClick:() => this.game.collectRobber() });

    const citiesKnights = section("Cities and Knights", ...islandBlocks, h("div", { class:"island cities" }, row("Cities", cities.ctl.el, cities.hint)));
    citiesKnights.classList.add("is-tall");     /* spans two rows beside Honor + Karma on wide screens */
    this.sections = h("div", { class:"tracker-grid" },
      section("Victory points", this.vpList),
      section("Honor", this.coinRow),
      citiesKnights,
      section("Karma & robber",
        row("Karma", this.karma.el),
        h("div", { class:"track-row" },
          h("span", { class:"track-label" }, "Robber", h("small", {}, "Tap to cycle 1 → 2 → 3")),
          this.robberBtn),
        this.collectBtn));

    this.body.append(this.meta, this.empty, this.sections);
  }

  render(state){
    this.pillSlot.replaceChildren(syncStatusPill(this.game.status));
    const session = state?.session;
    this.empty.hidden = !!session;
    this.sections.hidden = !session;
    if(!session) { this.meta.replaceChildren(); return; }

    const me = this.game.me, mySeat = this.game.mySeat, seats = state.seats;
    this.meta.replaceChildren(
      h("span", {}, `Seed ${session.meta.seed} · ${state.players} players`),
      h("button", { type:"button", class:"link-btn", onClick:() => this.router.go("join") },
        mySeat ? `Playing as ${me.name} · change` : me ? `Join as ${me.name}` : "Join the game"));

    const key = state.sessionId + "|" + seats.map(s => `${s.profileId}:${s.color}`).join(",") + "|" + (me?.id ?? "");
    if(key !== this.layoutKey){ this.layoutKey = key; this.#buildSeats(seats, mySeat); }

    /* values */
    for(const s of seats){
      this.vpControls.get(s.key).set(s.vp);
      this.#paintCoin(s);
    }
    const c = state.counters;
    for(const [name, { ctl, hint, hintOf }] of this.scaled){
      ctl.setBounds(COUNTERS[name].min(state.players), COUNTERS[name].max(state.players, c)); ctl.set(c[name]);
      hint.textContent = hintOf(state);
    }
    for(const [island, el] of this.strength) el.textContent = String(state.knightStrength[island]);
    this.karma.set(c.karma);
    this.robberBtn.replaceChildren(h("span", { class:"robber-value" }, String(c.robber)), h("span", {}, c.robber === 1 ? "point" : "points"));
    this.robberBtn.setAttribute("aria-label", `Robber worth ${c.robber}. Tap to change.`);
    this.collectBtn.textContent = `Collect: −${c.robber}`;
  }

  #buildSeats(seats, mySeat){
    this.vpControls = new Map();
    this.coins = new Map();
    this.vpList.replaceChildren(...seats.map(s => {
      const name = s.profile ? s.profile.name : `Open seat ${s.index + 1}`;
      const ctl = new CounterControl({ label:`${name} victory points`, min:0, max:MAX_VP, onStep:d => this.game.adjustVP(s.key, d) });
      this.vpControls.set(s.key, ctl);
      return h("div", { class:"vp-row", "data-me":String(s.key === mySeat?.key), "data-open":String(!s.profile) },
        h("span", { class:"seat-dot", style:`--c:${s.colorHex ?? EMPTY_SEAT_HEX}` }),
        h("span", { class:"vp-name" }, name, s.key === mySeat?.key ? h("small", {}, "you") : null),
        h("span", { class:"vp-control" }, ctl.el, h("small", { class:"vp-max" }, `/${MAX_VP}`)));
    }));

    this.coinRow.replaceChildren(...seats.map(s => {
      const hex = s.colorHex ?? EMPTY_SEAT_HEX;
      const mine = s.key === mySeat?.key;
      const face = h("span", { class:"coin-face", style:`--c:${hex};--coin-ink:${inkOn(hex)};--coin:${hex}` });
      const state = h("small", { class:"coin-state" });
      const label = h("span", { class:"coin-name" }, s.profile ? s.profile.name : "Open");
      const el = mine
        ? h("button", { type:"button", class:"coin is-mine", onClick:() => this.game.flipMyCoin() }, face, label, state)
        : h("div", { class:"coin", "data-open":String(!s.profile) }, face, label, state);
      this.coins.set(s.key, { el, face, state, mine, name:s.profile?.name ?? "Open seat" });
      return el;
    }));
    this.lastFaces.clear();
  }

  #paintCoin(seat){
    const coin = this.coins.get(seat.key);
    const faceName = seat.honorable ? "heads" : "tails";
    if(coin.el.dataset.face === faceName) return;
    const flipped = this.lastFaces.has(seat.key);
    coin.el.dataset.face = faceName;
    coin.face.innerHTML = ICONS[faceName];   /* static, trusted markup */
    coin.state.textContent = seat.honorable ? "Honorable" : "Dishonorable";
    coin.el.setAttribute("aria-label",
      `${coin.name}: ${seat.honorable ? "honorable" : "dishonorable"}${coin.mine ? ". Tap to flip your coin." : ""}`);
    if(flipped){
      coin.face.classList.remove("is-flipping");
      void coin.face.offsetWidth;            /* restart the animation */
      coin.face.classList.add("is-flipping");
    }
    this.lastFaces.set(seat.key, faceName);
  }
}
