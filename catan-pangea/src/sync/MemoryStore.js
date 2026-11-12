/**
 * The store contract every sync adapter implements — a JSON tree
 * addressed by "a/b/c" paths, modelled on the Firebase Realtime Database
 * so the production adapter is a thin wrapper:
 *
 *   subscribe(path, cb) -> unsubscribe   cb(value|null) now and on every change
 *   get(path)           -> Promise<value|null>
 *   set(path, value)    -> Promise        null removes
 *   update(path, patch) -> Promise        multi-path: keys may contain "/"
 *   remove(path)        -> Promise
 *   transact(path, fn)  -> Promise<{committed, value}>
 *                          fn(current) returns the new value, or undefined to abort
 *   onStatus(cb)        -> unsubscribe   cb("live" | "offline" | "device")
 *
 * Like the RTDB, nulls are never stored and empty objects disappear.
 *
 * MemoryStore is the reference implementation (used by tests), and the
 * base of LocalStore.
 */

export const pathParts = path => String(path).split("/").filter(Boolean);
export const joinPath = (...parts) => parts.filter(p => p !== "" && p != null).join("/");
const clone = v => (v === null || v === undefined) ? null : structuredClone(v);

/** Drop nulls / undefined and empty containers, as the RTDB does. */
export function prune(value){
  if(value === null || value === undefined) return null;
  if(Array.isArray(value)){
    const arr = value.map(prune).filter(v => v !== null);
    return arr.length ? arr : null;
  }
  if(typeof value === "object"){
    const out = {};
    for(const [k, v] of Object.entries(value)){ const p = prune(v); if(p !== null) out[k] = p; }
    return Object.keys(out).length ? out : null;
  }
  return value;
}

export function readPath(root, path){
  let node = root;
  for(const p of pathParts(path)){
    if(node === null || typeof node !== "object" || !(p in node)) return null;
    node = node[p];
  }
  return node ?? null;
}

/** Returns the new root with `value` written at `path`. */
export function writePath(root, path, value){
  const parts = pathParts(path);
  const v = prune(value);
  if(!parts.length) return v;
  const base = (root && typeof root === "object") ? structuredClone(root) : {};
  const stack = [base];
  let node = base;
  for(const p of parts.slice(0, -1)){
    if(!node[p] || typeof node[p] !== "object") node[p] = {};
    node = node[p];
    stack.push(node);
  }
  const leaf = parts[parts.length - 1];
  if(v === null) delete node[leaf]; else node[leaf] = v;
  /* prune now-empty ancestors */
  for(let i = stack.length - 1; i > 0; i--){
    if(Object.keys(stack[i]).length) break;
    delete stack[i - 1][parts[i - 1]];
  }
  return Object.keys(base).length ? base : null;
}

export class MemoryStore {
  constructor(initial = null){
    this.root = prune(initial);
    this.subs = new Set();
    this.flushQueued = false;
  }

  get status(){ return "device"; }

  subscribe(path, cb){
    const sub = { path, cb, lastKey:undefined };
    this.subs.add(sub);
    queueMicrotask(() => { if(this.subs.has(sub)) this.#deliver(sub); });
    return () => this.subs.delete(sub);
  }

  async get(path){ return clone(readPath(this.root, path)); }

  async set(path, value){
    this.root = writePath(this.root, path, value);
    this.changed();
  }

  async update(path, patch){
    for(const [k, v] of Object.entries(patch)) this.root = writePath(this.root, joinPath(path, k), v);
    this.changed();
  }

  async remove(path){ return this.set(path, null); }

  async transact(path, fn){
    const current = clone(readPath(this.root, path));
    const next = fn(current);
    if(next === undefined) return { committed:false, value:current };
    this.root = writePath(this.root, path, next);
    this.changed();
    return { committed:true, value:clone(readPath(this.root, path)) };
  }

  onStatus(cb){ cb(this.status); return () => {}; }

  /** Notify subscribers whose value changed (batched per microtask). */
  changed(){
    if(this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      this.flushQueued = false;
      for(const sub of [...this.subs]) this.#deliver(sub);
    });
  }

  #deliver(sub){
    const value = readPath(this.root, sub.path);
    const key = JSON.stringify(value);
    if(key === sub.lastKey) return;
    sub.lastKey = key;
    sub.cb(clone(value));
  }
}
