/**
 * Pick the store for this build: Firebase when configured, otherwise a
 * store that lives on this device only.
 *
 * `?store=local` in the URL forces the device-only store. The committed
 * config points at the live game's database, so use it whenever you test
 * (e.g. `http://localhost:8000/?store=local&device=alice`) — otherwise a
 * test run edits the real game everyone's phones are showing.
 */
import { FIREBASE_CONFIG } from "./firebaseConfig.js";
import { LocalStore } from "./LocalStore.js";

export async function createStore(config = FIREBASE_CONFIG, location = globalThis.location){
  const forceLocal = new URLSearchParams(location?.search ?? "").get("store") === "local";
  if(config?.databaseURL && !forceLocal){
    try{
      const { FirebaseStore } = await import("./FirebaseStore.js");
      return await FirebaseStore.connect(config);
    }catch(err){
      /* SDK couldn't load (offline at launch): keep the app usable locally */
      console.error("Firebase unavailable — using this device only", err);
    }
  }
  return new LocalStore();
}
