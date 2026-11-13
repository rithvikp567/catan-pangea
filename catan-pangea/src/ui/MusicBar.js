/**
 * The music bar: the table's YouTube / YouTube Music playlist, docked on
 * every screen, so music keeps playing while the map or the tracker is up
 * (and screen mirroring carries the sound to the TV with the picture).
 *
 * YouTube's embed rules shape it (developers.google.com/youtube/terms):
 *   - the player stays visible, at least 200 × 200, and nothing is drawn
 *     over it — so this is a docked bar, never a hidden audio-only player;
 *   - nothing plays while the bar is closed: closing pauses;
 *   - no autoplay: music starts when someone taps play (on phones the
 *     very first play has to be a tap on the YouTube player itself —
 *     browsers only let a video start from a tap inside its own frame);
 *   - YouTube's own controls and ads are left alone.
 *
 * Portrait: a bar along the bottom. Phone landscape: a column on the
 * right. While open it measures itself into --music-h / --music-w on
 * <html>, and css/music.css moves the map and the screens out of its way.
 * The playlist link is shared (GameState.music); playback is per phone —
 * only the phone that's casting needs to play.
 */
import { h } from "./dom.js";
import { describePlayerError, playlistUrl, thumbnailUrl } from "../music/playlist.js";

const SVG = {
  play:`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.52.85l10.2-6.4a1 1 0 0 0 0-1.7L9.52 4.75A1 1 0 0 0 8 5.6z"/></svg>`,
  pause:`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>`,
  prev:`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5.5" width="2.4" height="13" rx="1"/><path d="M19 6.4v11.2a1 1 0 0 1-1.53.85l-7.87-5.18a1.5 1.5 0 0 1 0-2.54l7.87-5.18A1 1 0 0 1 19 6.4z"/></svg>`,
  next:`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="16.6" y="5.5" width="2.4" height="13" rx="1"/><path d="M5 6.4v11.2a1 1 0 0 0 1.53.85l7.87-5.18a1.5 1.5 0 0 0 0-2.54L6.53 5.55A1 1 0 0 0 5 6.4z"/></svg>`,
  shuffle:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h4v4M4 20 20 4M20 16v4h-4M14.5 14.5 20 20M4 4l5 5"/></svg>`,
  list:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M4 6h12M4 11h12M4 16h7"/><path d="M19 10v8"/><circle cx="17" cy="18" r="2"/></svg>`,
  close:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  link:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.36 0l3-3a4.5 4.5 0 0 0-6.36-6.36l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.36 0l-3 3a4.5 4.5 0 0 0 6.36 6.36l1-1"/></svg>`,
  external:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`,
};

/** YouTube's own sign-in page (Premium removes ads in embeds when the player can see you're signed in). */
const SIGN_IN_URL = "https://accounts.google.com/ServiceLogin?service=youtube&continue=" + encodeURIComponent("https://www.youtube.com/");

/** Load YouTube's IFrame Player API once. */
let apiPromise = null;
function loadYouTubeApi(){
  if(globalThis.YT?.Player) return Promise.resolve(globalThis.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const previous = globalThis.onYouTubeIframeAPIReady;
    globalThis.onYouTubeIframeAPIReady = () => { previous?.(); resolve(globalThis.YT); };
    const script = h("script", { src:"https://www.youtube.com/iframe_api", async:true });
    script.addEventListener("error", () => { apiPromise = null; script.remove(); reject(new Error("YouTube didn't load")); });
    document.head.append(script);
  });
  return apiPromise;
}

/** Song titles from YouTube's oEmbed endpoint (no API key), cached per video. */
const titles = new Map();
function songInfo(videoId){
  if(!titles.has(videoId)){
    const url = "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + videoId);
    titles.set(videoId, fetch(url).then(r => r.ok ? r.json() : null)
      .then(j => j ? { title:j.title, author:j.author_name } : null).catch(() => null));
  }
  return titles.get(videoId);
}

const iconButton = (label, svg, onClick, cls = "music-btn") => {
  const b = h("button", { type:"button", class:cls, "aria-label":label, title:label, onClick });
  b.innerHTML = svg;   /* static, trusted markup */
  return b;
};

export class MusicBar {
  /**
   * @param {object} p
   * @param {import("../app/GameController.js").GameController} p.game
   * @param {{ show:(msg:string) => void }} p.toast
   * @param {import("../app/storage.js").SafeStorage} p.storage  per-device preferences
   */
  constructor({ game, toast, storage }){
    Object.assign(this, { game, toast, storage });
    this.openers = new Set();
    this.player = null;          /* YT.Player once created */
    this.playerReady = null;     /* Promise while it's being created */
    this.listId = null;          /* the playlist loaded in the player */
    this.pendingListId = null;   /* someone changed it while this phone was playing */
    this.playing = false;
    this.started = false;        /* has anything played yet? phones need that first tap on the video */
    this.shuffle = storage.get("musicShuffle", false) === true;
    this.errorsInARow = 0;
    this.lastNotice = 0;
    this.wakeLock = null;
    this.renderedIds = "";

    this.#build();
    game.onChange(state => this.#onState(state));
    new ResizeObserver(() => this.#measure()).observe(this.el);
    addEventListener("resize", () => this.#measure());       /* rotation can move the bar without resizing it */
    document.addEventListener("visibilitychange", () => this.#keepAwake());
    if(storage.get("musicOpen", false) === true) this.open();
  }

  get isOpen(){ return !this.el.hidden; }

  /** A button elsewhere (map toolbar, tracker header) that opens / closes the bar. */
  addOpener(button){
    this.openers.add(button);
    button.addEventListener("click", () => this.toggle());
    this.#paintOpeners();
  }

  toggle(){ this.isOpen ? this.close() : this.open(); }

  open(){
    this.el.hidden = false;
    document.body.dataset.music = "open";
    this.storage.set("musicOpen", true);
    this.#measure();
    this.#paintOpeners();
    this.#paint();
    if(this.listId) this.#ensurePlayer();
  }

  /** Close the bar. Music pauses: YouTube doesn't allow playing from a hidden player. */
  close(){
    this.player?.pauseVideo?.();
    this.playing = false;
    this.#showSongs(false);
    this.#showPop(false);
    this.el.hidden = true;
    delete document.body.dataset.music;
    this.storage.set("musicOpen", false);
    this.#measure();
    this.#paintOpeners();
    this.#keepAwake();
  }

  /* ---------------- structure ---------------- */

  #build(){
    /* the player (YT.Player replaces the host div with its iframe) */
    this.host = h("div");
    this.video = h("div", { class:"music-video" }, this.host);

    this.title = h("p", { class:"music-title" });
    this.artist = h("p", { class:"music-artist" });
    this.notice = h("button", { type:"button", class:"music-notice", hidden:true, onClick:() => this.#switchTo(this.pendingListId, { play:true }) },
      "New playlist — tap to switch");
    this.playBtn = iconButton("Play", SVG.play, () => this.#togglePlay(), "music-btn is-play");
    this.prevBtn = iconButton("Previous song", SVG.prev, () => this.player?.previousVideo());
    this.nextBtn = iconButton("Next song", SVG.next, () => this.player?.nextVideo());
    this.shuffleBtn = iconButton("Shuffle", SVG.shuffle, () => this.#toggleShuffle());
    this.listBtn = iconButton("Songs", SVG.list, () => this.#showSongs(this.songs.hidden));
    this.popBtn = iconButton("Playlist link and YouTube Music app", SVG.link, () => this.#showPop(this.pop.hidden));
    const closeBtn = iconButton("Close music (pauses it)", SVG.close, () => this.close());

    this.side = h("div", { class:"music-side" },
      h("div", { class:"music-now" }, this.title, this.artist, this.notice),
      h("div", { class:"music-controls" }, this.prevBtn, this.playBtn, this.nextBtn),
      h("div", { class:"music-extras" }, this.shuffleBtn, this.listBtn, this.popBtn, closeBtn));

    /* first run: no playlist yet */
    const setupForm = this.#linkForm("Add playlist");
    this.setup = h("div", { class:"music-setup" },
      h("div", { class:"music-setup-head" },
        h("p", { class:"music-title" }, "Music for the table"),
        iconButton("Close music", SVG.close, () => this.close())),
      setupForm.form,
      h("p", { class:"music-hint" }, "A YouTube or YouTube Music playlist that's public or unlisted. Saved for everyone."));
    this.setupInput = setupForm.input;

    this.el = h("section", { class:"music", "aria-label":"Music", hidden:true }, this.video, this.side, this.setup);

    /* sheets sit above the bar (beside it in landscape), never over the player; one at a time */
    this.songList = h("div", { class:"songs-list", role:"list" });
    this.songs = h("section", { class:"music-sheet music-songs", "aria-label":"Songs", hidden:true },
      h("header", { class:"songs-head" }, h("h2", {}, "Songs"), iconButton("Close songs", SVG.close, () => this.#showSongs(false), "icon-btn")),
      this.songList);

    /* playlist pop-up: only when its button is tapped */
    const changeForm = this.#linkForm("Change");
    this.changeInput = changeForm.input;
    this.appLink = h("a", { class:"btn music-app-btn", target:"_blank", rel:"noopener",
      /* the app takes over the music: pause and close here so the map gets the screen */
      onClick:() => setTimeout(() => this.close(), 300) });
    this.appLink.innerHTML = SVG.external;
    this.appLink.prepend("Play in the YouTube Music app");
    this.pop = h("section", { class:"music-sheet music-pop", "aria-label":"Playlist", hidden:true },
      h("header", { class:"songs-head" }, h("h2", {}, "Playlist"), iconButton("Close", SVG.close, () => this.#showPop(false), "icon-btn")),
      h("div", { class:"pop-body" },
        h("label", { class:"field-label" }, "Change the playlist for everyone"),
        changeForm.form,
        h("div", { class:"pop-premium" },
          h("p", { class:"pop-title" }, "Have YouTube Premium?"),
          this.appLink,
          h("p", { class:"music-hint" },
            "Premium keeps the app playing in the background with no ads, so this bar closes and the map gets the whole screen. Screen mirroring still sends the music to the TV."),
          h("p", { class:"music-hint" },
            "To skip ads in this player instead, ",
            h("a", { href:SIGN_IN_URL, target:"_blank", rel:"noopener" }, "sign in to YouTube"),
            " in this browser. That works on Android; on iPhone, Safari usually hides the sign-in from players on other sites."))));

    this.observer = new IntersectionObserver(entries => {
      for(const e of entries) if(e.isIntersecting){ this.observer.unobserve(e.target); this.#fillSong(e.target); }
    }, { root:this.songList, rootMargin:"200px" });

    document.body.append(this.songs, this.pop, this.el);
  }

  /** A paste-a-link form (setup and the songs sheet each have one). */
  #linkForm(submitLabel){
    const input = h("input", {
      type:"url", inputmode:"url", placeholder:"Paste a playlist link", autocomplete:"off",
      autocapitalize:"off", spellcheck:"false", enterkeyhint:"go", "aria-label":"Playlist link",
    });
    const form = h("form", { class:"seed-row music-link", onSubmit:async e => {
      e.preventDefault();
      const id = await this.game.setPlaylist(input.value);
      if(!id) return;                      /* the toast explains what's wrong */
      input.value = "";
      input.blur();
      this.#showPop(false);
      this.#switchTo(id, { play:this.playing });
      this.toast.show("Playlist saved for everyone.");
    } }, input, h("button", { type:"submit", class:"btn" }, submitLabel));
    return { form, input };
  }

  /* ---------------- player ---------------- */

  #ensurePlayer(){
    if(this.playerReady) return this.playerReady;
    this.title.textContent = "Loading playlist…";
    this.playerReady = loadYouTubeApi().then(YT => new Promise(resolve => {
      this.player = new YT.Player(this.host, {
        width:"100%", height:"100%",
        playerVars:{ listType:"playlist", list:this.listId, playsinline:1, rel:0, origin:location.origin },
        events:{
          onReady:() => { this.player.setLoop(true); resolve(this.player); this.#paint(); this.#checkLoaded(); },
          onStateChange:e => this.#onPlayerState(e.data),
          onError:e => this.#onPlayerError(e.data),
        },
      });
    })).catch(err => {
      console.error(err);
      this.playerReady = null;
      this.#setNow("YouTube didn't load", "Check the connection, then open music again.");
    });
    return this.playerReady;
  }

  /** If a playlist never shows up (private, deleted, typo), say so. */
  #checkLoaded(){
    clearTimeout(this.loadTimer);
    this.loadTimer = setTimeout(() => {
      if(!(this.player?.getPlaylist?.() ?? []).length){
        this.#setNow("Couldn't open this playlist", "Make sure it's public or unlisted, or paste another link.");
      }
    }, 8000);
  }

  /** Load another playlist; keep playing if it was. */
  async #switchTo(listId, { play = false } = {}){
    if(!listId) return;
    if(listId === this.listId){ this.pendingListId = null; this.#paint(); return; }
    this.pendingListId = null;
    this.listId = listId;
    this.renderedIds = "";
    if(this.player){
      /* YouTube's loadPlaylist / cuePlaylist keep the old songs once a playlist is
         loaded (only the link changes), so start a fresh player for the new one */
      await this.playerReady;
      if(this.listId !== listId) return;     /* switched again meanwhile */
      this.player?.destroy?.();
      Object.assign(this, { player:null, playerReady:null, playing:false, started:false, shuffleApplied:false });
      this.host = h("div");
      this.video.replaceChildren(this.host);
      this.#keepAwake();
    }
    this.#paint();
    if(!this.isOpen) return;
    const player = await this.#ensurePlayer();
    if(play && player && this.listId === listId) player.playVideo();   /* phones may still need a tap on the video */
  }

  #togglePlay(){
    if(!this.player) return;
    if(this.playing){ this.player.pauseVideo(); return; }
    this.player.playVideo();
    /* a phone that hasn't played yet ignores this — point at the video */
    if(!this.started) setTimeout(() => {
      if(!this.started) this.toast.show("Tap the video to start — phones need the first tap on the player itself.", { ms:4000 });
    }, 1500);
  }

  #toggleShuffle(){
    this.shuffle = !this.shuffle;
    this.storage.set("musicShuffle", this.shuffle);
    this.player?.setShuffle?.(this.shuffle);
    this.renderedIds = "";
    this.#paint();
    if(!this.songs.hidden) this.#renderSongs();
  }

  #onPlayerState(state){
    const S = globalThis.YT.PlayerState;
    this.playing = state === S.PLAYING || state === S.BUFFERING;
    if(state === S.PLAYING){ this.errorsInARow = 0; this.started = true; }
    if((state === S.CUED || state === S.PLAYING) && !this.shuffleApplied){
      this.shuffleApplied = true;
      if(this.shuffle) this.player.setShuffle(true);
    }
    this.#keepAwake();
    this.#paint();
    if(!this.songs.hidden) this.#renderSongs();
  }

  /** Songs a label won't let play outside YouTube are skipped, not fatal. */
  #onPlayerError(code){
    const { skip, message } = describePlayerError(code);
    const count = (this.player?.getPlaylist?.() ?? []).length;
    if(skip && count > 1 && ++this.errorsInARow < Math.min(count, 10)){
      if(Date.now() - this.lastNotice > 6000){ this.lastNotice = Date.now(); this.toast.show(message); }
      setTimeout(() => this.player?.nextVideo(), 400);
      return;
    }
    this.errorsInARow = 0;
    this.#setNow("Can't play this", message);
  }

  /** Keep the phone awake while music plays — a locked phone stops it. */
  async #keepAwake(){
    const want = this.playing && this.isOpen && document.visibilityState === "visible";
    try{
      if(want && !this.wakeLock && navigator.wakeLock){
        this.wakeLock = await navigator.wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => { this.wakeLock = null; });
      }else if(!want && this.wakeLock){
        await this.wakeLock.release();
        this.wakeLock = null;
      }
    }catch{ this.wakeLock = null; }
  }

  /* ---------------- shared state ---------------- */

  #onState(state){
    const id = state?.music?.listId ?? null;
    if(id === this.listId || id === this.pendingListId){ this.#paint(); return; }
    if(!id){ this.player?.stopVideo?.(); this.listId = null; this.#paint(); return; }
    /* someone else changed the playlist: don't cut off the song playing here */
    if(this.playing){ this.pendingListId = id; this.#paint(); return; }
    this.#switchTo(id);
  }

  /* ---------------- paint ---------------- */

  /** Publish the bar's size; a column (taller than wide) takes width, a bottom bar height. */
  #measure(){
    const root = document.documentElement.style;
    const open = this.isOpen, w = this.el.offsetWidth, ht = this.el.offsetHeight, side = ht > w;
    root.setProperty("--music-h", open && !side ? `${ht}px` : "0px");
    root.setProperty("--music-w", open && side ? `${w}px` : "0px");
  }

  #paintOpeners(){
    for(const b of this.openers){
      b.setAttribute("aria-pressed", String(this.isOpen));
      b.setAttribute("aria-label", this.isOpen ? "Close music" : "Music");
      b.title = this.isOpen ? "Close music" : "Music";
    }
  }

  #paint(){
    const setup = !this.listId;
    this.el.dataset.state = setup ? "setup" : "player";
    this.video.hidden = setup;
    this.side.hidden = setup;
    this.setup.hidden = !setup;
    if(setup) return;

    const ready = !!this.player?.getPlaylist;
    for(const b of [this.playBtn, this.prevBtn, this.nextBtn, this.shuffleBtn]) b.disabled = !ready;
    this.playBtn.innerHTML = this.playing ? SVG.pause : SVG.play;
    this.playBtn.setAttribute("aria-label", this.playing ? "Pause" : "Play");
    this.playBtn.title = this.playing ? "Pause" : "Play";
    this.shuffleBtn.setAttribute("aria-pressed", String(this.shuffle));
    this.notice.hidden = !this.pendingListId;
    this.appLink.href = playlistUrl(this.listId);
    if(ready) this.#paintNow();
  }

  async #paintNow(){
    const data = this.player.getVideoData?.() ?? {};
    const id = data.video_id || (this.player.getPlaylist?.() ?? [])[this.player.getPlaylistIndex?.()];
    const hint = this.started ? null : "Tap the video to start";
    if(!id){ this.#setNow("Ready to play", hint ?? ""); return; }
    if(data.title) this.#setNow(data.title, hint ?? data.author ?? "");
    const info = await songInfo(id);
    if(info && this.#currentId() === id) this.#setNow(info.title, (this.started ? null : hint) ?? info.author);
  }

  #currentId(){
    return this.player?.getVideoData?.()?.video_id || (this.player?.getPlaylist?.() ?? [])[this.player?.getPlaylistIndex?.()];
  }

  #setNow(title, artist){
    this.title.textContent = title;
    this.artist.textContent = artist;
  }

  /* ---------------- songs sheet ---------------- */

  #showSongs(show){
    if(show) this.#showPop(false);
    this.songs.hidden = !show;
    this.listBtn.setAttribute("aria-pressed", String(show));
    if(show) this.#renderSongs();
  }

  #showPop(show){
    if(show) this.#showSongs(false);
    this.pop.hidden = !show;
    this.popBtn.setAttribute("aria-pressed", String(show));
  }

  #renderSongs(){
    const ids = this.player?.getPlaylist?.() ?? [];
    const current = this.player?.getPlaylistIndex?.() ?? -1;
    const key = ids.join(",");
    if(key !== this.renderedIds){
      this.renderedIds = key;
      this.observer.disconnect();
      this.songList.replaceChildren(...ids.map((id, i) => {
        const row = h("button", { type:"button", class:"song", role:"listitem", "data-id":id, onClick:() => this.player.playVideoAt(i) },
          h("img", { src:thumbnailUrl(id), alt:"", width:64, height:36, loading:"lazy" }),
          h("span", { class:"song-text" }, h("span", { class:"song-title" }, "…"), h("small", {})));
        this.observer.observe(row);
        return row;
      }));
      if(!ids.length) this.songList.append(h("p", { class:"empty" }, "Songs show here once the playlist has loaded."));
    }
    [...this.songList.children].forEach((row, i) => row.setAttribute?.("aria-current", String(i === current)));
  }

  async #fillSong(row){
    const info = await songInfo(row.dataset.id);
    row.querySelector(".song-title").textContent = info?.title ?? "Unavailable song";
    row.querySelector("small").textContent = info?.author ?? "";
  }
}
