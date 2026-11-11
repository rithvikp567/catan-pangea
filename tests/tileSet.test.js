import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTileSet } from "../catan-pangea/src/engine/tileSet.js";
import { BASE_NUMBERS, BASE_TERRAIN } from "../catan-pangea/src/engine/catalog.js";
import { mulberry32 } from "../catan-pangea/src/engine/random.js";

const count = arr => arr.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});

test("19 tiles is exactly the base set and uses no randomness", () => {
  const rng = () => { throw new Error("rng used"); };
  const { terr, nums } = buildTileSet(19, rng);
  assert.deepEqual(terr, BASE_TERRAIN);
  assert.deepEqual(nums, BASE_NUMBERS);
});

test("every size 13–30: one token per non-desert tile, numbers mirrored around 7", () => {
  for(let A = 13; A <= 30; A++){
    for(let s = 0; s < 10; s++){
      const { terr, nums } = buildTileSet(A, mulberry32(s));
      assert.equal(terr.length, A);
      const need = terr.filter(t => t !== "desert").length;
      assert.equal(nums.length, need);
      const c = count(nums);
      const unpaired = [2,3,4,5,6].reduce((a, n) => a + Math.abs((c[n] || 0) - (c[14 - n] || 0)), 0);
      assert.ok(unpaired <= need % 2, `A=${A}: ${JSON.stringify(c)}`);
    }
  }
});

test("small maps keep every number twin and trim terrain proportionally", () => {
  const { terr, nums } = buildTileSet(13, mulberry32(1));
  assert.deepEqual([...nums].sort((a, b) => a - b), [2,3,4,5,6,6,8,8,9,10,11,12]);
  const c = count(terr);
  for(const t of ["forest","pasture","fields","hills","mountains"]) assert.ok(c[t] >= 2 && c[t] <= 3, `${t}: ${c[t]}`);
  assert.equal(c.desert, 1);
});
