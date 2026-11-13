/**
 * The desktop arrangement (≥ 900 × 560 — the same query as the settings
 * sidebar), with three drag handles. Phones never see any of this.
 *
 *   ┌────────────┬───────────────────────────┬────────────┐
 *   │ tracker    │ top bar                    │            │
 *   │ (top)      │                            │  map       │
 *   ├══ split ═══┤ map                        │  settings  │
 *   │ music      │                            ├────────────┤
 *   │ (bottom)   │                            │  dock      │
 *   └────────────┴───────────────────────────┴────────────┘
 *        ↔ left                                 ↔ panel
 *
 * The left column appears when the tracker or the music is open. Music
 * alone fills it (a big player with the song list under it); with the
 * tracker open the column splits — tracker on top, music below (compact:
 * the 200 × 200 player beside its controls, until the music gets enough
 * room for the big player). The map stays usable beside the tracker.
 * Sizes are remembered per device.
 *
 * This class decides and measures; css/desktop.css lays it out from
 * body[data-desk], body[data-left] and the --left-w / --split / --panel-w
 * custom properties.
 */
import { h } from "./dom.js";
import { DESKTOP_QUERY } from "./Sheet.js";

const DEFAULTS = Object.freeze({ left:420, panel:340, music:224 });
const MIN = Object.freeze({ left:380, panel:280, map:420, tracker:200, music:224 });   /* left ≥ 380: the big player stays ≥ 200 tall */
const MAX_PANEL = 560;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class DesktopLayout {
  /**
   * @param {object} p
   * @param {import("../app/Router.js").Router} p.router
   * @param {import("./MusicBar.js").MusicBar} p.music
   * @param {import("../app/storage.js").SafeStorage} p.storage
   * @param {HTMLElement} [p.trackerBtn]   shows pressed while the tracker is docked
   * @param {HTMLElement} [p.topbar]
   */
  constructor({ router, music, storage, trackerBtn = null, topbar = null }){
    Object.assign(this, { router, music, storage, trackerBtn, topbar });
    this.mq = matchMedia(DESKTOP_QUERY);
    const saved = storage.get("desktopLayout", {}) ?? {};
    this.size = { ...DEFAULTS };
    for(const k of Object.keys(DEFAULTS)) if(Number.isFinite(saved[k])) this.size[k] = saved[k];

    this.handles = {
      left: this.#handle("left", "Resize the tracker and music column"),
      split:this.#handle("split", "Resize the tracker and the music"),
      panel:this.#handle("panel", "Resize the map settings"),
    };
    this.mq.addEventListener("change", () => { this.update(); this.router.refresh(); });
    addEventListener("resize", () => this.update());
    music.onToggle(() => this.update());
    this.update();
  }

  get desktop(){ return this.mq.matches; }

  /** Does this route sit in the left column, leaving the map usable? */
  docks(route){ return this.desktop && route === "tracker"; }

  update(){
    const root = document.documentElement.style, body = document.body.dataset;
    if(!this.desktop){
      delete body.desk; delete body.left;
      for(const v of ["--left-w", "--split", "--panel-w", "--music-top", "--top-h"]) root.removeProperty(v);
      this.music.setDock("bar");
      this.trackerBtn?.setAttribute("aria-pressed", "false");
      return;
    }
    const tracker = this.router.route === "tracker", music = this.music.isOpen;
    const left = tracker && music ? "both" : tracker ? "tracker" : music ? "music" : "none";
    const vh = innerHeight, s = this.#clamped();
    const split = left === "both" ? vh - s.music : left === "tracker" ? vh : 0;
    body.desk = "";
    body.left = left;
    root.setProperty("--left-w", `${left === "none" ? 0 : s.left}px`);
    root.setProperty("--panel-w", `${s.panel}px`);
    root.setProperty("--split", `${split}px`);
    root.setProperty("--music-top", `${left === "both" ? split : 0}px`);
    root.setProperty("--top-h", `${this.topbar?.offsetHeight ?? 64}px`);

    /* the big player (with the song list) once the music has room for it */
    const bigNeeds = (s.left - 32) * 9 / 16 + 230;     /* the 16:9 player, its controls and a few songs */
    this.music.setDock(left === "music" || (left === "both" && s.music >= bigNeeds) ? "column" : "compact");
    this.trackerBtn?.setAttribute("aria-pressed", String(tracker));

    const aria = (el, now, lo, hi) => { el.setAttribute("aria-valuenow", String(Math.round(now))); el.setAttribute("aria-valuemin", String(Math.round(lo))); el.setAttribute("aria-valuemax", String(Math.round(hi))); };
    aria(this.handles.left, s.left, MIN.left, this.#maxLeft(s.panel));
    aria(this.handles.panel, s.panel, MIN.panel, this.#maxPanel(s.left));
    aria(this.handles.split, split, MIN.tracker, vh - MIN.music);
  }

  /* ---------------- sizes ---------------- */

  #maxLeft(panel){ return Math.max(MIN.left, innerWidth - panel - MIN.map); }
  #maxPanel(left){ return Math.max(MIN.panel, Math.min(MAX_PANEL, innerWidth - left - MIN.map)); }

  /** The saved sizes, fitted to this window (the saved values are kept for a bigger one). */
  #clamped(){
    const panel = clamp(this.size.panel, MIN.panel, this.#maxPanel(MIN.left));
    const left = clamp(this.size.left, MIN.left, this.#maxLeft(panel));
    const music = clamp(this.size.music, MIN.music, Math.max(MIN.music, innerHeight - MIN.tracker));
    return { panel, left, music };
  }

  #settle(){
    Object.assign(this.size, this.#clamped());
    this.update();
    this.storage.set("desktopLayout", this.size);
  }

  /* ---------------- drag handles ---------------- */

  /** A separator you can drag, nudge with the arrow keys (Shift = bigger steps) or double-click to reset. */
  #handle(name, label){
    const vertical = name !== "split";
    const el = h("div", {
      class:"splitter", "data-split":name, role:"separator", tabindex:"0", "aria-label":label,
      "aria-orientation":vertical ? "vertical" : "horizontal", title:`${label} — drag, or double-click to reset`,
    });
    el.addEventListener("pointerdown", e => {
      if(e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add("is-dragging");
      document.body.classList.add("is-resizing");
      document.body.dataset.resizing = vertical ? "x" : "y";
      const move = ev => this.#dragTo(name, ev.clientX, ev.clientY);
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.classList.remove("is-dragging");
        document.body.classList.remove("is-resizing");
        delete document.body.dataset.resizing;
        this.#settle();
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up, { once:true });
      el.addEventListener("pointercancel", up, { once:true });
    });
    el.addEventListener("keydown", e => {
      const step = e.shiftKey ? 64 : 16;
      const d = { ArrowLeft:-step, ArrowRight:step, ArrowUp:-step, ArrowDown:step }[e.key];
      if(d === undefined) return;
      e.preventDefault();
      if(name === "left") this.size.left += d;
      else if(name === "panel") this.size.panel -= d;      /* its edge moves right: a narrower panel */
      else this.size.music -= d;                           /* the split moves down: less music */
      this.#settle();
    });
    el.addEventListener("dblclick", () => {
      const key = name === "split" ? "music" : name;
      this.size[key] = DEFAULTS[key];
      this.#settle();
    });
    document.body.append(el);
    return el;
  }

  #dragTo(name, x, y){
    if(name === "left") this.size.left = x;
    else if(name === "panel") this.size.panel = innerWidth - x;
    else this.size.music = innerHeight - y;
    Object.assign(this.size, this.#clamped());
    this.update();
  }
}
