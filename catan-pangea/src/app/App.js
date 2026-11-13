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
 */
import { Annealer, AbortError, GENERATORS, randomSeedName, restoreBoard } from "../engine/index.js";
import { Settings } from "./Settings.js";
import { SafeStorage } from "./storage.js";
import { Identity } from "./Identity.js";
import { GameController } from "./GameController.js";
import { Router } from "./Router.js";
import { createStore } from "../sync/createStore.js";
import { SegmentedControl } from "../ui/controls.js";
import { BoardView } from "../ui/BoardView.js";
import { ScoreCard } from "../ui/ScoreCard.js";
import { SettingsPanel } from "../ui/SettingsPanel.js";
import { Sheet } from "../ui/Sheet.js";
import { ThemeController } from "../ui/ThemeController.js";
import { Toast } from "../ui/Toast.js";
import { VictoryOverlay } from "../ui/VictoryOverlay.js";
import { MusicBar } from "../ui/MusicBar.js";
import { JoinScreen } from "../ui/screens/JoinScreen.js";
import { TrackerScreen } from "../ui/screens/TrackerScreen.js";
import { WinsScreen } from "../ui/screens/WinsScreen.js";
import { AdminScreen } from "../ui/screens/AdminScreen.js";
import { readBoardPalette } from "../ui/palette.js";
import { saveBoardImage } from "../ui/imageExport.js";

/** How long to wait for the shared game before showing a local map. */
const CONNECT_TIMEOUT_MS = 6000;

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

    this.toast = new Toast();
    this.identity = new Identity();
    this.game = new GameController({ identity:this.identity, toast:this.toast });

    this.theme = new ThemeController(this.storage);
    this.boardView = new BoardView(this.dom.board);
    this.sheet = new Sheet($("panel"), $("scrim"), { opener:$("settingsBtn"), closer:$("sheetClose") });
    this.scoreCard = new ScoreCard($("scoreCard"), $("scoreChip"), { onChipClick:() => this.sheet.open() });
    this.panel = new SettingsPanel($("settings"), {
      settings:this.settings,
      onChange:patch => this.update(patch),
      onReplaySeed:seed => { this.sheet.close(); this.newGame({ seed }); },
    });
    this.modeSwitch = new SegmentedControl({
      label:"Board type", value:this.settings.mode,
      options:GENERATORS.map(g => ({ value:g.id, label:g.name })),
      onChange:mode => this.#switchMode(mode),
    });
    $("modeSwitch").append(this.modeSwitch.el);

    this.router = new Router({ mapEl:$("app") });
    this.music = new MusicBar({ game:this.game, toast:this.toast, storage:this.storage });
    const deps = {
      game:this.game, router:this.router, toast:this.toast, music:this.music,
      confirm:msg => window.confirm(msg),
      ensureSession:() => this.#ensureSession(),
    };
    this.screens = [new JoinScreen(deps), new TrackerScreen(deps), new WinsScreen(deps), new AdminScreen(deps)];
    for(const s of this.screens) this.router.register(s);
    this.victory = new VictoryOverlay(deps);
    this.game.onChange(state => this.#onGameState(state));

    this.#wire($);
  }

  async start(){
    this.router.start();
    this.dom.note.textContent = "Loading the game…";
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
      this.#render();
      if(this.game.ready) await this.game.publishBoard(board, this.settings.toJSON(), { onlyIfNone:kind === "boot" });
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
    return window.confirm("Start a new game for everyone? Points, knights, cities and karma start over. Everyone keeps their seat and color, and season wins are kept.");
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
      const wasSeated = !!this.seatedIn;
      this.shownSessionId = state.sessionId;
      this.#showSessionBoard(state.session);
      /* a new game with fewer seats left this player out: pick again */
      if(wasSeated && !this.game.mySeat){
        this.toast.show("New game started with fewer seats — pick a color to join.");
        this.router.go("join");
      }
    }
    this.seatedIn = this.game.mySeat ? state.sessionId : null;
    for(const s of this.screens) if(s.visible) s.render(state);
    this.victory.update(state);
  }

  #showSessionBoard(session){
    /* already on screen (we just published it) */
    if(this.board && this.board.seed === session.meta.seed && this.board.generatorId === session.board.generatorId){
      return;
    }
    try{
      const board = restoreBoard(session.board);
      if(this.inflight?.kind === "boot") this.inflight.ctrl.abort();   /* someone else got there first */
      this.board = board;
      if(session.settings) this.update(session.settings);
      this.#render();
    }catch(err){
      console.error(err);
      this.toast.show("Couldn't load the shared map.");
    }
  }

  /* ---------- map view ---------- */

  #render(){
    if(!this.board) return;
    this.boardView.render(this.board, readBoardPalette());
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
    $("trackerBtn").addEventListener("click", () => this.router.go("tracker"));
    this.music.addOpener($("musicBtn"));
    $("themeBtn").addEventListener("click", () => this.theme.toggle());
    this.theme.onChange(() => this.#render());
    $("shareBtn").addEventListener("click", () => this.#saveImage());

    $("aboutBtn").addEventListener("click", () => this.dom.about.showModal());
    this.dom.about.querySelector("[data-close]").addEventListener("click", () => this.dom.about.close());
    this.dom.about.addEventListener("click", e => { if(e.target === this.dom.about) this.dom.about.close(); });

    /* Enter = new map, unless the user is typing, pressing a control, or on another screen */
    document.addEventListener("keydown", e => {
      if(e.key !== "Enter" || e.repeat || this.router.route) return;
      const t = e.target;
      if(t instanceof HTMLElement && t.closest("input, textarea, button, summary, dialog, select")) return;
      this.newGame();
    });
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
