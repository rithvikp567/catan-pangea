/**
 * Who this browser is: a stable device id (one profile may be created per
 * device) and the profile currently playing on it. Both live in
 * localStorage — players are expected to use the same browser each time.
 *
 * Local development: on localhost, `?device=<name>` gives a tab its own
 * identity, so several tabs can act as several phones.
 */
import { SafeStorage } from "./storage.js";

export class Identity {
  constructor(storage = Identity.#storageFor(globalThis.location)){
    this.storage = storage;
    let id = storage.get("deviceId");
    if(!id){
      id = "d_" + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
      storage.set("deviceId", id);
    }
    this.deviceId = id;
  }

  static #storageFor(loc){
    const dev = loc && ["localhost", "127.0.0.1"].includes(loc.hostname) && new URLSearchParams(loc.search).get("device");
    return new SafeStorage(dev ? `pangaea:dev-${dev}:` : "pangaea:");
  }

  /** The profile this device last played as (may have been removed since). */
  get profileId(){ return this.storage.get("profileId"); }
  set profileId(id){ this.storage.set("profileId", id ?? null); }
}
