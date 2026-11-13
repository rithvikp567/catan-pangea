/**
 * Installing Pangaea as an app (full screen, no browser bars).
 *
 *   - Android / desktop Chrome and Edge: the browser offers its own install
 *     dialog (beforeinstallprompt); we hold on to it and show it from our
 *     Install button.
 *   - iPhone / iPad: there is no install dialog to show — people add it
 *     themselves with Share → Add to Home Screen, so we explain that.
 *   - Already running as the installed app: nothing to offer.
 *
 * The service worker (sw.js) is registered here too: browsers want one
 * before they offer to install, and it lets the app open with no signal.
 */
const IOS = /iPhone|iPad|iPod/.test(globalThis.navigator?.userAgent ?? "")
  || (globalThis.navigator?.platform === "MacIntel" && globalThis.navigator?.maxTouchPoints > 1);

export class InstallHelper {
  /** @param {import("./storage.js").SafeStorage} storage */
  constructor(storage){
    this.storage = storage;
    this.deferred = null;            /* the browser's install prompt, saved for our button */
    this.justInstalled = false;
    this.listeners = new Set();
    addEventListener("beforeinstallprompt", e => { e.preventDefault(); this.deferred = e; this.#emit(); });
    addEventListener("appinstalled", () => { this.deferred = null; this.justInstalled = true; this.#emit(); });
  }

  /** Register sw.js (skipped with ?nosw, for debugging). */
  registerServiceWorker(){
    if(!("serviceWorker" in navigator) || new URLSearchParams(location.search).has("nosw")) return;
    navigator.serviceWorker.register("sw.js").catch(err => console.warn("Offline support unavailable", err));
  }

  /** Running as the installed app (home screen / app window)? */
  get installed(){
    return this.justInstalled || navigator.standalone === true
      || matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches;
  }

  /**
   * What we can offer here: "prompt" (show the browser's install dialog),
   * "ios" (explain Add to Home Screen), or null (installed, or not offered).
   */
  get mode(){
    if(this.installed) return null;
    if(this.deferred) return "prompt";
    return IOS ? "ios" : null;
  }

  /** The welcome screen's "Get the app" card was closed. */
  get dismissed(){ return this.storage.get("installTipDismissed", false) === true; }
  dismiss(){ this.storage.set("installTipDismissed", true); this.#emit(); }

  /** Show the browser's install dialog. @returns {Promise<boolean>} installed */
  async install(){
    const prompt = this.deferred;
    if(!prompt) return false;
    try{ await prompt.prompt(); }
    catch(err){ console.warn("Install dialog not shown", err); return false; }   /* e.g. no tap behind it: keep it for the next one */
    this.deferred = null;            /* each prompt can only be shown once */
    const { outcome } = await prompt.userChoice;
    this.#emit();
    return outcome === "accepted";
  }

  onChange(fn){ this.listeners.add(fn); }
  #emit(){ for(const fn of this.listeners) fn(); }
}

/** How to install on iPhone / iPad, for a toast or a card. */
export const IOS_STEPS = "In Safari, tap Share (the square with the arrow), then “Add to Home Screen”.";
