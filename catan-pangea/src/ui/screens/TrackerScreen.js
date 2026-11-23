/**
 * The in-game tracker of this device's room, shared live by everyone in
 * it. What it shows follows the room — its board and its mods — and it's
 * laid out to fit one phone screen without scrolling:
 *   Victory points & honor — one row per seat: that player's honor coin
 *                            (only its owner can flip it), name, and VP
 *                            0 … the points to win (13 on Cities & Knights,
 *                            10 in the base game, or the room's own; it
 *                            triggers the victory screen)
 *   Cities and Knights     — main island knights, off island knights (each
 *                            0–12 × players) and cities (0–4 × players), and
 *                            Battle (the Battle mod: knight duels). Not on a
 *                            base game board. On a wide screen it's a
 *                            square beside the players (the two side by side).
 *   Karma and Robber & Walker — named for the mods that are on, showing only
 *                            theirs: karma ±; the robber (1–3): Abstain makes
 *                            it worth one more, Rob takes its value off
 *                            karma and starts it over at 1; then the word
 *                            WALKER, one letter per 7 rolled with the
 *                            barbarians — the lit letters shake harder as it
 *                            fills, and WinterEffect snows over every
 *                            phone's screen
 *
 * Structure is rebuilt only when the seating (or the points to win)
 * changes; values update in place so a press-and-hold isn't interrupted by
 * other phones' updates.
 */
import { h } from "../dom.js";
import { Screen } from "./Screen.js";
import { CounterControl } from "../controls.js";
import { COUNTERS, WALKER_WORD, ROBBER_VALUES } from "../../game/rules.js";
import { syncStatusPill, section, inkOn, icon, ICONS } from "./widgets.js";

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

/** A seat row's smallest and tallest height (px, the clamp in screens.css): below the smallest for every
    seat, the screen goes tight. */
const ROW_MIN = 42, ROW_MAX = 54;

/**
 * The music & tracker view (split.css) gives the tracker half the window,
 * and the tracker grows to fill it — zoomed, so the rows, buttons and
 * numbers all grow together — `mx` / `my` px from the half's edges (plus
 * its own padding). Before the zoom the column is `minW`–`maxW` px wide;
 * it grows at most `maxZoom` times.
 */
const GROW = Object.freeze({ mx:8, my:12, minW:440, maxW:720, maxZoom:2 });

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
    this.empty = h("div", { class:"card empty" }, h("p", {}, "No game open."),
      h("button", { type:"button", class:"btn", onClick:() => this.router.go("rooms") }, "Today's games"));
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

    /* Battle (the Battle mod): knight duels — under the knights (beside them on a phone) */
    this.battleTile = h("div", { class:"tile battle-tile" },
      h("span", { class:"tile-label", "aria-hidden":"true" }, "Battle"),
      h("button", { type:"button", class:"btn battle-btn", "aria-label":"Battle: challenge a knight", onClick:() => this.deps.battle?.open() },
        icon(ICONS.swords), h("span", { class:"battle-btn-text" }, "Battle")));

    this.vpCard = section("Victory points & honor", this.vpList);
    this.ckCard = section("Cities and Knights", h("div", { class:"tiles ck-tiles" },
      tile("knightsMain", "Main island"),
      tile("knightsOff", "Off island"),
      tile("cities", "Cities"),
      this.battleTile));
    this.karmaRow = h("div", { class:"tiles is-karma" },
      tile("karma", "Karma", { signed:true }),
      h("div", { class:"tile robber-tile" }, h("span", { class:"tile-label", "aria-hidden":"true" }, "Robber"),
        h("div", { class:"robber-acts" }, this.abstainBtn, this.robBtn)));
    this.walkerEl = this.buildWalker();
    this.karmaCard = section("", this.karmaRow, this.walkerEl);       /* (titled for the mods that are on) */
    this.vpCard.classList.add("vp-card");
    this.ckCard.classList.add("ck-card");
    this.karmaCard.classList.add("karma-card");
    /* the players and the knights: side by side on a wide screen, stacked on a phone */
    this.sections = h("div", { class:"tracker-grid" }, h("div", { class:"tracker-pair" }, this.vpCard, this.ckCard), this.karmaCard);

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
    const room = state ? this.game.room : null, session = room?.session;
    this.empty.hidden = !!session;
    this.sections.hidden = !session;
    if(!session) { this.meta.replaceChildren(); return; }

    const me = this.game.me, mySeat = this.game.mySeat, seats = room.seats;
    /* (who's signed in is in the top bar; here only a way in for someone not seated yet) */
    this.meta.replaceChildren(
      h("span", { class:"tracker-seed" }, `${room.name} · Seed ${session.meta.seed} · ${room.players} players`),
      ...(mySeat ? [] : [h("button", { type:"button", class:"link-btn", onClick:() => this.router.go(me ? "seat" : "join") }, me ? `Join as ${me.name}` : "Join the game")]));

    this.#showMods(room);
    const key = [room.id, room.sessionId, room.vpToWin, seats.map(s => `${s.profileId}:${s.color}`).join(","), me?.id ?? ""].join("|");
    if(key !== this.layoutKey){ this.layoutKey = key; this.#buildSeats(seats, mySeat, room.vpToWin); }

    /* values */
    for(const s of seats){
      this.vpControls.get(s.key).set(s.vp);
      this.#paintCoin(s);
    }
    const c = room.counters;
    for(const [name, ctl] of this.shared){
      const rule = COUNTERS[name];
      ctl.setBounds(rule.min(room.players), rule.max(room.players));
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

  /**
   * Only what the room plays with: the knights and cities on a Cities &
   * Knights board (with Battle, if it's on), and the karma tile titled for
   * — and showing only — Karma and Robber and / or Walker.
   */
  #showMods(room){
    const { mods } = room, title = mods.karmaTitle;
    this.ckCard.hidden = !room.citiesKnights;
    this.battleTile.hidden = !room.battleOn;
    this.ckCard.toggleAttribute("data-battle", room.battleOn);
    this.karmaCard.hidden = !title;
    this.karmaCard.querySelector(".card-title").textContent = title ?? "";
    this.karmaRow.hidden = !mods.karmaRobber;
    this.walkerEl.hidden = !mods.walker;
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
   * roomy layout needs with every seat row at its smallest. The rows share
   * what everything else leaves (`--tracker-chrome`), measured as it's laid
   * out — so a room with fewer mods (fewer tiles) gives its rows more.
   */
  #fit(){
    if(!this.visible || this.sections.hidden) return;
    const st = this.el.style;
    st.removeProperty("--grow"); st.removeProperty("--grow-w");         /* (measured at its own size) */
    const cs = getComputedStyle(this.el);
    const room = this.el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const seats = this.vpControls?.size ?? 4;
    this.el.dataset.fit = "roomy";
    const roomy = this.#chrome();
    const tight = room < roomy + seats * ROW_MIN;
    this.el.dataset.fit = tight ? "tight" : "roomy";
    st.setProperty("--tracker-chrome", `${Math.ceil(tight ? this.#chrome() : roomy)}px`);
    /* docked on desktop over the music: the column gives the tracker just this (its rows at their tallest) */
    this.deps.layout?.fitTracker(Math.ceil(roomy + seats * ROW_MAX + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)));
    this.#grow();
  }

  /** Everything on the screen but the seat rows (px), as laid out right now. */
  #chrome(){
    const inner = this.el.firstElementChild, ci = getComputedStyle(inner);
    const total = [...inner.children].reduce((sum, el) => sum + el.offsetHeight, parseFloat(ci.paddingTop) + parseFloat(ci.paddingBottom));
    return total - this.vpList.offsetHeight;
  }

  /**
   * In the music & tracker view, fill the half (GROW): measure the tracker
   * at its own size, zoom it as far as the half's height allows (or its
   * width, at the narrowest column), and make the column as wide as the
   * half then leaves. Never when tight (no room to grow), nor anywhere else.
   */
  #grow(){
    const s = this.el.style;
    s.removeProperty("--grow");
    s.removeProperty("--grow-w");
    if(document.body.dataset.view !== "split" || this.el.dataset.fit !== "roomy") return;
    const inner = this.el.firstElementChild, cs = getComputedStyle(this.el), ci = getComputedStyle(inner);
    const w = this.el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2 * GROW.mx;
    const h = this.el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2 * GROW.my;
    const tall = [...inner.children].reduce((sum, el) => sum + el.offsetHeight, parseFloat(ci.paddingTop) + parseFloat(ci.paddingBottom));
    const zoom = Math.min(GROW.maxZoom, (h - 1) / tall, w / GROW.minW);
    if(!(zoom > 1.02)) return;
    s.setProperty("--grow", zoom.toFixed(3));
    s.setProperty("--grow-w", `${Math.floor(Math.min(GROW.maxW, w / zoom))}px`);
  }

  #buildSeats(seats, mySeat, vpToWin){
    this.vpControls = new Map();
    this.coins = new Map();
    this.vpList.style.setProperty("--seats", String(seats.length));   /* rows share the height left over */
    this.vpList.replaceChildren(...seats.map(s => {
      const name = s.profile ? s.profile.name : `Open seat ${s.index + 1}`;
      const mine = s.key === mySeat?.key;
      const hex = s.colorHex ?? EMPTY_SEAT_HEX;
      const ctl = new CounterControl({ label:`${name} victory points`, min:0, max:vpToWin, onStep:d => this.game.adjustVP(s.key, d) });
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
        h("span", { class:"vp-control" }, ctl.el, h("small", { class:"vp-max" }, `/${vpToWin}`)));
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
