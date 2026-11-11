import { test } from "node:test";
import assert from "node:assert/strict";
import { EDGE_DIR, DIRS, CORNER, hexDist, hk } from "../catan-pangea/src/engine/hex.js";
import { mulberry32 } from "../catan-pangea/src/engine/random.js";
import { hexagonRegion, frame56Region } from "../catan-pangea/src/engine/shapes.js";
import { Smax, adjacencyCount, topology, findLakes, outerCoast } from "../catan-pangea/src/engine/topology.js";
import { growContinent, compactify } from "../catan-pangea/src/engine/continent.js";
import { orderBoundary } from "../catan-pangea/src/engine/ports.js";

/* random shapes, including ragged ones that enclose lakes */
function* shapes(count){
  for(let s = 0; s < count; s++){
    const A = 13 + (s % 18);
    yield { A, land: growContinent(mulberry32(s), A, [0, 0.5, 1, 2, 3.2][s % 5]) };
  }
}

test("EDGE_DIR points at the hex across each edge", () => {
  for(let i = 0; i < 6; i++){
    const [dq, dr] = DIRS[EDGE_DIR[i]];
    const mid = [(CORNER[i][0] + CORNER[(i+1)%6][0]), (CORNER[i][1] + CORNER[(i+1)%6][1])];
    assert.deepEqual(mid, [2*dq + dr, 3*dr]);   /* neighbour centre = 2 × edge midpoint */
  }
});

test("hexDist", () => {
  assert.equal(hexDist(hk(0,0), hk(2,-1)), 2);
  assert.equal(hexDist(hk(-2,1), hk(2,-1)), 4);
});

test("Smax matches the standard board and the 5–6 frame exactly", () => {
  assert.equal(adjacencyCount(new Set(hexagonRegion(2))), Smax(19));
  assert.equal(Smax(19), 42);
  assert.equal(adjacencyCount(new Set(frame56Region())), Smax(30));
  assert.equal(topology(new Set(hexagonRegion(2))).counts[3], 24);
});

test("Euler identities hold on 1,500 random shapes (L = lake regions)", () => {
  for(const { A, land } of shapes(1500)){
    const t = topology(land), L = findLakes(land).regions;
    assert.equal(t.counts[3], t.S - A + 1 - L);
    assert.equal(t.counts[2], 3*A - t.S - 3 + 3*L);
    assert.equal(t.counts[1], 3*A - t.S + 3 - 3*L);
  }
});

test("outer coast excludes lake shores and walks as one unbroken loop", () => {
  let lakeShapes = 0;
  for(const { land } of shapes(1500)){
    const { lakes } = findLakes(land);
    if(!lakes.length) continue;
    lakeShapes++;
    const lakeSet = new Set(lakes);
    const coast = outerCoast(topology(land));
    assert.ok(coast.every(b => !lakeSet.has(b.water)));
    const cyc = orderBoundary(coast);
    cyc.forEach((b, i) => {
      const next = cyc[(i + 1) % cyc.length].edge.split("/");
      assert.ok(b.edge.split("/").some(v => next.includes(v)), "consecutive coast edges share a corner");
    });
  }
  assert.ok(lakeShapes > 20, "fixture should include lake shapes");
});

test("compactify reaches a 0.90 floor and fills lakes", () => {
  for(let s = 0; s < 60; s++){
    const A = 13 + (s % 18), target = Math.round(Smax(A) * 0.9);
    const land = compactify(growContinent(mulberry32(900 + s), A, 2.0), null, target);
    assert.equal(land.size, A);
    assert.ok(adjacencyCount(land) >= target);
    assert.equal(findLakes(land).regions, 0);
  }
});
