/**
 * Knight duels (the Battle mod) on this device — a pop-up of its own for
 * each player, over the game (never over the YouTube player: placed like
 * the victory screen). The rules are game/battle.js; the battle itself is
 * shared (RoomService), so both players' devices follow it:
 *
 *   foes        Battle (the tracker's button): everyone else seated, each
 *               with their cards 1–6 — the spent ones greyed. Tap a name
 *               to challenge them.
 *   waiting     the challenger, until they answer (× calls it off).
 *   challenged  the one challenged: Fight, or Retreat (the knight moves
 *               away and stays active).
 *   duel        both: the foe's cards (what they've spent) over your own
 *               knight — three circles, each a knight in your color
 *               (ui/knights.js: basic · strong · mighty): the one you pick
 *               moves to the middle and the others fold in under it (pick
 *               it again and they spread out) — and your cards; Battle
 *               readies you.
 *   fight       once both are ready: each side's knight charges on its
 *               horse, they collide in a cloud of dust, and the dust fades
 *               into…
 *   result      from this player's side — "Rithvik Wins" or "Sam Loses"
 *               (a tie: "Standoff") — and each side's knight, the winner's
 *               triumphant, the loser's bandaged, with its card. × or it
 *               closes after 10 s.
 *
 * No hints or summaries in grey: names, cards, knights and buttons only.
 */
import { h } from "./dom.js";
import { knight, rider, dust, pips, shadeOf } from "./knights.js";
import { icon, ICONS, inkOn } from "./screens/widgets.js";
import { CARDS, KNIGHTS, BATTLE_TIMES, battleStatus, isSpent, outcome, strength } from "../game/battle.js";

/** The charge, the collision and the dust fading into the result (css/screens.css: "the charge"). */
const CHARGE_MS = 2400;
/** A finished battle this recent still shows its result on a device that just caught up. */
const FRESH_MS = 10_000;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export class BattleOverlay {
  /**
   * @param {{ game:import("../app/GameController.js").GameController, toast:{ show:(msg:string) => void },
   *   onToggle?:(shown:boolean) => void }} deps  onToggle: when it shows or hides (App blurs the mini bar behind it)
   */
  constructor({ game, toast, onToggle = () => {} }){
    Object.assign(this, { game, toast, onToggle });
    this.mode = null;            /* null | "foes" | "battle" */
    this.battleId = null;        /* the battle on show */
    this.pick = { level:null, card:null };
    this.viewKey = "";
    this.lapseTimer = this.closeTimer = this.scuffleTimer = null;
    this.card = h("div", { class:"battle-card" });
    this.el = h("div", { class:"battle", role:"dialog", "aria-modal":"true", "aria-label":"Battle", hidden:true,
      onClick:e => { if(e.target === this.el && this.mode === "foes") this.close(); } }, this.card);
    document.addEventListener("keydown", e => { if(e.key === "Escape" && !this.el.hidden && this.mode === "foes") this.close(); });
    document.body.append(this.el);
  }

  /** The tracker's Battle button: your battle if you're in one, otherwise who to challenge. */
  open(){
    const room = this.game.room, me = this.game.me;
    if(!room?.battleOn || !this.game.mySeat){ this.toast.show("Take a seat in this game to battle."); return; }
    const mine = room.openBattleOf(me.id, this.game.now());
    if(mine) this.#follow(mine.id);
    else if(!room.seated.some(s => s.profileId !== me.id)){ this.toast.show("Nobody else is seated yet."); return; }
    else{ this.mode = "foes"; this.battleId = null; }
    this.update();
  }

  close(){
    this.mode = null;
    this.battleId = null;
    this.pick = { level:null, card:null };
    this.viewKey = "";
    for(const t of ["lapseTimer", "closeTimer", "scuffleTimer"]){ clearTimeout(this[t]); this[t] = null; }
    this.#setShown(false);
  }

  #setShown(on){
    if(this.el.hidden === !on) return;
    this.el.hidden = !on;
    this.onToggle(on);
  }

  /** On every change to the game (App): follow the battle this player is in. */
  update(){
    const room = this.game.room, me = this.game.me, t = this.game.now();
    if(!room?.battleOn || !me || !room.seatOf(me.id)){ if(!this.el.hidden || this.mode) this.close(); return; }
    let b = this.battleId ? room.battleList.find(x => x.id === this.battleId) : null;
    if(!this.battleId){
      /* a battle reaching this player — a challenge (over the list of foes, too), or one started on
         their other device */
      const open = room.openBattleOf(me.id, t);
      if(open){ this.#follow(open.id); b = open; }
    }
    if(this.battleId && !b){ this.close(); return; }      /* (a new map started over: its battles are gone) */
    if(this.mode === "foes"){
      const key = room.seated.filter(s => s.profileId !== me.id).map(s => [s.profileId, s.profile.name, s.color, room.spent(s.profileId)].join("|"));
      return this.#show(`foes:${key.join(",")}`, () => this.#viewFoes(room, me));
    }
    if(this.mode !== "battle" || !b) return;
    this.#paintBattle(room, me, b, t);
  }

  #follow(id){
    if(this.battleId === id) return;
    this.close();
    this.mode = "battle";
    this.battleId = id;
  }

  #paintBattle(room, me, b, t){
    const status = battleStatus(b, t), mine = b.from === me.id, foeId = mine ? b.to : b.from;
    const foe = room.seatOf(foeId), self = room.seatOf(me.id);
    if(!foe || !self){ this.close(); return; }
    clearTimeout(this.lapseTimer);
    if(status === "asked" || status === "fight"){
      /* wake up when it would lapse */
      const until = (status === "asked" ? b.at + BATTLE_TIMES.askMs : (b.answeredAt ?? b.at) + BATTLE_TIMES.fightMs) - t + 50;
      this.lapseTimer = setTimeout(() => this.update(), Math.max(50, until));
    }
    if(status === "asked") return mine
      ? this.#show(`wait:${b.id}`, () => this.#viewWaiting(b, foe))
      : this.#show(`asked:${b.id}`, () => this.#viewChallenged(b, foe));
    if(status === "fight"){
      const ready = !!b.picks?.[me.id], foeReady = !!b.picks?.[foeId];
      return this.#show(`duel:${b.id}:${ready}:${foeReady}:${room.spent(me.id)}:${room.spent(foeId)}`,
        () => this.#viewDuel(room, b, self, foe, { ready, foeReady }));
    }
    if(status === "done"){
      if(t - (b.doneAt ?? 0) > FRESH_MS && !this.viewKey.startsWith(`fight:${b.id}`) && !this.viewKey.startsWith(`result:${b.id}`)){ this.close(); return; }
      if(this.viewKey.startsWith(`result:${b.id}`) || this.viewKey.startsWith(`fight:${b.id}`)) return;
      return this.#show(`fight:${b.id}`, () => this.#viewScuffle(room, b, self, foe));
    }
    if(status === "retreat"){
      if(!mine){ this.close(); return; }                  /* (they chose it) */
      return this.#show(`retreat:${b.id}`, () => { this.#autoClose(); return this.#viewRetreat(foe); });
    }
    /* called off, or left too long */
    if(status === "lapsed" && mine && b.state === "asked") this.toast.show(`${foe.profile.name} didn't answer.`);
    else if(status === "cancelled" || status === "lapsed") this.toast.show("The battle was called off.");
    this.close();
  }

  /** Swap the card's content when the view changed (not on every update: the animations play on). */
  #show(key, build){
    this.#setShown(true);
    if(key === this.viewKey) return;
    this.viewKey = key;
    this.card.replaceChildren(...[].concat(build()));
    this.card.dataset.view = key.split(":")[0];
  }

  #autoClose(){
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.close(), BATTLE_TIMES.showMs);
  }

  /* ---------------- views ---------------- */

  #viewFoes(room, me){
    const foes = room.seated.filter(s => s.profileId !== me.id);
    return [
      this.#closeBtn(() => this.close()),
      this.#title(),
      h("div", { class:"battle-foes", role:"list" }, foes.map(s => h("button", {
        type:"button", class:"battle-foe", role:"listitem", "aria-label":`Challenge ${s.profile.name}`,
        onClick:() => this.#challenge(s.profileId),
      }, avatar(s), h("span", { class:"battle-foe-name" }, s.profile.name), cardStrip(room.spent(s.profileId), { small:true, hex:s.colorHex })))),
    ];
  }

  #viewWaiting(b, foe){
    return [
      this.#closeBtn(() => this.#call(b, "cancel")),
      h("div", { class:"battle-versus" }, avatar(foe, true), icon(ICONS.swords, "battle-pulse")),
      h("h2", { class:"battle-title" }, foe.profile.name),
    ];
  }

  #viewChallenged(b, foe){
    return [
      h("div", { class:"battle-versus" }, avatar(foe, true), icon(ICONS.swords, "battle-pulse")),
      h("h2", { class:"battle-title" }, `${foe.profile.name} challenges you`),
      h("div", { class:"battle-actions" },
        h("button", { type:"button", class:"btn", onClick:() => this.#call(b, "answer", { fight:false }) }, "Retreat"),
        h("button", { type:"button", class:"btn primary", onClick:() => this.#call(b, "answer", { fight:true }) }, "Fight")),
    ];
  }

  #viewDuel(room, b, self, foe, { ready, foeReady }){
    const spent = room.spent(self.profileId);
    if(this.pick.card != null && isSpent(spent, this.pick.card)) this.pick.card = null;
    const knights = h("div", { class:"battle-knights", role:"radiogroup", "aria-label":"Your knight" },
      KNIGHTS.map(k => h("button", {
        type:"button", role:"radio", class:"knight", style:knightStyle(self.colorHex), "data-level":String(k.level),
        "aria-label":`${k.label} knight`, disabled:ready, onClick:() => this.#pickKnight(k.level),
      }, knight(k.level, self.colorHex), pips(k.level))));
    const cards = cardStrip(spent, { hex:self.colorHex, onPick:ready ? null : c => this.#pickCard(c) });
    const go = h("button", { type:"button", class:"btn primary battle-go", disabled:ready, onClick:() => this.#ready(b) },
      icon(ICONS.swords), ready ? "Ready" : "Battle");
    this.duel = { knights, cards, go, ready };
    this.#paintPick();
    return [
      this.#closeBtn(() => this.#call(b, "cancel")),
      this.#title(),
      h("div", { class:"battle-foe-row", "data-ready":String(foeReady) },      /* ready: their avatar rings */
        avatar(foe), h("span", { class:"battle-foe-name" }, foe.profile.name), cardStrip(room.spent(foe.profileId), { small:true, hex:foe.colorHex })),
      knights, cards, go,
    ];
  }

  /**
   * Both are in: the knights charge, collide in a cloud of dust, and the
   * dust fades into the result — laid out underneath from the start (so
   * the card keeps its size), shown as the dust clears.
   */
  #viewScuffle(room, b, self, foe){
    clearTimeout(this.scuffleTimer);
    const revealed = () => {
      this.viewKey = `result:${b.id}`;
      this.card.dataset.view = "result";
      this.#autoClose();
    };
    if(reducedMotion()){ queueMicrotask(revealed); return this.#viewResult(b, self, foe); }
    this.scuffleTimer = setTimeout(revealed, CHARGE_MS);
    const charger = (s, side) => h("span", { class:`charge-rider is-${side}` },
      h("span", { class:"charge-bob" }, rider(b.picks?.[s.profileId]?.level ?? 1, s.colorHex)));
    return [
      ...this.#viewResult(b, self, foe, { reveal:true }),
      h("div", { class:"battle-charge", "aria-hidden":"true" },
        charger(self, "left"), charger(foe, "right"), h("span", { class:"charge-dust" }, dust())),
    ];
  }

  /** Who won, and each side's knight — triumphant or bandaged — and card. */
  #viewResult(b, self, foe, { reveal = false } = {}){
    const res = outcome(b), winner = res.winner === self.profileId ? self : res.winner === foe.profileId ? foe : null;
    /* from this player's side: "Rithvik Wins" for the winner, "Sam Loses" for the loser */
    const title = !winner ? "Standoff" : winner === self ? `${self.profile.name} Wins` : `${self.profile.name} Loses`;
    const side = s => {
      const p = b.picks?.[s.profileId], pose = !winner ? "ready" : winner === s ? "victory" : "wounded";
      return h("div", { class:"battle-side", "data-won":String(winner === s), "data-pose":pose },
        h("span", { class:"battle-pose", style:knightStyle(s.colorHex), "data-level":String(p.level),
          role:"img", "aria-label":`${KNIGHTS[p.level - 1].label} knight` }, knight(p.level, s.colorHex, pose)),
        h("span", { class:"battle-card-num", "aria-label":`card ${p.card}` }, String(p.card)),
        h("span", { class:"battle-side-name" }, s.profile.name),
        h("b", { class:"battle-total" }, String(strength(p))));
    };
    return [
      this.#closeBtn(() => this.close()),
      h("div", { class:`battle-result${reveal ? " is-revealing" : ""}` },
        h("h2", { class:"battle-title battle-outcome" }, title),
        h("div", { class:"battle-sides" }, side(self), side(foe))),
    ];
  }

  #viewRetreat(foe){
    return [
      this.#closeBtn(() => this.close()),
      h("div", { class:"battle-versus" }, avatar(foe, true)),
      h("h2", { class:"battle-title" }, `${foe.profile.name} retreated`),
    ];
  }

  /* ---------------- picking ---------------- */

  #pickKnight(level){
    this.pick.level = this.pick.level === level ? null : level;    /* again: they spread out */
    this.#paintPick();
  }
  #pickCard(card){
    this.pick.card = this.pick.card === card ? null : card;
    this.#paintPick();
  }
  #paintPick(){
    const d = this.duel;
    if(!d) return;
    d.knights.toggleAttribute("data-picked", this.pick.level != null);
    for(const k of d.knights.children) k.setAttribute("aria-checked", String(Number(k.dataset.level) === this.pick.level));
    for(const c of d.cards.querySelectorAll("button")) c.setAttribute("aria-pressed", String(Number(c.dataset.card) === this.pick.card));
    d.go.disabled = d.ready || this.pick.level == null || this.pick.card == null;
  }

  /* ---------------- moves ---------------- */

  async #challenge(profileId){
    const id = await this.game.challenge(profileId);
    if(!id) return;
    this.#follow(id);
    this.update();
  }

  async #ready(b){
    const { level, card } = this.pick;
    if(level == null || card == null) return;
    this.duel.go.disabled = true;
    await this.#call(b, "pick", { level, card });
  }

  async #call(b, command, arg = {}){
    /* calling it off or retreating: gone at once (the change coming back mustn't read as "called off" here) */
    const leaving = command === "cancel" || (command === "answer" && !arg.fight);
    if(leaving) this.close();
    const ok = await this.game.battle(b.id, command, arg);
    if(!leaving) this.update();
    return ok;
  }

  #title(){ return h("h2", { class:"battle-title" }, icon(ICONS.swords, "battle-title-icon"), "Battle"); }

  #closeBtn(onClick){
    const b = h("button", { type:"button", class:"icon-btn battle-close", "aria-label":"Close", onClick });
    b.innerHTML = ICONS.close;
    return b;
  }
}

/* ---------------- pieces ---------------- */

/** A player's initial in their color. */
function avatar(seat, big = false){
  return h("span", { class:`avatar battle-avatar${big ? " is-big" : ""}`, "data-colored":"true",
    style:`--c:${seat.colorHex};color:${inkOn(seat.colorHex)}`, "aria-hidden":"true" }, seat.profile.name.slice(0, 1).toUpperCase());
}

/** A player's color (and readable ink on it), for their knights and cards; a light color (white) gets a darker
    edge, or its ring and pips would vanish on the card. */
const knightStyle = hex => {
  const light = inkOn(hex) !== "#FFFFFF";
  return `--c:${hex};--k-ink:${inkOn(hex)};--c-edge:${light ? shadeOf(hex, .62) : hex}`;
};

/**
 * A player's cards 1–6: lit in their color while they're left, greyed once
 * spent — buttons to pick from (`onPick`), or just shown (someone else's).
 */
function cardStrip(spent, { onPick = null, small = false, hex = null } = {}){
  return h("div", { class:`battle-cards${small ? " is-small" : ""}`, role:onPick ? "group" : "img", style:hex ? knightStyle(hex) : null,
    "aria-label": onPick ? "Your card" : `Cards left: ${CARDS.filter(c => !isSpent(spent, c)).join(", ") || "none"}` },
    CARDS.map(c => onPick
      ? h("button", { type:"button", class:"battle-num", "data-card":String(c), "data-spent":String(isSpent(spent, c)),
          disabled:isSpent(spent, c), "aria-pressed":"false", onClick:() => onPick(c) }, String(c))
      : h("span", { class:"battle-num", "data-spent":String(isSpent(spent, c)), "aria-hidden":"true" }, String(c))));
}
