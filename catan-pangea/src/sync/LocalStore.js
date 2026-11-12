/**
 * "This device only" store: a MemoryStore persisted to localStorage and
 * mirrored across tabs of the same browser with a BroadcastChannel.
 * Used when Firebase isn't configured (local development, or offline).
 * It does NOT sync between different phones.
 */
import { MemoryStore } from "./MemoryStore.js";

export class LocalStore extends MemoryStore {
  /** @param {string} [key] storage key, also the channel name */
  constructor(key = "pangaea:local-db"){
    super(LocalStore.#load(key));
    this.key = key;
    try{
      this.channel = new BroadcastChannel(key);
      this.channel.onmessage = e => { this.root = e.data ?? null; super.changed(); };
    }catch{ this.channel = null; }
  }

  static #load(key){
    try{ return JSON.parse(localStorage.getItem(key) ?? "null"); }catch{ return null; }
  }

  changed(){
    try{ localStorage.setItem(this.key, JSON.stringify(this.root)); }catch{ /* storage full / blocked */ }
    this.channel?.postMessage(this.root);
    super.changed();
  }
}
