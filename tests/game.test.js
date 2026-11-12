import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../catan-pangea/src/sync/MemoryStore.js";
import { GameService, GameError } from "../catan-pangea/src/game/GameService.js";
import { MAX_VP, KNIGHTS_PER_PLAYER, KARMA_LIMIT, nextRobber, validateName, seasonOf } from "../catan-pangea/src/game/rules.js";

/* a tiny fake board snapshot is enough — the service never inspects tiles */
const board = (players = 3, seed = "test-seed") => ({
  v:1, generatorId:"open", tiles:[], ports:[],
  request:{ seed, players, tiles:19, profile:"ck", compactness:0.9, iterations:100, shipRule:"flat" },
});
const SETTINGS = { mode:"open", players:3 };
const NOW = Date.UTC(2026, 5, 1);

let store, alice, bob, carol, ids;
beforeEach(async () => {
  store = new MemoryStore();
  const svc = deviceId => new GameService(store, { deviceId, now:() => NOW });
  alice = svc("dev-a"); bob = svc("dev-b"); carol = svc("dev-c");     /* three phones */
  ids = {
    alice: await alice.createProfile("Alice"),
    bob:   await bob.createProfile("Bob"),
    carol: await carol.createProfile("Carol"),
  };
  await alice.publishBoard(board(3), SETTINGS, { createdBy:ids.alice });
});
const state = () => alice.state();

test("rules: robber cycles 1→2→3→1; names are validated", () => {
  assert.deepEqual([1, 2, 3].map(nextRobber), [2, 3, 1]);
  assert.equal(validateName("  ").error, "Enter a name.");
  assert.equal(validateName("alice", ["Alice"]).error, "That name is taken.");
  assert.equal(validateName("  Big   Al ").name, "Big Al");
});

test("one profile per device", async () => {
  await assert.rejects(alice.createProfile("Alice 2"), e => e instanceof GameError && e.code === "device-has-profile");
  assert.equal((await state()).profiles.length, 3);
});

test("a session has one seat per player; joining picks unique colours", async () => {
  await alice.join(ids.alice, "red");
  await bob.join(ids.bob, "blue");
  await assert.rejects(carol.join(ids.carol, "red"), e => e.code === "color-taken");
  await carol.join(ids.carol, "white");
  const s = await state();
  assert.deepEqual(s.seats.map(x => [x.profile?.name, x.color]), [["Alice","red"], ["Bob","blue"], ["Carol","white"]]);
  assert.equal(s.openSeats, 0);
  /* re-joining just changes your colour; a 4th player can't fit */
  await alice.join(ids.alice, "orange");
  assert.equal((await state()).seatOf(ids.alice).color, "orange");
  const dave = new GameService(store, { deviceId:"dev-d", now:() => NOW });
  const daveId = await dave.createProfile("Dave");
  await assert.rejects(dave.join(daveId, "green"), e => e.code === "full");
});

test("VP is clamped to 0…13; reaching 13 records a win, dropping below revokes it", async () => {
  await alice.join(ids.alice, "red");
  const key = (await state()).seatOf(ids.alice).key;
  await bob.adjustVP(key, -1);                        /* anyone may change any VP */
  assert.equal((await state()).seatOf(ids.alice).vp, 0);
  for(let i = 0; i < 15; i++) await bob.adjustVP(key, +1);
  let s = await state();
  assert.equal(s.seatOf(ids.alice).vp, MAX_VP);
  assert.deepEqual(s.winners.map(w => w.profileId), [ids.alice]);
  assert.equal(s.winsFor(seasonOf(NOW)).find(r => r.profile.id === ids.alice).wins, 1);

  await alice.adjustVP(key, -1);                      /* the "accidental 13" fix */
  s = await state();
  assert.equal(s.winners.length, 0);
  assert.equal(s.winsFor(seasonOf(NOW)).find(r => r.profile.id === ids.alice).wins, 0);

  await alice.adjustVP(key, +1);                      /* back to 13: counted once again */
  s = await state();
  assert.equal(s.winsFor(seasonOf(NOW)).find(r => r.profile.id === ids.alice).wins, 1);
});

test("coins start honourable and only their owner can flip them", async () => {
  await alice.join(ids.alice, "red");
  await bob.join(ids.bob, "blue");
  const aKey = (await state()).seatOf(ids.alice).key;
  assert.equal((await state()).seatOf(ids.alice).honorable, true);
  await assert.rejects(bob.flipCoin(aKey, ids.bob), e => e.code === "not-your-coin");
  await alice.flipCoin(aKey, ids.alice);
  assert.equal((await state()).seatOf(ids.alice).honorable, false);
  await alice.flipCoin(aKey, ids.alice);
  assert.equal((await state()).seatOf(ids.alice).honorable, true);
});

test("knights cap at 12 × players; karma is ± and robber collect subtracts its value", async () => {
  for(let i = 0; i < 40; i++) await alice.adjustCounter("knightsMain", +1);
  await bob.adjustCounter("knightsOff", -3);
  let c = (await state()).counters;
  assert.equal(c.knightsMain, KNIGHTS_PER_PLAYER * 3);
  assert.equal(c.knightsOff, 0);

  await alice.adjustCounter("karma", +2);
  await bob.cycleRobber(); await bob.cycleRobber();   /* 1 → 2 → 3 */
  assert.equal((await state()).counters.robber, 3);
  await carol.collectRobber();
  c = (await state()).counters;
  assert.equal(c.karma, -1, "2 − 3");
  await alice.adjustCounter("karma", +5);             /* karma still edits on its own */
  assert.equal((await state()).counters.karma, 4);
  for(let i = 0; i < 120; i++) await alice.adjustCounter("karma", -1);
  assert.equal((await state()).counters.karma, -KARMA_LIMIT);
});

test("a new board starts a fresh session: trackers and seats reset, wins persist", async () => {
  await alice.join(ids.alice, "red");
  const key = (await state()).seatOf(ids.alice).key;
  for(let i = 0; i < 13; i++) await alice.adjustVP(key, +1);
  await alice.adjustCounter("karma", +3);
  const firstId = (await state()).sessionId;

  await bob.publishBoard(board(4, "new-seed"), { ...SETTINGS, players:4 }, { createdBy:ids.bob });
  const s = await state();
  assert.notEqual(s.sessionId, firstId);
  assert.equal(s.seats.length, 4);
  assert.ok(s.seats.every(x => !x.profileId && x.vp === 0 && x.honorable));
  assert.equal(s.counters.karma, 0);
  assert.equal(s.hasProgress, false);
  assert.equal(s.winsFor(seasonOf(NOW)).find(r => r.profile.id === ids.alice).wins, 1, "the win survives the new game");
});

test("onlyIfNone: the first player online sets the seed", async () => {
  const before = (await state()).sessionId;
  const took = await bob.publishBoard(board(3, "late"), SETTINGS, { onlyIfNone:true });
  assert.equal(took, false);
  assert.equal((await state()).sessionId, before);
});

test("admin: remove a profile (frees its seat, drops its wins); wins edit never goes below 0", async () => {
  await carol.join(ids.carol, "green");
  const key = (await state()).seatOf(ids.carol).key;
  for(let i = 0; i < 13; i++) await carol.adjustVP(key, +1);
  const season = seasonOf(NOW);

  await alice.adjustWins(ids.bob, season, +1);
  await alice.adjustWins(ids.bob, season, +1);
  await alice.adjustWins(ids.bob, season, -1);
  await alice.adjustWins(ids.alice, season, -1);      /* already 0: no-op */
  let s = await state();
  const wins = Object.fromEntries(s.winsFor(season).map(r => [r.profile.name, r.wins]));
  assert.deepEqual(wins, { Alice:0, Bob:1, Carol:1 });

  await alice.removeProfile(ids.carol);
  s = await state();
  assert.equal(s.profile(ids.carol), null);
  assert.equal(s.seats[Number(key.slice(1))].profileId, null, "seat freed");
  assert.ok(!s.winsFor(season).some(r => r.profile.id === ids.carol));
  /* carol's device may now create a profile again */
  assert.ok(carol.canCreateProfile(s));
});

test("watch() emits a GameState once everything has loaded, then on each change", async () => {
  const seen = [];
  const off = alice.watch(st => seen.push(st.counters.karma));
  await new Promise(r => setTimeout(r, 0));
  await bob.adjustCounter("karma", +1);
  await new Promise(r => setTimeout(r, 0));
  off();
  assert.deepEqual(seen, [0, 1]);
});
