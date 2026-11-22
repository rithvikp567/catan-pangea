/**
 * The desktop arrangement (≥ 900 × 560 — the same query as the settings
 * sidebar) with its drag handles, and the music & tracker view.
 *
 * Desktop:
 *   ┌────────────┬───────────────────────────┬────────────┐
 *   │ tracker    │ top bar                    │            │
 *   │ (top)      │                            │  map       │
 *   ├══ split ═══┤ map                        │  settings  │
 *   │ music      │                            ├────────────┤
 *   │ (bottom)   │                            │  dock      │
 *   └────────────┴───────────────────────────┴────────────┘
 *        ↔ left                                 ↔ panel
 *
 * The left column appears when the tracker or the music is open. The
 * music is the 200 × 200 player with its controls beside it; alone it has
 * the song list under it, and with the tracker open the column splits —
 * tracker on top, music below (the list moves into a sheet until the
 * music is given room for it). The map stays usable beside the tracker.
 *
 * The music & tracker view (the top bar's "hide the map" button, desktop
 * only — on a phone it would just be the tracker over the music bar) hides
 * the map and gives the tracker and the music half the screen each — side
 * by side when the window is wider than tall (axis x), tracker over music
 * in a portrait window (axis y) — with a bar on the line between them to
 * drag:
 *
 *   ┌───────────┬───────────┐      ┌───────────┐
 *   │ tracker   │ 16:9      │      │ tracker   │
 *   │ (one      │ player    │      ╞═ halves ══╡
 *   │  column)  │ controls  │      │ player    │
 *   │           │ songs     │      │ songs     │
 *   └───────────┴───────────┘      └───────────┘
 *            ↔ halves
 *
 * Going back to the map (the tracker's back button, the back gesture) or
 * closing the music ends it. Sizes and the view are remembered per device.
 *
 * This class decides and measures; the CSS lays it out —
 * css/desktop.css from body[data-desk], body[data-left] and --left-w /
 * --split / --music-top / --panel-w / --top-h; css/split.css from
 * body[data-view="split"], body[data-axis] and --half (the tracker's
 * share in px). The two never apply at once.
 */
import { h } from "./dom.js";
import { DESKTOP_QUERY } from "./Sheet.js";

/* halves / halvesY: the tracker's share of the music & tracker view, side by side / stacked */
const DEFAULTS = Object.freeze({ left:420, panel:340, music:236, halves:0.5, halvesY:0.5 });
/* left ≥ 380: the 200 × 200 player and its controls side by side (they shrink a little to fit, css/music.css);
   music ≥ 236: the player in its card (padding, borders) and the gap under it */
const MIN = Object.freeze({ left:380, panel:280, map:420, tracker:200, music:236 });
/* the music & tracker view: the music half always fits a 16:9 player at least 200 tall
   (356 wide, or 200 tall plus its controls, in its card) — it wins over the tracker on a small screen */
const HALF_MIN = Object.freeze({
  x:{ tracker:300, music:424 },
  y:{ tracker:200, music:346 },
});
const MAX_PANEL = 560;
/* the tracker turns two-column at 760 px (@container in screens.css): the column stops just short,
   so the tracker always keeps its one-column phone layout here */
const MAX_LEFT = 759;
/* under the tracker, the song list shows once the music is this tall (player, its card, ~3 songs) */
const SONGS_FROM = 392;
const DESK_VARS = ["--left-w", "--split", "--panel-w", "--music-top", "--top-h"];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class DesktopLayout {
  /**
   * @param {object} p
   * @param {import("../app/Router.js").Router} p.router
   * @param {import("./MusicBar.js").MusicBar} p.music
   * @param {import("../app/storage.js").SafeStorage} p.storage
   * @param {HTMLElement} [p.trackerBtn]   shows pressed while the tracker is docked
   * @param {HTMLElement} [p.splitBtn]     opens the music & tracker view (shown on desktop only)
   * @param {HTMLElement} [p.topbar]
   */
  constructor({ router, music, storage, trackerBtn = null, splitBtn = null, topbar = null }){
    Object.assign(this, { router, music, storage, trackerBtn, splitBtn, topbar });
    this.mq = matchMedia(DESKTOP_QUERY);
    const saved = storage.get("desktopLayout", {}) ?? {};
    this.size = { ...DEFAULTS };
    for(const k of Object.keys(DEFAULTS)) if(Number.isFinite(saved[k])) this.size[k] = saved[k];
    this.splitOn = storage.get("splitView", false) === true;

    this.handles = {
      left:  this.#handle("left", "Resize the tracker and music column"),
      split: this.#handle("split", "Resize the tracker and the music"),
      panel: this.#handle("panel", "Resize the settings"),
      halves:this.#handle("halves", "Resize the tracker and the music"),
    };
    this.mq.addEventListener("change", () => { this.update(); this.router.refresh(); });
    addEventListener("resize", () => this.update());
    music.onToggle(open => {
      if(!open && this.splitOn){                           /* no music: the view ends */
        this.#setSplit(false);
        this.#animate("split-out");
        this.router.refresh();                             /* the map is back: usable beside the tracker again */
      }else this.update();
    });
    music.onAway(() => this.update());                   /* the season wins: no music column */
    this.update();
  }

  get desktop(){ return this.mq.matches; }

  /** Is the music & tracker view on screen? */
  get splitActive(){ return this.desktop && this.splitOn && this.music.isOpen && this.router.route === "tracker"; }

  /** Does this route sit beside the map, leaving the map usable? (Not in the music & tracker view: no map there.) */
  docks(route){ return this.desktop && route === "tracker" && !(this.splitOn && this.music.isOpen); }

  /** The router moved: going to the map ends the music & tracker view. */
  routed(route){
    if(route === "" && this.splitOn){ this.#setSplit(false); this.#animate("split-out"); }
    this.update();
  }

  /** Hide the map: the tracker and the music half and half (opening either if needed). */
  enterSplit(){
    if(!this.desktop) return;
    if(!this.music.isOpen) this.music.open();
    this.#setSplit(true);
    this.#animate("split-in");
    if(this.router.route === "tracker") this.router.refresh();
    else this.router.go("tracker");
  }

  /** Back to the map; the tracker and the music stay open beside it. */
  showMap(){
    this.#setSplit(false);
    this.#animate("split-out");
    this.router.refresh();
  }

  /** The music & tracker view coming or going: css/split.css animates the halves in, or the map back. */
  #animate(kind){
    if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const body = document.body.dataset;
    body.viewAnim = kind;
    clearTimeout(this.animTimer);
    this.animTimer = setTimeout(() => { if(body.viewAnim === kind) delete body.viewAnim; }, 700);
  }

  #setSplit(on){
    this.splitOn = on;
    this.storage.set("splitView", on);
  }

  /** Side by side ("x") when the screen is wider than tall, else tracker over music ("y"). */
  get #axis(){ return innerWidth >= innerHeight ? "x" : "y"; }
  /** Each way has its own saved share (a phone turned sideways keeps both). */
  get #halfKey(){ return this.#axis === "x" ? "halves" : "halvesY"; }

  update(){
    const root = document.documentElement.style, body = document.body.dataset;
    if(this.splitBtn) this.splitBtn.hidden = !this.desktop;
    if(this.splitActive){ this.#paintSplit(); return; }
    delete body.view; delete body.axis;
    root.removeProperty("--half");
    if(!this.desktop){
      delete body.desk; delete body.left;
      for(const v of DESK_VARS) root.removeProperty(v);
      this.music.setDock("bar");
      this.trackerBtn?.setAttribute("aria-pressed", "false");
      return;
    }
    const tracker = this.router.route === "tracker", music = this.music.isOpen && !this.music.isAway;
    const left = tracker && music ? "both" : tracker ? "tracker" : music ? "music" : "none";
    const vh = innerHeight - this.music.miniHeight, s = this.#clamped();   /* the mini bar along the bottom while the music is closed */
    const split = left === "both" ? vh - s.music : left === "tracker" ? vh : 0;
    body.desk = "";
    body.left = left;
    root.setProperty("--left-w", `${left === "none" ? 0 : s.left}px`);
    root.setProperty("--panel-w", `${s.panel}px`);
    root.setProperty("--split", `${split}px`);
    root.setProperty("--music-top", `${left === "both" ? split : 0}px`);
    root.setProperty("--top-h", `${this.topbar?.offsetHeight ?? 64}px`);

    /* the song list under the player once the music has room for it */
    this.music.setDock(left === "music" || (left === "both" && s.music >= SONGS_FROM) ? "column" : "compact");
    this.trackerBtn?.setAttribute("aria-pressed", String(tracker));

    this.#aria(this.handles.left, s.left, MIN.left, this.#maxLeft(s.panel));
    this.#aria(this.handles.panel, s.panel, MIN.panel, this.#maxPanel(s.left));
    this.#aria(this.handles.split, split, MIN.tracker, vh - MIN.music);
  }

  /** The music & tracker view: the desktop arrangement steps aside entirely. */
  #paintSplit(){
    const root = document.documentElement.style, body = document.body.dataset;
    delete body.desk; delete body.left;
    for(const v of DESK_VARS) root.removeProperty(v);
    const axis = this.#axis, total = axis === "x" ? innerWidth : innerHeight, { lo, hi } = this.#halfRange();
    const half = Math.round(this.#clamped()[this.#halfKey] * total);
    body.view = "split";
    body.axis = axis;
    root.setProperty("--half", `${half}px`);
    this.music.setDock("wide");
    this.handles.halves.setAttribute("aria-orientation", axis === "x" ? "vertical" : "horizontal");
    this.#aria(this.handles.halves, half, lo * total, hi * total);
  }

  #aria(el, now, lo, hi){
    el.setAttribute("aria-valuenow", String(Math.round(now)));
    el.setAttribute("aria-valuemin", String(Math.round(lo)));
    el.setAttribute("aria-valuemax", String(Math.round(hi)));
  }

  /* ---------------- sizes ---------------- */

  #maxLeft(panel){ return Math.max(MIN.left, Math.min(MAX_LEFT, innerWidth - panel - MIN.map)); }
  #maxPanel(left){ return Math.max(MIN.panel, Math.min(MAX_PANEL, innerWidth - left - MIN.map)); }

  /** The tracker's share of the music & tracker view, as fractions of the screen. */
  #halfRange(){
    const axis = this.#axis, total = axis === "x" ? innerWidth : innerHeight, min = HALF_MIN[axis];
    const hi = Math.max(0, 1 - min.music / total);          /* the music's minimum wins */
    return { lo:Math.min(min.tracker / total, hi), hi };
  }

  /** The saved sizes, fitted to this window (the saved values are kept for a bigger one). */
  #clamped(){
    const panel = clamp(this.size.panel, MIN.panel, this.#maxPanel(MIN.left));
    const left = clamp(this.size.left, MIN.left, this.#maxLeft(panel));
    const music = clamp(this.size.music, MIN.music, Math.max(MIN.music, innerHeight - MIN.tracker));
    const { lo, hi } = this.#halfRange(), key = this.#halfKey;
    return { panel, left, music, [key]:clamp(this.size[key], lo, hi) };
  }

  #settle(){
    Object.assign(this.size, this.#clamped());
    this.update();
    this.storage.set("desktopLayout", this.size);
  }

  /* ---------------- drag handles ---------------- */

  /** Which way this handle moves: "x" (a vertical bar) or "y". */
  #moves(name){ return name === "split" ? "y" : name === "halves" ? this.#axis : "x"; }

  /** A separator you can drag, nudge with the arrow keys (Shift = bigger steps) or double-click to reset. */
  #handle(name, label){
    const el = h("div", {
      class:"splitter", "data-split":name, role:"separator", tabindex:"0", "aria-label":label,
      "aria-orientation":this.#moves(name) === "x" ? "vertical" : "horizontal", title:`${label} — drag, or double-click to reset`,
    });
    el.addEventListener("pointerdown", e => {
      if(e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add("is-dragging");
      document.body.classList.add("is-resizing");
      document.body.dataset.resizing = this.#moves(name);
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
      else if(name === "halves") this.size[this.#halfKey] += d / (this.#axis === "x" ? innerWidth : innerHeight);
      else this.size.music -= d;                           /* the split moves down: less music */
      this.#settle();
    });
    el.addEventListener("dblclick", () => {
      const key = name === "split" ? "music" : name === "halves" ? this.#halfKey : name;
      this.size[key] = DEFAULTS[key];
      this.#settle();
    });
    document.body.append(el);
    return el;
  }

  #dragTo(name, x, y){
    if(name === "left") this.size.left = x;
    else if(name === "panel") this.size.panel = innerWidth - x;
    else if(name === "halves") this.size[this.#halfKey] = this.#axis === "x" ? x / innerWidth : y / innerHeight;
    else this.size.music = innerHeight - y;
    Object.assign(this.size, this.#clamped());
    this.update();
  }
}
