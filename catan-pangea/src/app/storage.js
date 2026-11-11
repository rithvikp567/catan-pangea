/**
 * localStorage that never throws — private windows, blocked storage and
 * quota errors all degrade to "nothing remembered".
 */
export class SafeStorage {
  constructor(prefix = "pangaea:", backend = SafeStorage.#defaultBackend()){
    this.prefix = prefix;
    this.backend = backend;
  }

  static #defaultBackend(){
    try{ return globalThis.localStorage ?? null; }catch{ return null; }
  }

  get(key, fallback = null){
    try{
      const raw = this.backend?.getItem(this.prefix + key);
      return raw == null ? fallback : JSON.parse(raw);
    }catch{ return fallback; }
  }

  set(key, value){
    try{ this.backend?.setItem(this.prefix + key, JSON.stringify(value)); }catch{ /* ignore */ }
  }
}
