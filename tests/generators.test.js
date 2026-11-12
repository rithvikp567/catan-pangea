import { test } from "node:test";
import assert from "node:assert/strict";
import { GENERATORS, getGenerator, restoreBoard, BoardGenerator, Annealer, AbortError } from "../catan-pangea/src/engine/index.js";
import { TERRAIN, PORT_SITE_DIST } from "../catan-pangea/src/engine/catalog.js";
import { hexDist } from "../catan-pangea/src/engine/hex.js";

const fastYield = () => Promise.resolve();
const annealer = new Annealer({ yieldFn:fastYield });
const request = (seed, extra = {}) => ({
  seed, tiles:19, players:4, profile:"ck", compactness:0.9, iterations:4000, shipRule:"flat", ...extra,
});

/* a fingerprint of everything drawn on the board */
const fingerprint = board => JSON.stringify({
  tiles:[...board.tiles.values()].map(t => [t.key, t.terrain, t.num]).sort(),
  ports:board.portSlots.map(p => [p.edge, p.port.type, p.port.res]),
});

test("registry exposes exactly Open Sea and Sea Lanes", () => {
  assert.deepEqual(GENERATORS.map(g => g.id), ["open", "lanes"]);
  assert.equal(getGenerator("nope").id, "open");
  assert.throws(() => new BoardGenerator({ id:"x" }), TypeError);
});

for(const gen of GENERATORS){
  test(`${gen.name}: same seed + settings reproduce the identical board`, async () => {
    const a = await gen.generate(request("repeat-me"), { annealer });
    const b = await gen.generate(request("repeat-me"), { annealer });
    const c = await gen.generate(request("something-else"), { annealer });
    assert.equal(fingerprint(a), fingerprint(b));
    assert.notEqual(fingerprint(a), fingerprint(c));
  });

  test(`${gen.name}: boards are complete and follow the hard rules`, async () => {
    for(const seed of ["alpha", "bravo", "charlie"]){
      const board = await gen.generate(request(seed), { annealer });
      assert.equal(board.tiles.size, 19);
      assert.equal(board.portSlots.length, gen.portCount);
      assert.equal(board.evaluation.detail.red, 0, "no 6/8 touches another 6/8");
      for(const t of board.tiles.values()) assert.equal(t.num === null, t.terrain === "desert");
      assert.ok(board.score.total > 0 && board.score.total <= 100);
    }
  });

  test(`${gen.name}: 2:1 ports sit about ${PORT_SITE_DIST} hexes from their resource`, async () => {
    let dev = 0, n = 0;
    for(const seed of ["p1", "p2", "p3", "p4"]){
      const board = await gen.generate(request(seed), { annealer });
      for(const s of board.portSlots.filter(s => s.port.type === "two")){
        let d = Infinity;
        for(const t of board.tiles.values()) if(TERRAIN[t.terrain].res === s.port.res) d = Math.min(d, hexDist(t.key, s.hex));
        dev += Math.abs(d - PORT_SITE_DIST); n++;
      }
    }
    assert.ok(dev / n < 0.25, `mean deviation ${dev / n}`);
  });
}

test("Open Sea: every simulated seat opens with ore and wheat, Base profile too", async () => {
  for(const seed of ["ow1", "ow2", "ow3"]){
    const board = await getGenerator("open").generate(request(seed, { profile:"base", iterations:6000 }), { annealer });
    for(const seat of board.evaluation.detail.draft){
      assert.ok(seat.res.has("ore") && seat.res.has("grain"));
    }
  }
});

test("Sea Lanes: land stays inside the frame and leftover frame hexes are water", async () => {
  const gen = getGenerator("lanes");
  const board = await gen.generate(request("frame", { tiles:22 }), { annealer });
  const frame = new Set(gen.domain());
  for(const k of board.land) assert.ok(frame.has(k));
  assert.equal(board.waterHexes.length, frame.size - 22);
  assert.ok(board.lanes);
});

test("tile counts are clamped to what a board type supports", async () => {
  const board = await getGenerator("lanes").generate(request("clamp", { tiles:99, iterations:500 }), { annealer });
  assert.equal(board.tiles.size, 30);
});

for(const gen of GENERATORS){
  test(`${gen.name}: a snapshot restores the identical board and score`, async () => {
    const board = await gen.generate(request("snap", { tiles:21 }), { annealer });
    const snap = JSON.parse(JSON.stringify(board.toSnapshot()));   /* survives a JSON round trip */
    const back = restoreBoard(snap);
    assert.equal(fingerprint(back), fingerprint(board));
    assert.equal(back.score.total, board.score.total);
    assert.equal(back.seed, "snap");
    assert.equal(!!back.lanes, !!board.lanes);
  });
}

test("restoreBoard rejects unknown snapshots", () => {
  assert.throws(() => restoreBoard({ v:1, generatorId:"nope" }));
  assert.throws(() => getGenerator("open").restore({ v:2, generatorId:"open" }));
});

test("an aborted anneal rejects with AbortError", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(getGenerator("open").generate(request("abort"), { annealer, signal:ctrl.signal }), AbortError);
});
