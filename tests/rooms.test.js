import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../catan-pangea/src/sync/MemoryStore.js";
import { GameService } from "../catan-pangea/src/game/GameService.js";
import { Mods, VP_TO_WIN, defaultVP } from "../catan-pangea/src/game/mods.js";
import { BASE_VP, MAX_VP, ROOM_TTL_MS, seasonOf } from "../catan-pangea/src/game/rules.js";
import {
  CARDS, BATTLE_TIMES, spend, isSpent, spentCards, outcome, battleStatus, BATTLE_COMMANDS,
} from "../catan-pangea/src/game/battle.js";

const board = (players = 3, seed = "seed", profile = "ck") => ({
  v:1, generatorId:"open", tiles:[], ports:[],
  request:{ seed, players, tiles:19, profile, compactness:0.9, iterations:100, shipRule:"flat" },
});
const settings = (profile = "ck") => ({ mode:"open", players:3, profile });
const START = Date.UTC(2026, 10, 23, 19);

let store, clock, alice, bob, carol, ids;
beforeEach(async () => {
  store = new MemoryStore();
  clock = START;
  const svc = deviceId => new GameService(store, { deviceId, now:() => clock });
  alice = svc("dev-a"); bob = svc("dev-b"); carol = svc("dev-c");
  ids = {
    alice: await alice.createProfile("Alice"),
    bob:   await bob.createProfile("Bob"),
    carol: await carol.createProfile("Carol"),
  };
});
const open = (name = "Game", { mods = {}, profile = "ck", by = alice } = {}) =>
  by.createRoom({ name, mods, board:board(3, name, profile), settings:settings(profile), createdBy:ids.alice });
const room = async id => (await alice.state()).room(id, clock);

/* ---------------- mods ---------------- */

test("mods: defaults, validation, points to win, the karma tile's title and the summary", () => {
  const d = new Mods();
  assert.deepEqual(d.toJSON(), { karmaRobber:true, walker:true, battle:true }, "no custom target: nothing stored for it");
  assert.equal(d.vpTarget("ck"), MAX_VP);
  assert.equal(d.vpTarget("base"), BASE_VP);
  assert.equal(defaultVP("base"), 10);
  assert.equal(d.karmaTitle, "Karma and Robber & Walker");
  assert.equal(d.with({ walker:false }).karmaTitle, "Karma and Robber");
  assert.equal(d.with({ karmaRobber:false }).karmaTitle, "Walker");
  assert.equal(d.with({ karmaRobber:false, walker:false }).karmaTitle, null, "neither: no tile");
  assert.equal(new Mods({ vpToWin:8 }).vpTarget("ck"), 8, "a custom target beats the board's");
  assert.equal(new Mods({ vpToWin:99 }).vpToWin, VP_TO_WIN.max);
  assert.equal(new Mods({ vpToWin:"x" }).vpToWin, null);
  assert.equal(new Mods({ walker:"yes" }).walker, true, "not a boolean: the default");
  assert.deepEqual(new Mods({ battle:false, vpToWin:12 }).summary("ck"), ["Karma & Robber", "Walker", "12 VP"]);
  assert.deepEqual(d.summary("base"), ["Karma & Robber", "Walker", "10 VP"], "no knights, no Battle");
  assert.ok(Object.isFrozen(d));
});

/* ---------------- rooms ---------------- */

test("rooms: made with a name, mods and a first game; listed newest first; names are unique for the day", async () => {
  const a = await open("Friday", { mods:{ walker:false } });
  clock += 1000;
  const b = await open("Second table", { by:bob });
  const s = await alice.state();
  assert.deepEqual(s.rooms(clock).map(r => r.name), ["Second table", "Friday"]);
  const r = s.room(a, clock);
  assert.equal(r.mods.walker, false);
  assert.equal(r.players, 3);
  assert.ok(r.sessionId, "a first game on the creator's map");
  assert.equal(s.room(b, clock).createdBy, ids.alice);
  await assert.rejects(open("friday"), e => e.code === "bad-room-name");
  await assert.rejects(open("  "), e => e.code === "bad-room-name");
});

test("rooms close after 6 hours untouched — any change keeps one open; prune deletes the closed ones", async () => {
  const quiet = await open("Quiet"), busy = await open("Busy");
  clock += ROOM_TTL_MS - 60_000;
  await alice.room(busy).adjustCounter("karma", +1);            /* a tap: Busy is active again */
  clock += 120_000;
  let s = await alice.state();
  assert.equal(s.room(quiet, clock), null, "untouched for 6 h: closed");
  assert.ok(s.room(busy, clock));
  assert.deepEqual(s.rooms(clock).map(r => r.name), ["Busy"]);
  assert.deepEqual(s.expiredRooms(clock).map(r => r.name), ["Quiet"]);
  assert.equal(await bob.pruneRooms(), 1);
  assert.equal(await store.get(`v1/rooms/${quiet}`), null);
  assert.ok(await store.get(`v1/rooms/${busy}`));
});

test("anyone can delete a room; removing a profile frees its seat in every room", async () => {
  const a = await open("A"), b = await open("B");
  await alice.room(a).join(ids.carol, "green");
  await alice.room(b).join(ids.carol, "red");
  await bob.removeProfile(ids.carol);
  const s = await alice.state();
  assert.equal(s.room(a, clock).seatOf(ids.carol), null);
  assert.equal(s.room(b, clock).openSeats, 3);
  await carol.deleteRoom(a);
  assert.deepEqual((await alice.state()).rooms(clock).map(r => r.name), ["B"]);
});

test("base game: no knights or cities, 10 points to win; a custom target wins at its own number", async () => {
  const base = await open("Base", { profile:"base" });
  let r = await room(base);
  assert.deepEqual([r.boardProfile, r.citiesKnights, r.vpToWin, r.battleOn], ["base", false, BASE_VP, false]);
  await alice.room(base).join(ids.alice, "red");
  const key = r.seats[0].key;
  for(let i = 0; i < 12; i++) await bob.room(base).adjustVP(key, +1);
  r = await room(base);
  assert.equal(r.seatOf(ids.alice).vp, 10, "never past the target");
  assert.deepEqual(r.winners.map(w => w.profileId), [ids.alice]);
  assert.equal((await alice.state()).winsFor(seasonOf(clock)).find(w => w.profile.id === ids.alice).wins, 1);

  const short = await open("Short", { mods:{ vpToWin:7 } });
  await alice.room(short).join(ids.bob, "blue");
  for(let i = 0; i < 7; i++) await alice.room(short).adjustVP("s0", +1);
  r = await room(short);
  assert.equal(r.vpToWin, 7);
  assert.equal(r.winners.length, 1);
  assert.equal((await alice.state()).winsFor(seasonOf(clock)).find(w => w.profile.id === ids.bob).wins, 1);
  await alice.room(short).adjustVP("s0", -1);
  assert.equal((await alice.state()).winsFor(seasonOf(clock)).find(w => w.profile.id === ids.bob).wins, 0, "taken back below the target");
});

/* ---------------- battles: the rules ---------------- */

test("battle cards: each card is spent once; playing the sixth brings the whole hand back", () => {
  let m = 0;
  for(const c of [3, 1, 6, 2, 5]) m = spend(m, c);
  assert.deepEqual(CARDS.filter(c => isSpent(m, c)), [1, 2, 3, 5, 6]);
  assert.equal(spend(m, 4), 0, "the last card: all six back");
  const done = (card, at) => ({ state:"done", doneAt:at, picks:{ a:{ level:1, card } } });
  assert.equal(spentCards({ x:done(2, 2), y:done(5, 1), z:{ state:"cancelled", picks:{ a:{ level:1, card:6 } } } }, "a"),
    1 << 2 | 1 << 5, "replayed from finished battles only");
});

test("battle outcome: card + knight level; equal is a standoff; challenges and fights lapse", () => {
  const b = { from:"a", to:"b", state:"done", picks:{ a:{ level:3, card:1 }, b:{ level:1, card:2 } } };
  assert.deepEqual(outcome(b), { strength:{ a:4, b:3 }, winner:"a" });
  assert.equal(outcome({ ...b, picks:{ a:{ level:2, card:2 }, b:{ level:1, card:3 } } }).winner, null);
  assert.equal(outcome({ ...b, state:"fight" }), null);
  assert.equal(battleStatus({ state:"asked", at:0 }, BATTLE_TIMES.askMs + 1), "lapsed");
  assert.equal(battleStatus({ state:"fight", at:0, answeredAt:10 }, 10 + BATTLE_TIMES.fightMs), "fight");
  assert.equal(BATTLE_COMMANDS.answer({ state:"asked", to:"b", at:0 }, { by:"a", fight:true }, { t:1 }), undefined, "only the one challenged answers");
  assert.equal(BATTLE_COMMANDS.pick({ state:"fight", from:"a", to:"b", at:0 }, { by:"a", level:4, card:1 }, { t:1 }), undefined, "no such knight");
});

/* ---------------- battles: in a room ---------------- */

test("a battle: challenge → fight → both pick → done; cards spent; a spent card or a busy player is refused", async () => {
  const id = await open("Duel");
  for(const [who, color] of [["alice", "red"], ["bob", "blue"], ["carol", "white"]]) await alice.room(id).join(ids[who], color);
  const A = alice.room(id), B = bob.room(id);

  const b1 = await A.challenge(ids.alice, ids.bob);
  await assert.rejects(carol.room(id).challenge(ids.carol, ids.alice), e => e.code === "busy");
  await assert.rejects(A.challenge(ids.alice, ids.carol), e => e.code === "busy");
  assert.equal((await room(id)).openBattleOf(ids.bob, clock).id, b1);

  assert.equal(await A.battle(b1, "answer", { by:ids.alice, fight:true }), false, "the challenger can't answer");
  assert.equal(await B.battle(b1, "answer", { by:ids.bob, fight:true }), true);
  assert.equal(await A.battle(b1, "pick", { by:ids.alice, level:2, card:5 }), true);
  assert.equal((await room(id)).battleList[0].state, "fight", "one pick: still waiting");
  assert.equal(await A.battle(b1, "pick", { by:ids.alice, level:3, card:6 }), false, "no second pick");
  clock += 1000;
  assert.equal(await B.battle(b1, "pick", { by:ids.bob, level:3, card:4 }), true);

  let r = await room(id);
  const done = r.battleList[0];
  assert.equal(done.state, "done");
  assert.equal(done.doneAt, clock);
  assert.deepEqual(outcome(done), { strength:{ [ids.alice]:7, [ids.bob]:7 }, winner:null }, "7 v 7: a standoff");
  assert.ok(isSpent(r.spent(ids.alice), 5));
  assert.ok(isSpent(r.spent(ids.bob), 4));
  assert.equal(r.openBattleOf(ids.alice, clock), null);

  const b2 = await B.challenge(ids.bob, ids.alice);
  await A.battle(b2, "answer", { by:ids.alice, fight:true });
  await assert.rejects(A.battle(b2, "pick", { by:ids.alice, level:1, card:5 }), e => e.code === "spent");
  await A.battle(b2, "cancel", { by:ids.alice });
  const byId = async bid => (await room(id)).battleList.find(x => x.id === bid);
  assert.equal((await byId(b2)).state, "cancelled");

  const b3 = await A.challenge(ids.alice, ids.carol);
  await carol.room(id).battle(b3, "answer", { by:ids.carol, fight:false });
  assert.equal((await byId(b3)).state, "retreat");
});

test("a challenge nobody answers lapses, and frees both players; you can't battle yourself or someone unseated", async () => {
  const id = await open("Lapse");
  await alice.room(id).join(ids.alice, "red");
  await alice.room(id).join(ids.bob, "blue");
  await assert.rejects(alice.room(id).challenge(ids.alice, ids.alice), e => e.code === "self");
  await assert.rejects(alice.room(id).challenge(ids.alice, ids.carol), e => e.code === "not-seated");
  const b = await alice.room(id).challenge(ids.alice, ids.bob);
  clock += BATTLE_TIMES.askMs + 1;
  assert.equal(await bob.room(id).battle(b, "answer", { by:ids.bob, fight:true }), false, "too late");
  assert.equal((await room(id)).openBattleOf(ids.alice, clock), null);
  assert.ok(await bob.room(id).challenge(ids.bob, ids.alice));
});

test("a new map in a room starts its battles over (and everyone's cards)", async () => {
  const id = await open("Reset");
  await alice.room(id).join(ids.alice, "red");
  await alice.room(id).join(ids.bob, "blue");
  const b = await alice.room(id).challenge(ids.alice, ids.bob);
  await bob.room(id).battle(b, "answer", { by:ids.bob, fight:true });
  await alice.room(id).battle(b, "pick", { by:ids.alice, level:1, card:6 });
  await bob.room(id).battle(b, "pick", { by:ids.bob, level:1, card:1 });
  assert.ok(isSpent((await room(id)).spent(ids.alice), 6));
  await bob.room(id).publishBoard(board(3, "next"), settings());
  const r = await room(id);
  assert.equal(r.battleList.length, 0);
  assert.equal(r.spent(ids.alice), 0);
  assert.equal(r.seatOf(ids.alice).color, "red", "seats carry over");
});
