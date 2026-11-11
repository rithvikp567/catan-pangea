/**
 * Application controller. Owns the state (settings + current board),
 * runs generations, and wires the views together. Views never talk to
 * each other or to the engine directly — they report intent to App.
 */
import { Annealer, AbortError, GENERATORS, randomSeedName } from "../engine/index.js";
import { Settings } from "./Settings.js";
import { SafeStorage } from "./storage.js";
import { SegmentedControl } from "../ui/controls.js";
import { BoardView } from "../ui/BoardView.js";
import { ScoreCard } from "../ui/ScoreCard.js";
import { SettingsPanel } from "../ui/SettingsPanel.js";
import { Sheet } from "../ui/Sheet.js";
import { ThemeController } from "../ui/ThemeController.js";
import { readBoardPalette } from "../ui/palette.js";
import { saveBoardImage } from "../ui/imageExport.js";

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
    this.inflight = null;   /* AbortController of the running generation */

    this.theme = new ThemeController(this.storage);
    this.boardView = new BoardView(this.dom.board);
    this.sheet = new Sheet($("panel"), $("scrim"), { opener:$("settingsBtn"), closer:$("sheetClose") });
    this.scoreCard = new ScoreCard($("scoreCard"), $("scoreChip"), { onChipClick:() => this.sheet.open() });
    this.panel = new SettingsPanel($("settings"), {
      settings:this.settings,
      onChange:patch => this.update(patch),
      onReplaySeed:seed => { this.sheet.close(); this.generate(seed); },
    });
    this.modeSwitch = new SegmentedControl({
      label:"Board type", value:this.settings.mode,
      options:GENERATORS.map(g => ({ value:g.id, label:g.name })),
      onChange:mode => { this.update({ mode }); this.generate(); },
    });
    $("modeSwitch").append(this.modeSwitch.el);

    this.#wire($);
  }

  start(){ this.generate(); }

  /** Apply a settings patch, persist it, and reflect it in the views. */
  update(patch){
    this.settings = this.settings.with(patch);
    this.storage.set("settings", this.settings.toJSON());
    this.panel.sync(this.settings);
    this.modeSwitch.set(this.settings.mode);
  }

  /**
   * Generate a board. Every call is a new map — a fresh random seed unless
   * one is given to replay. A newer call cancels an older one still running.
   */
  async generate(seed = randomSeedName()){
    this.inflight?.abort();
    const ctrl = new AbortController();
    this.inflight = ctrl;
    this.#setBusy(true);

    try{
      const board = await this.settings.generator.generate(this.settings.toRequest(seed), {
        annealer:this.annealer, signal:ctrl.signal, onProgress:f => this.#setProgress(f),
      });
      if(ctrl.signal.aborted) return;
      this.board = board;
      this.#render();
    }catch(err){
      if(err instanceof AbortError) return;
      console.error(err);
      this.dom.note.textContent = "Something went wrong generating that map — try again.";
    }finally{
      if(this.inflight === ctrl){ this.inflight = null; this.#setBusy(false); }
    }
  }

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
    if(busy){ this.scoreCard.showPending(); this.#setProgress(0); }
    else this.#setProgress(0);
  }

  #setProgress(fraction){
    this.dom.progress.style.setProperty("--p", String(fraction));
  }

  #wire($){
    this.dom.generate.addEventListener("click", () => this.generate());
    $("themeBtn").addEventListener("click", () => this.theme.toggle());
    this.theme.onChange(() => this.#render());
    $("shareBtn").addEventListener("click", () => this.#saveImage());

    $("aboutBtn").addEventListener("click", () => this.dom.about.showModal());
    this.dom.about.querySelector("[data-close]").addEventListener("click", () => this.dom.about.close());
    this.dom.about.addEventListener("click", e => { if(e.target === this.dom.about) this.dom.about.close(); });

    /* Enter = new map, unless the user is typing or pressing a control */
    document.addEventListener("keydown", e => {
      if(e.key !== "Enter" || e.repeat) return;
      const t = e.target;
      if(t instanceof HTMLElement && t.closest("input, textarea, button, summary, dialog")) return;
      this.generate();
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
