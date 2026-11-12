/**
 * Production store: the Firebase Realtime Database, which pushes every
 * change to every connected phone. A thin adapter over the modular web
 * SDK, loaded from Google's CDN only when a config is present — so the
 * app keeps zero build steps and works without Firebase at all.
 */
import { prune } from "./MemoryStore.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

export class FirebaseStore {
  /** @param {object} config the web app config from the Firebase console */
  static async connect(config){
    const [{ initializeApp }, rtdb] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-database.js`),
    ]);
    const app = initializeApp(config);
    return new FirebaseStore(rtdb, rtdb.getDatabase(app));
  }

  constructor(rtdb, database){
    this.rtdb = rtdb;
    this.db = database;
  }

  #ref(path){ return this.rtdb.ref(this.db, path || undefined); }

  subscribe(path, cb){
    return this.rtdb.onValue(this.#ref(path), snap => cb(snap.val()), err => console.error("sync error", path, err));
  }

  /* the RTDB rejects `undefined` anywhere in a value; prune() normalises
     writes exactly as MemoryStore stores them */
  async get(path){ return (await this.rtdb.get(this.#ref(path))).val(); }
  set(path, value){ return this.rtdb.set(this.#ref(path), prune(value)); }
  update(path, patch){
    const clean = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, prune(v)]));
    return this.rtdb.update(this.#ref(path), clean);
  }
  remove(path){ return this.rtdb.remove(this.#ref(path)); }

  async transact(path, fn){
    const res = await this.rtdb.runTransaction(this.#ref(path), cur => {
      const next = fn(cur);
      return next === undefined ? undefined : prune(next);
    });
    return { committed:res.committed, value:res.snapshot.val() };
  }

  onStatus(cb){
    return this.rtdb.onValue(this.#ref(".info/connected"), snap => cb(snap.val() ? "live" : "offline"));
  }
}
