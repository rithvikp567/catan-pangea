/**
 * The in-game tracker, shared live by everyone at the table. Laid out to
 * fit one phone screen without scrolling:
 *   Victory points & honor — one row per seat: that player's honor coin
 *                            (only its owner can flip it), name, and VP
 *                            0–13 (13 triggers the victory screen)
 *   Cities and Knights     — main island knights, off island knights (each
 *                            0–12 × players) and cities (0–4 × players)
 *   Karma, robber & walker — karma ±; the robber (1–3): Abstain makes it
 *                            worth one more, Rob takes its value off karma
 *                            and starts it over at 1; then the word WALKER, one
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
import { MAX_VP, COUNTERS, WALKER_WORD, ROBBER_VALUES } from "../../game/rules.js";
import { syncStatusPill, section, inkOn, ICONS } from "./widgets.js";

const EMPTY_SEAT_HEX = "#B9B5AC";

/**
 * How the lit WALKER letters shake at each level (1–6 letters): how far
 * (px), how much they tilt (degrees) and how long one shake takes (s).
 * Full word: ~2.7 px, 2.1°, every 0.2 s (2.3.x shook 6.3 px, 4.2°, 0.09 s).
 */
const JITTER = Object.freeze({
  amp:v => 0.05 * v * v + 0.15 * v,
  rot:v => 0.35 * v,
  dur:v => Math.max(0.2, 0.5 - 0.05 * v),
});

/** A seat row's smallest height (px): below this for every seat, the screen goes tight (screens.css). */
const ROW_MIN = 42;

export class TrackerScreen extends Screen {
  constructor(deps){
    super("tracker", "Tracker", deps);
    /* the music bar, the mini bar or the browser's own bars change the room: re-check */
    new ResizeObserver(() => this.#fit()).observe(this.el);
  }

  build(){
    this.layoutKey = null;
    this.lastFaces = new Map();

    /* (season wins, music and who's signed in live in the top bar) */
    this.pillSlot = h("span");
    this.actions.append(this.pillSlot);

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

    /* the robber, 1–3: Abstain is karma +1 and the robber worth one more; Rob takes it off karma and starts it over */
    this.robberPips = h("span", { class:"robber-pips", "aria-hidden":"true" }, ROBBER_VALUES.map(() => h("i")));
    this.abstainBtn = h("button", { type:"button", class:"btn robber-act abstain-btn", onClick:() => this.game.abstainRobber() },
      h("span", {}, "Abstain"), this.robberPips);
    this.robValue = h("span", { class:"rob-value" });
    this.robBtn = h("button", { type:"button", class:"btn robber-act rob-btn", onClick:() => this.game.rob() }, h("span", {}, "Rob"), this.robValue);

    this.sections = h("div", { class:"tracker-grid" },
      section("Victory points & honor", this.vpList),
      section("Cities and Knights", h("div", { class:"tiles" },
        tile("knightsMain", "Main island"),
        tile("knightsOff", "Off island"),
        tile("cities", "Cities"))),
      section("Karma, robber & walker", h("div", { class:"tiles is-karma" },
        tile("karma", "Karma", { signed:true }),
        h("div", { class:"tile robber-tile" }, h("span", { class:"tile-label", "aria-hidden":"true" }, "Robber"),
          h("div", { class:"robber-acts" }, this.abstainBtn, this.robBtn))),
        this.buildWalker()));

    this.body.append(this.meta, this.empty, this.sections);
  }

  /** In the music & tracker view, back brings the map back (DesktopLayout.showMap). */
  onBack(){
    const layout = this.deps.layout;
    if(layout?.splitActive) layout.showMap();
    else this.router.go("");
  }

  render(state){
    this.pillSlot.replaceChildren(syncStatusPill(this.game.status));
    const session = state?.session;
    this.empty.hidden = !!session;
    this.sections.hidden = !session;
    if(!session) { this.meta.replaceChildren(); return; }

    const me = this.game.me, mySeat = this.game.mySeat, seats = state.seats;
    /* (who's signed in is in the top bar; here only a way in for someone not seated yet) */
    this.meta.replaceChildren(
      h("span", { class:"tracker-seed" }, `Seed ${session.meta.seed} · ${state.players} players`),
      ...(mySeat ? [] : [h("button", { type:"button", class:"link-btn", onClick:() => this.router.go("join") }, me ? `Join as ${me.name}` : "Join the game")]));

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
    this.#fit();
    const top = ROBBER_VALUES.at(-1), pts = n => `${n} ${n === 1 ? "point" : "points"}`;
    [...this.robberPips.children].forEach((pip, i) => pip.toggleAttribute("data-lit", i < c.robber));
    this.abstainBtn.setAttribute("aria-label", c.robber >= top
      ? `Abstain: karma up by 1; the robber stays at its most, ${pts(top)}`
      : `Abstain: karma up by 1, and the robber goes from ${pts(c.robber)} to ${pts(c.robber + 1)}`);
    this.robValue.textContent = `−${c.robber}`;
    this.robBtn.setAttribute("aria-label", `Rob: karma down by ${c.robber}, and the robber starts over at 1`);
    this.#bump(this.robberPips, c.robber, "robber");
    this.#bump(this.shared.get("karma").el.querySelector(".counter-value") ?? this.shared.get("karma").el, c.karma, "karma");
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
        /* shakes harder (and faster) with every letter — JITTER sets how much */
        word.style.setProperty("--amp", `${JITTER.amp(value).toFixed(2)}px`);
        word.style.setProperty("--rot", `${JITTER.rot(value).toFixed(2)}deg`);
        word.style.setProperty("--dur", `${JITTER.dur(value).toFixed(2)}s`);
        out.setAttribute("aria-label", value ? `${WALKER_WORD.slice(0, value)}: ${value} of ${WALKER_WORD.length} letters` : "No letters yet");
      },
    });
    ctl.el.classList.add("walker");
    this.shared.set("walker", ctl);
    return ctl.el;
  }

  /** A quick pop on a value that just changed (from any phone), not on the first paint. */
  #bump(el, value, key){
    this.bumped ??= new Map();
    const was = this.bumped.get(key);
    this.bumped.set(key, value);
    if(was === undefined || was === value) return;
    el.classList.remove("is-bumped");
    void el.offsetWidth;                     /* restart the animation */
    el.classList.add("is-bumped");
  }

  /**
   * Roomy or tight (screens.css): tight when the screen is shorter than the
   * roomy layout needs with every seat row at its smallest.
   */
  #fit(){
    if(!this.visible) return;
    const cs = getComputedStyle(this.el);
    const room = this.el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const chrome = parseFloat(getComputedStyle(this.vpList).getPropertyValue("--tracker-chrome")) || 404;
    const seats = this.vpControls?.size ?? 4;
    this.el.dataset.fit = room < chrome + seats * ROW_MIN ? "tight" : "roomy";
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
