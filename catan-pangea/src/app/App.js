/**
 * Application controller. Owns the local state (settings + the board on
 * screen), runs generations, connects the shared game, and wires the
 * views together. Views never talk to each other or to the engine
 * directly — they report intent to App (map side) or GameController
 * (tracker side).
 *
 * The board on screen IS the shared game: the first device online
 * publishes its map as the session; "New map" replaces the session for
 * everyone; a session arriving from another phone is restored from its
 * snapshot, so every phone shows the identical map.
 *
 * A new map builds itself in (BoardView's animation) on every device at
 * once: the device that pressed New map publishes, with the map, the moment
 * the build starts (`meta.buildAt`, on the server's clock, BUILD_LEAD_MS
 * ahead so the map has reached everyone by then), and every device runs the
 * same build from that moment — the animation where the map is on screen,
 * the sounds on every open device (unless it's muted: the volume button on
 * the map). Every page load opens with the intro (Splash); signing in ends
 * with "Welcome, Lord …".
 *
 * The look (theme + accent color) is each person's own: LookSync decides
 * whose shows and saves picks on the signed-in profile, so it follows them
 * to every device; ThemeController paints it.
 */
import { Annealer, AbortError, GENERATORS, randomSeedName, restoreBoard } from "../engine/index.js";
import { Settings } from "./Settings.js";
import { SafeStorage } from "./storage.js";
import { Identity } from "./Identity.js";
import { GameController } from "./GameController.js";
import { LookSync } from "./LookSync.js";
import { Router } from "./Router.js";
import { InstallHelper, IOS_STEPS } from "./InstallHelper.js";
import { createStore } from "../sync/createStore.js";
import { COUNTERS, colorById } from "../game/rules.js";
import { flipTheme } from "../game/looks.js";
import { SegmentedControl } from "../ui/controls.js";
import { BoardView } from "../ui/BoardView.js";
import { ScoreCard } from "../ui/ScoreCard.js";
import { SettingsPanel } from "../ui/SettingsPanel.js";
import { Sheet } from "../ui/Sheet.js";
import { ThemeController } from "../ui/ThemeController.js";
import { LookPanel } from "../ui/LookPanel.js";
import { Toast } from "../ui/Toast.js";
import { VictoryOverlay } from "../ui/VictoryOverlay.js";
import { MusicBar } from "../ui/MusicBar.js";
import { DesktopLayout } from "../ui/DesktopLayout.js";
import { WinterEffect } from "../ui/WinterEffect.js";
import { Sound } from "../ui/Sound.js";
import { Splash } from "../ui/Splash.js";
import { AccountLine } from "../ui/AccountLine.js";
import { JoinScreen } from "../ui/screens/JoinScreen.js";
import { TrackerScreen } from "../ui/screens/TrackerScreen.js";
import { WinsScreen } from "../ui/screens/WinsScreen.js";
import { AdminScreen } from "../ui/screens/AdminScreen.js";
import { readBoardPalette } from "../ui/palette.js";
import { saveBoardImage } from "../ui/imageExport.js";

/** How long to wait for the shared game before showing a local map. */
const CONNECT_TIMEOUT_MS = 6000;
/** A new map starts building this long after it's published, so it has reached every device by then. */
const BUILD_LEAD_MS = 800;

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export class App {
  /** @param {Document} doc */
  constructor(doc = document){
    const $ = id => doc.getElementById(id);
    this.dom = {
      board:$("board"), generate:$("generateBtn"), progress:$("generateBtn").querySelector(".progress"),
      label:$("generateBtn").querySelector(".label"), note:$("stageNote"),
      about:$("aboutDialog"),
    };

    this.storage = new SafeStorage();
    this.settings = new Settings(this.storage.get("settings", {}));
    this.annealer = new Annealer();
    this.board = null;
    this.inflight = null;          /* { ctrl:AbortController, kind:"boot"|"user", done:Promise } of the running generation */
    this.shownSessionId = null;    /* the shared game whose board is on screen */
    this.seatedIn = null;          /* session id this device was last seated in */

    this.sound = new Sound({ storage:this.storage });
    this.splash = new Splash({ sound:this.sound });   /* the intro is on screen already (index.html) */
    this.toast = new Toast();
    this.install = new InstallHelper(this.storage);
    this.identity = new Identity();
    this.game = new GameController({ identity:this.identity, toast:this.toast });

    this.theme = new ThemeController();          /* the look index.html's head script painted, kept up to date */
    /* whose look shows here (the signed-in person's follows them to every device) — each
       ?device= tab on localhost is a device of its own, so it keeps Identity's storage */
    this.look = new LookSync({ game:this.game, storage:this.identity.storage, apply:look => this.theme.set(look) });
    /* a pick waiting to be saved goes now if the page is hidden or closed (a locked phone, the app swiped away) */
    addEventListener("pagehide", () => this.look.flush());
    document.addEventListener("visibilitychange", () => { if(document.visibilityState === "hidden") this.look.flush(); });
    this.boardView = new BoardView(this.dom.board);
    this.sheet = new Sheet($("panel"), $("scrim"), { opener:$("settingsBtn"), closer:$("sheetClose") });
    this.scoreCard = new ScoreCard($("scoreCard"));
    this.panel = new SettingsPanel($("settings"), {
      settings:this.settings,
      onChange:patch => this.update(patch),
      onReplaySeed:seed => { this.sheet.close(); this.newGame({ seed }); },
    });
    this.lookPanel = new LookPanel($("look"), { onPick:patch => this.look.pick(patch) });
    this.look.onChange((look, owner) => this.lookPanel.sync(look, owner));
    this.modeSwitch = new SegmentedControl({
      label:"Board type", value:this.settings.mode,
      options:GENERATORS.map(g => ({ value:g.id, label:g.name })),
      onChange:mode => this.#switchMode(mode),
    });
    $("modeSwitch").append(this.modeSwitch.el);

    this.router = new Router({ mapEl:$("app"), docked:route => !!this.layout?.docks(route), onRoute:route => this.#routed(route) });
    this.music = new MusicBar({ game:this.game, toast:this.toast, storage:this.storage });
    this.music.setAway("splash", true);      /* held back while the intro is up */
    const deps = {
      game:this.game, router:this.router, toast:this.toast, music:this.music, install:this.install,
      confirm:msg => window.confirm(msg),
      ensureSession:() => this.#ensureSession(),
      installApp:() => this.installApp(),
      /** "Welcome, Lord Sam" over everything; `covered` runs once it hides what's underneath */
      welcome:(who, opts) => this.splash.welcome(who, opts),
    };
    this.screens = [new JoinScreen(deps), new TrackerScreen(deps), new WinsScreen(deps), new AdminScreen(deps)];
    for(const s of this.screens) this.router.register(s);
    this.victory = new VictoryOverlay(deps);
    this.winter = new WinterEffect({ max:COUNTERS.walker.max(0) });
    this.winter.keepClear(this.music.video);       /* frost all round the window, never over the YouTube player */
    this.layout = new DesktopLayout({ router:this.router, music:this.music, storage:this.storage,
      trackerBtn:$("trackerBtn"), splitBtn:$("splitBtn"), topbar:doc.querySelector(".topbar") });
    deps.layout = this.layout;     /* the tracker's back button leaves the music & tracker view */
    this.account = new AccountLine($("account"), {
      game:this.game,
      onSignOut:() => { this.game.signOut(); this.router.go("join"); },
      onSignIn:() => this.router.go("join"),
    });
    this.game.onChange(state => this.#onGameState(state));

    this.#wire($);
  }

  async start(){
    this.install.registerServiceWorker();
    this.router.start();
    this.dom.note.textContent = "Loading the game…";
    /* the intro holds until the game has loaded, then fades into choosing an account — or,
       for someone signed in and seated, into "Welcome, Lord …" and on to the map */
    let loaded;
    const ready = new Promise(r => { loaded = r; });
    const release = () => this.music.setAway("splash", false);
    this.splash.intro({ until:ready, next:() => this.#greeting(), onReveal:release }).then(release, release);
    try{
      const store = await createStore();
      const first = await Promise.race([
        this.game.connect(store),
        new Promise(resolve => setTimeout(() => resolve(null), CONNECT_TIMEOUT_MS)),
      ]);
      if(!first){
        this.toast.show("Can't reach the game server — showing a local map for now.");
        await this.newGame({ kind:"boot" });
        return;
      }
      if(!first.session) await this.newGame({ kind:"boot" });
      /* a player who isn't seated in the current game starts at the join screen */
      if(!this.router.route && !this.game.mySeat) this.router.go("join", { replace:true });
    }finally{ loaded(); }
  }

  /** The welcome after the intro: only for someone signed in here and seated in the game. */
  #greeting(){
    const seat = this.game.mySeat;
    return seat ? { name:seat.profile.name, note:`You're ${colorById(seat.color)?.label ?? "seated"}` } : null;
  }

  /** Every route change: the desktop layout, and the music is put away while the season wins are up. */
  #routed(route){
    this.layout?.routed(route);
    this.music?.setAway("wins", route === "wins");
    document.getElementById("winsBtn")?.setAttribute("aria-pressed", String(route === "wins"));
  }

  /** Apply a settings patch, persist it, and reflect it in the views. */
  update(patch){
    this.settings = this.settings.with(patch);
    this.storage.set("settings", this.settings.toJSON());
    this.panel.sync(this.settings);
    this.modeSwitch.set(this.settings.mode);
  }

  /**
   * Generate a new map and make it the shared game. Every call is a new
   * map: a fresh random seed unless one is given to replay.
   * @param {object} [p]
   * @param {string} [p.seed]
   * @param {"user"|"boot"} [p.kind]  boot: only becomes the game if none exists
   * @param {boolean} [p.confirmed]   the "start over?" question was already answered
   * @returns {Promise<boolean>} false if the user declined
   */
  newGame({ seed = randomSeedName(), kind = "user", confirmed = false } = {}){
    if(kind === "user" && !confirmed && !this.#confirmNewGame()) return Promise.resolve(false);
    this.inflight?.ctrl.abort();
    const ctrl = new AbortController();
    const done = this.#generate(seed, kind, ctrl);
    this.inflight = { ctrl, kind, done };
    return done;
  }

  async #generate(seed, kind, ctrl){
    this.#setBusy(true);
    await null;                    /* let newGame() record the run before it can finish */
    try{
      const board = await this.settings.generator.generate(this.settings.toRequest(seed), {
        annealer:this.annealer, signal:ctrl.signal, onProgress:f => this.#setProgress(f),
      });
      if(ctrl.signal.aborted) return true;
      this.board = board;
      /* New map: it builds itself in here and on every other device, all starting at buildAt */
      const buildAt = kind === "user" ? this.game.now() + BUILD_LEAD_MS : null;
      this.#render({ buildAt });
      if(this.game.ready) await this.game.publishBoard(board, this.settings.toJSON(), { onlyIfNone:kind === "boot", buildAt });
    }catch(err){
      if(err instanceof AbortError) return true;
      console.error(err);
      this.dom.note.textContent = "Something went wrong generating that map — try again.";
    }finally{
      if(this.inflight?.ctrl === ctrl){ this.inflight = null; this.#setBusy(false); }
    }
    return true;
  }

  /** Starting over wipes the tracker for everyone — ask first if a game is under way. */
  #confirmNewGame(){
    if(!this.game.state?.hasProgress) return true;
    const ok = window.confirm("Start a new game for everyone? Points, knights, cities and karma start over. Everyone keeps their seat and color, and season wins are kept.");
    this.sound.wake();             /* an iPhone stops the page's audio for a dialog: start it again, still inside the tap */
    return ok;
  }

  #switchMode(mode){
    if(!this.#confirmNewGame()){ this.modeSwitch.set(this.settings.mode); return; }
    this.update({ mode });
    this.newGame({ confirmed:true });
  }

  /**
   * The map on screen becomes the game if there isn't one yet. Joining
   * can happen while the first map is still being generated (e.g. the app
   * was opened on the join screen), so wait for it — or make one.
   */
  async #ensureSession(){
    if(!this.game.state || this.game.state.session) return;
    if(this.inflight) await this.inflight.done;
    else if(!this.board) await this.newGame({ kind:"boot" });
    if(this.game.state && !this.game.state.session && this.board){
      await this.game.publishBoard(this.board, this.settings.toJSON(), { onlyIfNone:true });
    }
  }

  /* ---------- shared game ---------- */

  /* called on every sync change — including status-only updates that can
     arrive before the first state (state is null then) */
  #onGameState(state){
    if(!state){ for(const s of this.screens) if(s.visible) s.render(null); return; }
    if(state.session && state.sessionId !== this.shownSessionId){
      const wasSeated = !!this.seatedIn, fresh = this.shownSessionId !== null;   /* (not the first game seen after loading) */
      this.shownSessionId = state.sessionId;
      this.#showSessionBoard(state.session, fresh);
      /* a new game with fewer seats left this player out: pick again */
      if(wasSeated && !this.game.mySeat){
        this.toast.show("New game started with fewer seats — pick a color to join.");
        this.router.go("join");
      }
    }
    this.seatedIn = this.game.mySeat ? state.sessionId : null;
    for(const s of this.screens) if(s.visible) s.render(state);
    this.victory.update(state);
    this.winter.set(state.session ? state.counters.walker : 0);
  }

  /** @param {boolean} [fresh]  a new game someone just started: it builds itself in, in step with the device that started it */
  #showSessionBoard(session, fresh = false){
    /* already on screen (we just published it) */
    if(this.board && this.board.seed === session.meta.seed && this.board.generatorId === session.board.generatorId){
      return;
    }
    try{
      const board = restoreBoard(session.board);
      if(this.inflight?.kind === "boot") this.inflight.ctrl.abort();   /* someone else got there first */
      this.board = board;
      if(session.settings) this.update(session.settings);
      /* (a game from before 2.11 has no buildAt: it builds from now) */
      this.#render(fresh ? { buildAt:session.meta.buildAt ?? this.game.now() } : {});
    }catch(err){
      console.error(err);
      this.toast.show("Couldn't load the shared map.");
    }
  }

  /* ---------- map view ---------- */

  /**
   * Draw the board. A new map (`buildAt`: when its build starts, server
   * clock) builds itself in, from that moment — part way through if it
   * started already: animated where the map is on screen, and its sounds
   * on any device whose page is showing (muted: silently).
   * @param {{ buildAt?:number|null }} [p]
   */
  #render({ buildAt = null } = {}){
    if(!this.board) return;
    const route = this.router.route;
    const showing = document.visibilityState === "visible";
    let build = null;
    if(buildAt != null && showing){
      const onScreen = (!route || !!this.layout?.docks(route)) && !this.splash.showing;
      build = {
        start:performance.now() + (buildAt - this.game.now()),
        motion:onScreen && !reducedMotion(),
        sound:this.sound,
        seed:`${this.board.seed}|${buildAt}`,
      };
    }
    this.boardView.render(this.board, readBoardPalette(), { build });
    this.scoreCard.render(this.board);
    this.dom.note.textContent = this.board.lanes ? "Dashed ports can only be reached by ship." : "";
  }

  #setBusy(busy){
    const btn = this.dom.generate;
    btn.classList.toggle("is-busy", busy);
    btn.setAttribute("aria-busy", String(busy));
    this.dom.label.textContent = busy ? "Generating…" : "New map";
    this.boardView.setStale(busy && !!this.board);
    if(busy) this.scoreCard.showPending();
    this.#setProgress(0);
  }

  #setProgress(fraction){
    this.dom.progress.style.setProperty("--p", String(fraction));
  }

  #wire($){
    this.dom.generate.addEventListener("click", () => this.newGame());
    /* on desktop the tracker sits beside the map, so the button opens and closes it */
    $("trackerBtn").addEventListener("click", () => this.router.go(this.router.route === "tracker" ? "" : "tracker"));
    this.music.addOpener($("musicBtn"));
    /* hide the map: the tracker and the music half and half (desktop) */
    $("splitBtn").addEventListener("click", () => this.layout.enterSplit());
    /* season wins: in the top bar only (the music is put away while it's up) */
    $("winsBtn").addEventListener("click", () => this.router.route === "wins" ? this.router.back() : this.router.go("wins"));
    /* install: shown until the app is installed (Android / desktop: the browser's dialog; iPhone: how-to) */
    const installBtn = $("installBtn");
    const syncInstall = () => { installBtn.hidden = !this.install.mode; };
    this.install.onChange(syncInstall);
    syncInstall();
    installBtn.addEventListener("click", () => this.installApp());
    /* full screen where the browser allows a page to (Android, iPad) */
    const fsBtn = $("fullscreenBtn");
    const syncFullscreen = () => {
      const on = !!document.fullscreenElement;
      fsBtn.hidden = !this.install.canFullscreen;
      fsBtn.setAttribute("aria-pressed", String(on));
      fsBtn.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
      fsBtn.title = on ? "Exit full screen" : "Full screen — hide the browser bars";
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    this.install.onChange(syncFullscreen);
    syncFullscreen();
    fsBtn.addEventListener("click", () => this.install.toggleFullscreen());
    /* the top bar's light / dark switch: the theme's partner in the other family (Sand ⇄ Hearth) —
       a pick like any other, so it's saved for whoever's signed in */
    const themeBtn = $("themeBtn");
    const syncThemeBtn = () => {
      const to = this.theme.scheme === "dark" ? "light" : "dark";
      themeBtn.setAttribute("aria-label", `Switch to the ${to} theme`);
      themeBtn.title = `Switch to the ${to} theme — more themes in Settings`;
    };
    themeBtn.addEventListener("click", () => this.look.pick({ theme:flipTheme(this.look.current.theme, this.theme.systemDark) }));
    /* the board bakes its colors in: recolor it in place (a new map's build animation carries on),
       and the snow has a palette for each family */
    this.theme.onChange(({ colors }) => {
      if(colors){ this.boardView.recolor(readBoardPalette()); this.winter.refreshTheme(); }
      syncThemeBtn();
    });
    syncThemeBtn();
    $("shareBtn").addEventListener("click", () => this.#saveImage());
    /* the map's volume button: the sound effects on / off on this device (not the music) */
    const muteBtn = $("muteBtn");
    const syncMute = muted => {
      muteBtn.setAttribute("aria-pressed", String(muted));
      muteBtn.setAttribute("aria-label", muted ? "Sound effects off — turn on" : "Sound effects on — mute");
      muteBtn.title = muted ? "Sound effects off (new map, welcome) — tap to turn on" : "Sound effects on (new map, welcome) — tap to mute";
    };
    this.sound.onMuted(syncMute);
    syncMute(this.sound.muted);
    muteBtn.addEventListener("click", () => {
      const muted = !this.sound.muted;
      this.sound.setMuted(muted);
      if(!muted) this.sound.preview();          /* a pop: this is what it sounds like (and that it works) */
      this.toast.show(muted ? "Sound effects off on this device." : "Sound effects on.");
    });

    $("aboutBtn").addEventListener("click", () => this.dom.about.showModal());
    this.dom.about.querySelector("[data-close]").addEventListener("click", () => this.dom.about.close());
    this.dom.about.addEventListener("click", e => { if(e.target === this.dom.about) this.dom.about.close(); });

    /* Enter = new map, unless the user is typing, pressing a control, or on another screen */
    document.addEventListener("keydown", e => {
      if(e.key !== "Enter" || e.repeat || (this.router.route && !this.layout.docks(this.router.route))) return;
      const t = e.target;
      if(t instanceof HTMLElement && t.closest("input, textarea, button, summary, dialog, select")) return;
      this.newGame();
    });
  }

  /** Install as an app: the browser's own dialog where there is one, otherwise how to do it on iPhone. */
  async installApp(){
    if(this.install.mode === "prompt"){
      if(await this.install.install()) this.toast.show("Installed — open Pangaea from your home screen.");
    }else if(this.install.mode === "ios") this.toast.show(IOS_STEPS, { ms:6000 });
  }

  async #saveImage(){
    if(!this.board) return;
    const { background } = readBoardPalette();
    try{
      await saveBoardImage(this.dom.board, { background, filename:`pangaea-${this.board.generatorId}-${this.board.seed}.png` });
    }catch(err){
      console.error(err);
      this.dom.note.textContent = "Couldn't save the image on this device.";
    }
  }
}
