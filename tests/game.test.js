import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../catan-pangea/src/sync/MemoryStore.js";
import { GameService, GameError } from "../catan-pangea/src/game/GameService.js";
import { MAX_VP, BASE_VP, ROOM_TTL_MS, KNIGHTS_PER_PLAYER, CITIES_PER_PLAYER, KARMA_LIMIT, WALKER_WORD, stepWithin, abstainKarma, robKarma, validateName, seasonOf } from "../catan-pangea/src/game/rules.js";

/* a tiny fake board snapshot is enough — the service never inspects tiles */
const board = (players = 3, seed = "test-seed") => ({
  v:1, generatorId:"open", tiles:[], ports:[],
  request:{ seed, players, tiles:19, profile:"ck", compactness:0.9, iterations:100, shipRule:"flat" },
});
const SETTINGS = { mode:"open", players:3 };
const NOW = Date.UTC(2026, 5, 1);

let store, alice, bob, carol, ids, roomId;
beforeEach(async () => {
  store = new MemoryStore();
  const svc = deviceId => new GameService(store, { deviceId, now:() => NOW });
  alice = svc("dev-a"); bob = svc("dev-b"); carol = svc("dev-c");     /* three phones */
  ids = {
    alice: await alice.createProfile("Alice"),
    bob:   await bob.createProfile("Bob"),
    carol: await carol.createProfile("Carol"),
  };
  roomId = await alice.createRoom({ name:"Alice's game", mods:{}, board:board(3), settings:SETTINGS, createdBy:ids.alice });
});
/** Everything synced, and the room everyone's playing in. */
const all = () => alice.state();
const state = async () => (await all()).room(roomId, NOW);
/** A phone's moves inside the room. */
const R = phone => phone.room(roomId);

test("rules: abstain adds 1 to karma and raises the robber to 3 at most, rob takes it off karma and resets it; steps stay in bounds", () => {
  assert.deepEqual([1, 2, 3].map(r => abstainKarma(0, r)), [{ karma:1, robber:2 }, { karma:1, robber:3 }, { karma:1, robber:3 }]);
  assert.deepEqual(abstainKarma(KARMA_LIMIT, 1), { karma:KARMA_LIMIT, robber:2 });
  assert.deepEqual(robKarma(2, 3), { karma:-1, robber:1 });
  assert.deepEqual(robKarma(-KARMA_LIMIT, 2), { karma:-KARMA_LIMIT, robber:1 });
  assert.equal(stepWithin(6, +1, 0, 6), 6);
  assert.equal(stepWithin(0, -1, 0, 6), 0);
  assert.equal(stepWithin(5, -1, 0, 1), 4, "over the bound: back one step, not a jump to it");
  assert.equal(stepWithin(5, +1, 0, 1), 5);
  assert.equal(validateName("  ").error, "Enter a name.");
  assert.equal(validateName("alice", ["Alice"]).error, "That name is taken.");
  assert.equal(validateName("  Big   Al ").name, "Big Al");
});

test("one profile per device", async () => {
  await assert.rejects(alice.createProfile("Alice 2"), e => e instanceof GameError && e.code === "device-has-profile");
  assert.equal((await all()).profiles.length, 3);
});

test("a session has one seat per player; joining picks unique colors", async () => {
  await R(alice).join(ids.alice, "red");
  await R(bob).join(ids.bob, "blue");
  await assert.rejects(R(carol).join(ids.carol, "red"), e => e.code === "color-taken");
  await R(carol).join(ids.carol, "white");
  const s = await state();
  assert.deepEqual(s.seats.map(x => [x.profile?.name, x.color]), [["Alice","red"], ["Bob","blue"], ["Carol","white"]]);
  assert.equal(s.openSeats, 0);
  /* re-joining just changes your color; a 4th player can't fit */
  await R(alice).join(ids.alice, "orange");
  assert.equal((await state()).seatOf(ids.alice).color, "orange");
  const dave = new GameService(store, { deviceId:"dev-d", now:() => NOW });
  const daveId = await dave.createProfile("Dave");
  await assert.rejects(R(dave).join(daveId, "green"), e => e.code === "full");
});

test("VP is clamped to 0…13; reaching 13 records a win, dropping below revokes it", async () => {
  await R(alice).join(ids.alice, "red");
  const key = (await state()).seatOf(ids.alice).key;
  await R(bob).adjustVP(key, -1);                        /* anyone may change any VP */
  assert.equal((await state()).seatOf(ids.alice).vp, 0);
  for(let i = 0; i < 15; i++) await R(bob).adjustVP(key, +1);
  let s = await state();
  assert.equal(s.seatOf(ids.alice).vp, MAX_VP);
  assert.deepEqual(s.winners.map(w => w.profileId), [ids.alice]);
  assert.equal((await all()).winsFor(seasonOf(NOW)).find(r => r.profile.id === ids.alice).wins, 1);

  await R(alice).adjustVP(key, -1);                      /* the "accidental 13" fix */
  s = await state();
  assert.equal(s.winners.length, 0);
  assert.equal((await all()).winsFor(seasonOf(NOW)).find(r => r.profile.id === ids.alice).wins, 0);

  await R(alice).adjustVP(key, +1);                      /* back to 13: counted once again */
  s = await state();
  assert.equal((await all()).winsFor(seasonOf(NOW)).find(r => r.profile.id === ids.alice).wins, 1);
});

test("coins start honorable and only their owner can flip them", async () => {
  await R(alice).join(ids.alice, "red");
  await R(bob).join(ids.bob, "blue");
  const aKey = (await state()).seatOf(ids.alice).key;
  assert.equal((await state()).seatOf(ids.alice).honorable, true);
  await assert.rejects(R(bob).flipCoin(aKey, ids.bob), e => e.code === "not-your-coin");
  await R(alice).flipCoin(aKey, ids.alice);
  assert.equal((await state()).seatOf(ids.alice).honorable, false);
  await R(alice).flipCoin(aKey, ids.alice);
  assert.equal((await state()).seatOf(ids.alice).honorable, true);
});

test("knights: main island and off island are separate counters, each 0 to 12 × players", async () => {
  for(let i = 0; i < 40; i++) await R(alice).adjustCounter("knightsMain", +1);   /* 3 players → max 36 */
  await R(bob).adjustCounter("knightsOff", +2);
  await R(carol).adjustCounter("knightsOff", -5);
  let s = await state();
  assert.equal(s.counters.knightsMain, KNIGHTS_PER_PLAYER * 3);
  assert.equal(s.counters.knightsOff, 0, "never below 0");
  await R(bob).adjustCounter("knightsOff", +1);
  assert.equal((await state()).counters.knightsOff, 1, "a full main island doesn't limit the off island");
});

test("cities are a shared ±1 counter from 0 to 4 × players", async () => {
  await R(alice).adjustCounter("cities", -1);
  assert.equal((await state()).counters.cities, 0);
  for(let i = 0; i < 20; i++) await R(bob).adjustCounter("cities", +1);
  assert.equal((await state()).counters.cities, CITIES_PER_PLAYER * 3);
});

test("older games without the cities counter read it as 0 and can still change it", async () => {
  await store.set(`v1/rooms/${roomId}/session/counters`, { knightsMain:4, knightsOff:2, karma:1, robber:2 });
  let s = await state();
  assert.deepEqual([s.counters.knightsMain, s.counters.knightsOff], [4, 2]);
  assert.equal(s.counters.cities, 0);
  await R(alice).adjustCounter("cities", +1);
  assert.equal((await state()).counters.cities, 1);
});

test("walker: one letter per press up to WALKER; + on the last letter starts over at 0; − stops at 0", async () => {
  assert.equal(WALKER_WORD.length, 6);
  assert.equal((await state()).counters.walker, 0);
  await R(bob).adjustCounter("walker", -1);
  assert.equal((await state()).counters.walker, 0, "nothing below the first letter");
  for(let i = 1; i <= 6; i++){ await R(alice).adjustCounter("walker", +1); assert.equal((await state()).counters.walker, i); }
  assert.equal((await state()).hasProgress, true);
  await R(carol).adjustCounter("walker", +1);
  assert.equal((await state()).counters.walker, 0, "full word + 1 = start over");
  await R(alice).adjustCounter("walker", +1); await R(bob).adjustCounter("walker", +1); await R(bob).adjustCounter("walker", -1);
  assert.equal((await state()).counters.walker, 1);
});

test("karma is ±; abstain adds 1 to karma and raises the robber (up to 3), rob takes its value off karma and resets it to 1", async () => {
  let c;

  await R(alice).adjustCounter("karma", +2);
  assert.equal((await state()).counters.robber, 1, "a new game's robber is 1");
  await R(bob).abstainRobber(); await R(bob).abstainRobber();   /* robber 1 → 2 → 3, karma 2 → 3 → 4 */
  c = (await state()).counters;
  assert.deepEqual([c.karma, c.robber], [4, 3]);
  await R(carol).abstainRobber();                            /* the robber stays at 3; karma still goes up */
  c = (await state()).counters;
  assert.deepEqual([c.karma, c.robber], [5, 3]);
  await R(carol).rob();
  c = (await state()).counters;
  assert.equal(c.karma, 2, "5 − 3");
  assert.equal(c.robber, 1, "rob starts the robber over");
  await R(alice).abstainRobber(); await R(bob).rob();
  c = (await state()).counters;
  assert.deepEqual([c.karma, c.robber], [1, 1], "2 + 1 − 2");
  await R(alice).adjustCounter("karma", +2);
  await R(alice).adjustCounter("karma", +5);             /* karma still edits on its own */
  assert.equal((await state()).counters.karma, 8);
  for(let i = 0; i < 120; i++) await R(alice).adjustCounter("karma", -1);
  assert.equal((await state()).counters.karma, -KARMA_LIMIT);
});

test("a new board starts a fresh session: trackers reset, seats and colors carry over, wins persist", async () => {
  await R(alice).join(ids.alice, "red");
  await R(carol).join(ids.carol, "green");
  const key = (await state()).seatOf(ids.alice).key;
  for(let i = 0; i < 13; i++) await R(alice).adjustVP(key, +1);
  await R(alice).adjustCounter("karma", +3);
  await R(alice).adjustCounter("knightsOff", +2);
  await R(carol).flipCoin((await state()).seatOf(ids.carol).key, ids.carol);
  const firstId = (await state()).sessionId;
  assert.equal((await state()).hasProgress, true);

  await R(bob).publishBoard(board(4, "new-seed"), { ...SETTINGS, players:4 }, { createdBy:ids.bob, buildAt:NOW + 800 });
  const s = await state();
  assert.notEqual(s.sessionId, firstId);
  assert.equal(s.session.meta.buildAt, NOW + 800, "every device builds the new map in from the same moment");
  assert.equal(s.seats.length, 4);
  assert.deepEqual(s.seats.map(x => [x.profile?.name ?? null, x.color]), [["Alice","red"], ["Carol","green"], [null, null], [null, null]]);
  assert.ok(s.seats.every(x => x.vp === 0 && x.honorable), "scores and coins start over");
  assert.equal(s.counters.karma, 0);
  assert.equal(s.counters.knightsOff, 0);
  assert.equal(s.hasProgress, false, "kept seats alone aren't progress");
  assert.equal((await all()).winsFor(seasonOf(NOW)).find(r => r.profile.id === ids.alice).wins, 1, "the win survives the new game");
});

test("a new board with fewer seats keeps the first players; removed profiles aren't carried", async () => {
  await R(alice).join(ids.alice, "red");
  await R(bob).join(ids.bob, "blue");
  await R(carol).join(ids.carol, "white");
  await R(alice).publishBoard(board(2, "small"), { ...SETTINGS, players:2 });
  let s = await state();
  assert.equal(s.session.meta.buildAt, undefined, "no build time unless one is given");
  assert.deepEqual(s.seats.map(x => x.profile?.name), ["Alice", "Bob"]);
  assert.equal(s.seatOf(ids.carol), null, "Carol has to pick again");

  await alice.removeProfile(ids.alice);
  await R(bob).publishBoard(board(3, "again"), SETTINGS);
  s = await state();
  assert.deepEqual(s.seats.map(x => x.profile?.name ?? null), ["Bob", null, null]);
});

test("a closed room stays closed: late taps and new maps don't bring it back", async () => {
  await alice.deleteRoom(roomId);
  assert.equal(await R(bob).publishBoard(board(3, "late"), SETTINGS), false);
  await R(bob).adjustCounter("karma", +1);
  await assert.rejects(R(carol).join(ids.carol, "green"), e => e.code === "no-room");
  assert.equal(await store.get(`v1/rooms/${roomId}`), null);
});

test("admin: remove a profile (frees its seat, drops its wins); wins edit never goes below 0", async () => {
  await R(carol).join(ids.carol, "green");
  const key = (await state()).seatOf(ids.carol).key;
  for(let i = 0; i < 13; i++) await R(carol).adjustVP(key, +1);
  const season = seasonOf(NOW);

  await alice.adjustWins(ids.bob, season, +1);
  await alice.adjustWins(ids.bob, season, +1);
  await alice.adjustWins(ids.bob, season, -1);
  await alice.adjustWins(ids.alice, season, -1);      /* already 0: no-op */
  let s = await all();
  const wins = Object.fromEntries(s.winsFor(season).map(r => [r.profile.name, r.wins]));
  assert.deepEqual(wins, { Alice:0, Bob:1, Carol:1 });
  const leaders = Object.fromEntries(s.winsFor(season).map(r => [r.profile.name, r.leader]));
  assert.deepEqual(leaders, { Alice:false, Bob:true, Carol:true }, "a tie for first: both lead");
  await alice.adjustWins(ids.bob, season, +1);
  assert.deepEqual(Object.fromEntries((await all()).winsFor(season).map(r => [r.profile.name, r.leader])), { Alice:false, Bob:true, Carol:false });
  assert.ok((await all()).winsFor(season - 1).every(r => !r.leader), "nobody leads a season with no wins");
  await alice.adjustWins(ids.bob, season, -1);

  await alice.removeProfile(ids.carol);
  s = await all();
  assert.equal(s.profile(ids.carol), null);
  assert.equal(s.room(roomId, NOW).seats[Number(key.slice(1))].profileId, null, "seat freed");
  assert.ok(!s.winsFor(season).some(r => r.profile.id === ids.carol));
  /* carol's device may now create a profile again */
  assert.ok(carol.canCreateProfile(s));
});

test("a win records everyone's points at that moment; winHistory lists the wins for the calendar", async () => {
  await R(alice).join(ids.alice, "red");
  await R(bob).join(ids.bob, "blue");
  const st = await state(), a = st.seatOf(ids.alice).key, b = st.seatOf(ids.bob).key;
  for(let i = 0; i < 7; i++) await R(bob).adjustVP(b, +1);
  for(let i = 0; i < 13; i++) await R(alice).adjustVP(a, +1);
  await R(bob).adjustVP(b, +1);                           /* after the win: not in the snapshot */
  const season = seasonOf(NOW);
  await carol.adjustWins(ids.carol, season, +1);       /* added by hand */
  await carol.adjustWins(ids.carol, season, -1);       /* a removal isn't a calendar entry */
  const h = (await all()).winHistory();
  assert.equal(h.length, 2);
  const game = h.find(x => x.source === "game");
  assert.equal(game.profile.name, "Alice");
  assert.equal(game.at, NOW);
  assert.equal(game.colorHex, "#C8412E", "the winner's color then");
  assert.deepEqual(game.scores.map(x => [x.profile.name, x.vp, x.winner]), [["Alice", 13, true], ["Bob", 7, false]]);
  const added = h.find(x => x.source === "admin");
  assert.deepEqual([added.profile.name, added.scores.length], ["Carol", 0]);
  await R(alice).adjustVP(a, -1);                         /* the win is taken back: gone from the calendar too */
  assert.deepEqual((await all()).winHistory().map(x => x.source), ["admin"]);
});

test("look: saved on the profile (every device signed in to it reads it), merged field by field; same value is a no-op", async () => {
  const laptop = new GameService(store, { deviceId:"dev-a-laptop", now:() => NOW + 5 });   /* Alice's second device */
  assert.equal(await alice.setLook(ids.alice, { theme:"hearth" }), true);
  assert.equal(await laptop.setLook(ids.alice, { accent:"rose", theme:"hearth" }), true);
  const p = (await all()).profile(ids.alice);
  assert.deepEqual(p.look, { theme:"hearth", accent:"rose", at:NOW + 5 });
  assert.equal(p.name, "Alice");
  assert.equal(p.deviceId, "dev-a", "the profile still belongs to the device that made it");
  assert.equal(await alice.setLook(ids.alice, { theme:"hearth", accent:"rose" }), false, "nothing to change");
  assert.equal((await all()).profile(ids.bob).look, undefined, "nobody else's");
});

test("look: unknown ids are refused or dropped; a removed profile isn't brought back", async () => {
  await assert.rejects(alice.setLook(ids.alice, { theme:"neon" }), e => e instanceof GameError && e.code === "bad-look");
  await assert.rejects(alice.setLook(ids.alice, {}), e => e.code === "bad-look");
  await alice.setLook(ids.alice, { theme:"sand", accent:"tartan" });
  assert.deepEqual((await all()).profile(ids.alice).look, { theme:"sand", at:NOW });
  await alice.removeProfile(ids.carol);
  await assert.rejects(carol.setLook(ids.carol, { theme:"mist" }), e => e.code === "no-profile");
  assert.equal((await all()).profile(ids.carol), null);
  assert.equal(await store.get("v1/profiles/" + ids.carol), null);
});

test("watch() emits a GameState once everything has loaded, then on each change", async () => {
  const seen = [];
  const off = alice.watch(st => seen.push(st.room(roomId, NOW).counters.karma));
  await new Promise(r => setTimeout(r, 0));
  await R(bob).adjustCounter("karma", +1);
  await new Promise(r => setTimeout(r, 0));
  off();
  assert.deepEqual(seen, [0, 1]);
});
