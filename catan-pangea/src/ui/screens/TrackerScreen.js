/**
 * The in-game tracker, shared live by everyone at the table. Laid out to
 * fit one phone screen without scrolling:
 *   Victory points & honor — one row per seat: that player's honor coin
 *                            (only its owner can flip it), name, and VP
 *                            0–13 (13 triggers the victory screen)
 *   Cities and Knights     — main island knights, off island knights (each
 *                            0–12 × players) and cities (0–4 × players)
 *   Karma, robber & walker — karma ±; robber cycles 1→2→3, Collect takes
 *                            its value off karma; then the word WALKER, one
 *                            letter per 7 rolled with the barbarians — the
 *                            lit letters shake harder as it fills, and
 *                            WinterEffect snows over every phone's screen
 *
 * Structure is rebuilt only when the seating changes; values update in
 * place so a press-and-hold isn't interrupted by other phones' updates.
 */
import { h } from "../dom.js";
import { Screen } from "./Screen.js";
import { CounterControl } from "../controls.js";
import { MAX_VP, COUNTERS, WALKER_WORD } from "../../game/rules.js";
import { syncStatusPill, section, inkOn, ICONS } from "./widgets.js";

const EMPTY_SEAT_HEX = "#B9B5AC";

export class TrackerScreen extends Screen {
  constructor(deps){ super("tracker", "Tracker", deps); }

  build(){
    this.layoutKey = null;
    this.lastFaces = new Map();

    const wins = h("button", { type:"button", class:"icon-btn", "aria-label":"Season wins", title:"Season wins", onClick:() => this.router.go("wins") });
    wins.innerHTML = ICONS.trophy;
    const music = h("button", { type:"button", class:"icon-btn" });
    music.innerHTML = ICONS.music;
    this.deps.music?.addOpener(music);       /* the music bar stays docked on every screen */
    this.pillSlot = h("span");
    this.actions.append(this.pillSlot, music, wins);

    this.meta = h("div", { class:"tracker-meta" });
    this.empty = h("p", { class:"card empty" }, "No game yet — generate a map to start one.");
    this.vpList = h("div", { class:"vp-list" });

    /* shared counters as compact tiles — a label over a stepper; bounds follow the table size */
    this.shared = new Map();
    const tile = (name, label, opts = {}) => {
      const rule = COUNTERS[name];
      const ctl = new CounterControl({ label:rule.label, min:rule.min(0), max:rule.max(0), onStep:d => this.game.adjustCounter(name, d), ...opts });
      this.shared.set(name, ctl);
      return h("div", { class:"tile" }, h("span", { class:"tile-label", "aria-hidden":"true" }, label), ctl.el);
    };

    this.robberValue = h("span", { class:"robber-value" });
    this.robberBtn = h("button", { type:"button", class:"robber-btn", title:"Tap to cycle 1 → 2 → 3", onClick:() => this.game.cycleRobber() }, this.robberValue);
    this.collectBtn = h("button", { type:"button", class:"btn collect-btn", onClick:() => this.game.collectRobber() });

    this.sections = h("div", { class:"tracker-grid" },
      section("Victory points & honor", this.vpList),
      section("Cities and Knights", h("div", { class:"tiles" },
        tile("knightsMain", "Main island"),
        tile("knightsOff", "Off island"),
        tile("cities", "Cities"))),
      section("Karma, robber & walker", h("div", { class:"tiles is-karma" },
        tile("karma", "Karma", { signed:true }),
        h("div", { class:"tile" }, h("span", { class:"tile-label", "aria-hidden":"true" }, "Robber"), this.robberBtn),
        this.collectBtn),
        this.buildWalker()));

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
      h("span", { class:"tracker-seed" }, `Seed ${session.meta.seed} · ${state.players} players`),
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
    for(const [name, ctl] of this.shared){
      const rule = COUNTERS[name];
      ctl.setBounds(rule.min(state.players), rule.max(state.players));
      ctl.set(c[name]);
    }
    this.robberValue.textContent = String(c.robber);
    this.robberBtn.setAttribute("aria-label", `Robber worth ${c.robber} ${c.robber === 1 ? "point" : "points"}. Tap to cycle 1, 2, 3.`);
    this.collectBtn.textContent = `Collect: −${c.robber}`;
  }

  /** − W A L K E R + : one letter per 7 rolled with the barbarians; + on R starts over. */
  buildWalker(){             /* not #private: build() runs inside the base constructor */
    const letters = [...WALKER_WORD].map((ch, i) => h("span", { class:"walker-letter", style:`--i:${i}` }, ch));
    const word = h("span", { class:"walker-word", "aria-hidden":"true" }, letters);
    const rule = COUNTERS.walker;
    const ctl = new CounterControl({
      label:"Walker (7s with the barbarians)", min:rule.min(0), max:rule.max(0), wraps:true,
      onStep:d => this.game.adjustCounter("walker", d),
      paint:(out, value) => {
        if(!out.contains(word)) out.replaceChildren(word);
        letters.forEach((l, i) => l.toggleAttribute("data-lit", i < value));
        word.dataset.level = String(value);
        /* shakes harder (and faster) with every letter */
        word.style.setProperty("--amp", `${(0.25 * value * value / 2 + 0.3 * value).toFixed(2)}px`);
        word.style.setProperty("--rot", `${(0.7 * value).toFixed(1)}deg`);
        word.style.setProperty("--dur", `${Math.max(0.09, 0.42 - 0.055 * value).toFixed(2)}s`);
        out.setAttribute("aria-label", value ? `${WALKER_WORD.slice(0, value)}: ${value} of ${WALKER_WORD.length} letters` : "No letters yet");
      },
    });
    ctl.el.classList.add("walker");
    this.shared.set("walker", ctl);
    return ctl.el;
  }

  #buildSeats(seats, mySeat){
    this.vpControls = new Map();
    this.coins = new Map();
    this.vpList.style.setProperty("--seats", String(seats.length));   /* rows share the height left over */
    this.vpList.replaceChildren(...seats.map(s => {
      const name = s.profile ? s.profile.name : `Open seat ${s.index + 1}`;
      const mine = s.key === mySeat?.key;
      const hex = s.colorHex ?? EMPTY_SEAT_HEX;
      const ctl = new CounterControl({ label:`${name} victory points`, min:0, max:MAX_VP, onStep:d => this.game.adjustVP(s.key, d) });
      this.vpControls.set(s.key, ctl);

      /* the seat's honor coin, in its color — a button only for its owner */
      const face = h("span", { class:"coin-face", style:`--c:${hex};--coin-ink:${inkOn(hex)}` });
      const coin = mine
        ? h("button", { type:"button", class:"coin is-mine", onClick:() => this.game.flipMyCoin() }, face)
        : h("span", { class:"coin", role:"img" }, face);
      const honor = h("small", { class:"coin-state" });
      this.coins.set(s.key, { el:coin, face, state:honor, mine, name:s.profile?.name ?? "Open seat" });

      return h("div", { class:"vp-row", "data-me":String(mine), "data-open":String(!s.profile) },
        coin,
        h("span", { class:"vp-name" },
          h("span", { class:"vp-name-line" }, h("span", { class:"vp-name-text" }, name), mine ? h("small", { class:"you" }, "you") : null),
          honor),
        h("span", { class:"vp-control" }, ctl.el, h("small", { class:"vp-max" }, `/${MAX_VP}`)));
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
