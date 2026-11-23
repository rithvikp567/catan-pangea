/**
 * Everything played inside one room, applied to a store: its game (the
 * session — a New map starts another), the seats, the shared counters,
 * honor coins, VP and the wins they record, and knight duels. Made by
 * GameService#room; shares its store, device and clock.
 *
 *   rooms/{roomId}/info      { name, createdAt, createdBy?, activeAt, mods }
 *   rooms/{roomId}/session   { meta, board, settings, seats/{s0…}, counters, battles/{id}? }
 *
 * Every change to shared numbers is a transaction, so two phones tapping
 * at once never lose an update or break a limit; a transaction on a
 * missing node aborts, so nothing here brings back a room that was closed.
 * Each change also marks the room active (info.activeAt): a room nobody
 * touches for ROOM_TTL_MS is closed.
 */
import { GameError } from "./GameError.js";
import { Mods } from "./mods.js";
import {
  COUNTERS, clampVP, stepCounter, abstainKarma, robKarma, newSession, carrySeats,
} from "./rules.js";
import { BATTLE_COMMANDS, challenge, isOpen, isSpent, spentCards } from "./battle.js";

export class RoomService {
  /**
   * @param {object} store
   * @param {object} p
   * @param {string} p.root       "v1"
   * @param {string} p.roomId
   * @param {string} p.deviceId
   * @param {() => number} p.now
   * @param {(prefix:string) => string} p.newId
   */
  constructor(store, { root, roomId, deviceId, now, newId }){
    Object.assign(this, { store, root, roomId, deviceId, now, newId });
  }

  /** A path inside this room. */
  #p(...parts){ return [this.root, "rooms", this.roomId, ...parts].join("/"); }

  /** Mark the room active (never brings back a room that was closed). */
  async #touch(){
    await this.store.transact(this.#p("info"), info => info ? { ...info, activeAt:this.now() } : undefined);
  }

  /** Run a transaction; when it changed something, the room was active. */
  async #change(path, fn){
    const res = await this.store.transact(path, fn);
    if(res.committed) await this.#touch();
    return res;
  }

  /* ---------------- the game ---------------- */

  /**
   * A new map: the room's next game. Everyone seated keeps their seat and
   * color (scores, counters and battles start over).
   * @param {object} snapshot  BoardSnapshot
   * @param {object} settings  Settings#toJSON() the board was made with
   * @param {{ createdBy?:string|null, buildAt?:number|null }} [p]  buildAt: when it starts building in, on every device
   * @returns {Promise<boolean>} whether it became the room's game
   */
  async publishBoard(snapshot, settings, { createdBy = null, buildAt = null } = {}){
    const session = newSession({ id:this.newId("s_"), board:snapshot, settings, createdAt:this.now(), createdBy, buildAt });
    const profiles = (await this.store.get([this.root, "profiles"].join("/"))) ?? {};
    const res = await this.#change(this.#p("session"), cur => cur?.meta ? carrySeats(session, cur.seats, id => id in profiles) : undefined);
    return res.committed;
  }

  /** Take a seat (or change color if already seated). */
  async join(profileId, color){
    let outcome = null;
    const res = await this.#change(this.#p("session", "seats"), seats => {
      if(!seats){ outcome = "no-room"; return undefined; }
      const entries = Object.entries(seats);
      if(entries.some(([, s]) => s.color === color && s.profileId && s.profileId !== profileId)){ outcome = "color-taken"; return undefined; }
      const mine = entries.find(([, s]) => s.profileId === profileId)
                ?? entries.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric:true })).find(([, s]) => !s.profileId);
      if(!mine){ outcome = "full"; return undefined; }
      if(mine[1].profileId === profileId && mine[1].color === color){ outcome = "same"; return undefined; }
      outcome = "ok";
      return { ...seats, [mine[0]]: { ...mine[1], profileId, color } };
    });
    if(!res.committed && outcome !== "same"){
      const msg = { "no-room":"That game has closed.", "color-taken":"Someone just took that color.", full:"Every seat is taken." };
      throw new GameError(outcome ?? "failed", msg[outcome] ?? "Couldn't join the game.");
    }
  }

  async leave(profileId){
    await this.#change(this.#p("session", "seats"), seats => {
      if(!seats) return undefined;
      const mine = Object.entries(seats).find(([, s]) => s.profileId === profileId);
      if(!mine) return undefined;
      const { profileId:_p, color:_c, ...rest } = mine[1];
      return { ...seats, [mine[0]]: rest };
    });
  }

  /* ---------------- trackers ---------------- */

  /** The points to win in this room's game: the mods' target, or the board's own. */
  async #vpToWin(){
    const [mods, profile] = await Promise.all([this.store.get(this.#p("info", "mods")), this.store.get(this.#p("session", "settings", "profile"))]);
    return new Mods(mods).vpTarget(profile);
  }

  /**
   * Change a seat's VP (0 … the points to win). Reaching the target
   * records a win for the seated profile in this game's season; dropping
   * back below removes it — so a corrected score corrects the season tally
   * too.
   */
  async adjustVP(key, delta){
    const [meta, target] = await Promise.all([this.store.get(this.#p("session", "meta")), this.#vpToWin()]);
    if(!meta) return;
    let before = 0, profileId = null;
    const res = await this.#change(this.#p("session", "seats", key), seat => {
      if(!seat) return undefined;
      before = seat.vp ?? 0; profileId = seat.profileId ?? null;
      const vp = clampVP(before + delta, Math.max(target, before));     /* (never snaps down past a bound) */
      return vp === before ? undefined : { ...seat, vp };
    });
    if(!res.committed || !profileId) return;
    const after = res.value.vp, winPath = [this.root, "wins", meta.season, `${meta.id}_${profileId}`].join("/");
    if(before < target && after >= target){
      /* everyone's points at the moment of the win (the calendar on the season wins screen shows them) */
      const seats = (await this.store.get(this.#p("session", "seats"))) ?? {};
      const scores = {};
      for(const s of Object.values(seats)) if(s?.profileId) scores[s.profileId] = { vp:s.vp ?? 0, ...(s.color ? { color:s.color } : {}) };
      scores[profileId] = { ...scores[profileId], vp:after };
      await this.store.set(winPath, { profileId, delta:1, source:"game", sessionId:meta.id, at:this.now(), scores });
    }else if(before >= target && after < target){
      await this.store.remove(winPath);
    }
  }

  /** Flip your own honor coin. Other players' coins are read-only. */
  async flipCoin(key, profileId){
    const res = await this.#change(this.#p("session", "seats", key), seat => {
      if(!seat || seat.profileId !== profileId) return undefined;
      return { ...seat, honorable: seat.honorable === false };
    });
    if(!res.committed) throw new GameError("not-your-coin", "You can only flip your own coin.");
  }

  /** Any COUNTERS entry (knights per island, cities, karma, walker) by ±n, within its bounds (the walker wraps). */
  async adjustCounter(name, delta){
    const rule = COUNTERS[name];
    if(!rule) throw new GameError("bad-counter", `Unknown counter ${name}`);
    const players = await this.store.get(this.#p("session", "meta", "players"));
    if(!players) return;
    await this.#change(this.#p("session", "counters"), c => {
      if(!c) return undefined;
      const next = stepCounter(rule, c[name] ?? 0, delta, players);
      return next === (c[name] ?? 0) ? undefined : { ...c, [name]: next };
    });
  }

  /** Abstain: karma +1, and the robber is worth one more (up to 3). */
  async abstainRobber(){
    await this.#change(this.#p("session", "counters"), c => c ? { ...c, ...abstainKarma(c.karma ?? 0, c.robber ?? 1) } : undefined);
  }

  /** Rob: karma goes down by the robber's value, and the robber starts over at 1. */
  async rob(){
    await this.#change(this.#p("session", "counters"), c => c ? { ...c, ...robKarma(c.karma ?? 0, c.robber ?? 1) } : undefined);
  }

  /* ---------------- knight duels (battle.js) ---------------- */

  /**
   * Challenge another seated player. Neither may be in a battle already.
   * @returns {Promise<string>} the battle's id
   */
  async challenge(from, to){
    if(from === to) throw new GameError("self", "Pick someone else to battle.");
    const seats = Object.values((await this.store.get(this.#p("session", "seats"))) ?? {});
    if(![from, to].every(id => seats.some(s => s?.profileId === id))) throw new GameError("not-seated", "You both need a seat in this game.");
    const t = this.now();
    const battles = (await this.store.get(this.#p("session", "battles"))) ?? {};
    const busy = Object.values(battles).find(b => isOpen(b, t) && [b.from, b.to].some(id => id === from || id === to));
    if(busy) throw new GameError("busy", busy.from === from || busy.to === from ? "Finish your battle first." : "They're in a battle right now.");
    const id = this.newId("b_");
    const res = await this.#change(this.#p("session", "battles", id), cur => cur ? undefined : challenge({ from, to, at:t }));
    if(!res.committed) throw new GameError("failed", "Couldn't start the battle.");
    return id;
  }

  /**
   * A battle command (battle.js BATTLE_COMMANDS): answer, pick, cancel.
   * A pick's card must not be spent already.
   * @returns {Promise<boolean>} whether it changed anything
   */
  async battle(id, command, arg){
    const fn = BATTLE_COMMANDS[command];
    if(!fn) throw new GameError("bad-command", `Unknown battle command: ${command}`);
    if(command === "pick"){
      const battles = (await this.store.get(this.#p("session", "battles"))) ?? {};
      if(isSpent(spentCards(battles, arg.by), arg.card)) throw new GameError("spent", "That card is spent.");
    }
    const ctx = { t:this.now() };
    const res = await this.#change(this.#p("session", "battles", id), b => b ? fn(b, arg, ctx) : undefined);
    return res.committed;
  }
}
