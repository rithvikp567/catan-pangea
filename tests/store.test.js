import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore, prune } from "../catan-pangea/src/sync/MemoryStore.js";

const tick = () => new Promise(r => setTimeout(r, 0));

test("prune drops nulls and empty containers like the RTDB", () => {
  assert.deepEqual(prune({ a:1, b:null, c:{}, d:{ e:undefined } }), { a:1 });
  assert.equal(prune({}), null);
});

test("set / get / multi-path update / remove", async () => {
  const s = new MemoryStore();
  await s.set("v1/a/b", 1);
  await s.update("v1", { "a/c":2, "x/y":"z" });
  assert.deepEqual(await s.get("v1"), { a:{ b:1, c:2 }, x:{ y:"z" } });
  await s.remove("v1/x/y");
  assert.equal(await s.get("v1/x"), null, "empty parents disappear");
  await s.update("v1", { "a/b":null });
  assert.deepEqual(await s.get("v1/a"), { c:2 });
});

test("subscribe delivers the current value, then only real changes", async () => {
  const s = new MemoryStore({ v1:{ n:1 } });
  const seen = [];
  const off = s.subscribe("v1/n", v => seen.push(v));
  await tick();
  await s.set("v1/n", 2);
  await s.set("v1/other", 5);   /* unrelated: no callback */
  await tick();
  await s.set("v1/n", 3);
  await tick();
  off();
  await s.set("v1/n", 4);
  await tick();
  assert.deepEqual(seen, [1, 2, 3]);
});

test("transactions commit, or abort when fn returns undefined", async () => {
  const s = new MemoryStore({ c:{ n:1 } });
  const ok = await s.transact("c/n", n => n + 1);
  assert.deepEqual(ok, { committed:true, value:2 });
  const no = await s.transact("c/n", () => undefined);
  assert.deepEqual(no, { committed:false, value:2 });
  assert.equal(await s.get("c/n"), 2);
});

test("values handed out are copies, not live references", async () => {
  const s = new MemoryStore({ a:{ b:1 } });
  const v = await s.get("a");
  v.b = 99;
  assert.equal(await s.get("a/b"), 1);
});
