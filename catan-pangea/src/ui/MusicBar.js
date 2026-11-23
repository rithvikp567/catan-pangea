/**
 * The music bar: the table's YouTube / YouTube Music playlist, docked on
 * every screen, so music keeps playing while the map or the tracker is up
 * (and screen mirroring carries the sound to the TV with the picture).
 *
 * ONE shared playback for the whole table (music/playback.js, synced at
 * /v1/playback): every device shows the same song, the same order
 * (shuffled or not), playing or paused and the same time, and every
 * device's buttons — play, pause, previous, next, shuffle, a song in the
 * list, the time slider — change it for everyone. One device plays the
 * sound: the *speaker*, normally the phone cast to the TV. On every other
 * device (a remote) the player shows the song, still, with "On Sam's phone"
 * under it; tap that for "Play here", which moves the sound. The sound
 * stays where it is whatever anyone changes — only Play here moves it
 * (the very first play, with no speaker yet, makes that device the speaker).
 *
 * The speaker follows each shared change it hasn't followed yet (rev) and
 * reports back what its player really does (#tick → sync): buffering or an
 * ad put it behind, someone used the video's own controls, or a phone that
 * needs its first tap on the video never started.
 *
 * YouTube's embed rules shape it (developers.google.com/youtube/terms):
 *   - the player stays visible, at least 200 × 200, and nothing is drawn
 *     over it — so this is a docked bar, never a hidden audio-only player;
 *   - nothing plays while the bar is closed: closing it on the speaker
 *     pauses the music, and a remote's play opens the speaker's bar;
 *   - nor while it's put away (season wins, the sign-in screen, the lobby,
 *     the intro and the welcome): the speaker holds the music, and a remote's play
 *     waits for it to be back instead of calling the player up over them;
 *   - no autoplay: music starts from someone's tap (on phones the very
 *     first play has to be a tap on the YouTube player itself — browsers
 *     only let a video start from a tap inside its own frame), and a
 *     remote's player never plays;
 *   - YouTube's own controls and ads are left alone.
 *
 * Portrait: a bar along the bottom. Phone landscape: a column on the
 * right. Closed, it shrinks to a thin mini bar along the bottom (every
 * device, like a music app's) — the artwork and the song list on the left,
 * the song in the middle (tap: the player; swipe sideways: next / previous;
 * swipe up: the player), previous / play / next on the right. Both slide in
 * when they appear. Open or closed it measures itself into --music-h / --music-w on
 * <html>, and css/music.css moves the map and the screens out of its way.
 * DesktopLayout can dock it elsewhere (setDock): desktop's left column, or
 * the music half of the music & tracker view.
 *
 * It can also be put away for a while (setAway: the season wins screen, the
 * sign-in screen, the lobby — today's games, a new game, picking a color —
 * the intro and the welcome): nothing of it shows, and
 * since a hidden player mustn't play, the device playing the sound pauses
 * it — and plays on when it's back. Or just the mini bar can be hidden for
 * a while (setMiniAway: the victory screen): the open player is untouched.
 *
 * The embedded player only lists a playlist's songs when it opens the
 * playlist, so the shared queue is the list as it was when it was read.
 * It's read again — the same list, a new `setAt` — from **Refresh songs**
 * in the playlist pop-up, once a game night on its own (the first device
 * to open the app once it's REREAD_AFTER_MS old), or by pasting the link
 * again. Meanwhile the old queue keeps playing (#queueReady); a remote
 * with its bar open reads the list at once, and the speaker only while
 * nothing plays (its player is the one the music comes from) — or, when
 * it asked itself, after READ_WAIT_MS if no one else has. The song
 * playing carries on; new videos join the queue.
 */
import { h } from "./dom.js";
import { describePlayerError, parsePlaylist, playlistDue, playlistUrl, thumbnailUrl } from "../music/playlist.js";
import { BEAT_MS, isHeld, livePosition, queueChanges, songCount, speakerOnline, wantsToPlay } from "../music/playback.js";

/* why the speaker holds the music (MusicBar.setAway's reasons): what its line says on the remotes, and the screen it's on */
const HELD_WHY = { wins:"on Season wins", join:"signing in", lobby:"picking a game" };
const HELD_SCREEN = { wins:"has Season wins open", join:"is on the sign-in screen", lobby:"is picking a game" };

const SVG = {
  play:`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.52.85l10.2-6.4a1 1 0 0 0 0-1.7L9.52 4.75A1 1 0 0 0 8 5.6z"/></svg>`,
  pause:`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>`,
  prev:`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5.5" width="2.4" height="13" rx="1"/><path d="M19 6.4v11.2a1 1 0 0 1-1.53.85l-7.87-5.18a1.5 1.5 0 0 1 0-2.54l7.87-5.18A1 1 0 0 1 19 6.4z"/></svg>`,
  next:`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="16.6" y="5.5" width="2.4" height="13" rx="1"/><path d="M5 6.4v11.2a1 1 0 0 0 1.53.85l7.87-5.18a1.5 1.5 0 0 0 0-2.54L6.53 5.55A1 1 0 0 0 5 6.4z"/></svg>`,
  shuffle:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h4v4M4 20 20 4M20 16v4h-4M14.5 14.5 20 20M4 4l5 5"/></svg>`,
  list:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M4 6h12M4 11h12M4 16h7"/><path d="M19 10v8"/><circle cx="17" cy="18" r="2"/></svg>`,
  close:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  link:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.36 0l3-3a4.5 4.5 0 0 0-6.36-6.36l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.36 0l-3 3a4.5 4.5 0 0 0 6.36 6.36l1-1"/></svg>`,
  up:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 14.5l6-6 6 6"/></svg>`,
  note:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/></svg>`,
  speaker:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.3 6.6a7.6 7.6 0 0 1 0 10.8"/></svg>`,
  external:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`,
  refresh:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v4.5H15"/></svg>`,
};

/** YouTube's own sign-in page (Premium removes ads in embeds when the player can see you're signed in). */
const SIGN_IN_URL = "https://accounts.google.com/ServiceLogin?service=youtube&continue=" + encodeURIComponent("https://www.youtube.com/");

const TICK_MS = 500;          /* the time display, and the speaker's checks on its player */
const DRIFT_S = 3;            /* the speaker's song this far off the shared clock: one of them moves */
const SYNC_GAP_MS = 2500;     /* the speaker reports its player at most this often */
const FIRST_TAP_MS = 8000;    /* a speaker that never started (a phone waiting for the first tap on the video): it's paused, say so */
const READ_WAIT_MS = 6000;    /* a new playlist: the speaker lets another device read its songs, so it keeps its player (a phone needs a tap for a new one) */
const REFRESH_TOAST_MS = 120_000;   /* Refresh songs: say what changed if the songs are read within this long */

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
const STATE = () => globalThis.YT.PlayerState;

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

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Where the open bar is a column on the right (a phone on its side) — css/music.css's own query. */
const SIDE_QUERY = "(orientation:landscape) and (max-height:559px)";

/**
 * How far a card docked to an edge of the window reaches in from it: its
 * size plus the gap between it and that edge (css/music.css: --card-gap,
 * or the safe area). Layout sizes and offsets only — never the slide-in's
 * transform — so it's right mid-animation too.
 * @param {HTMLElement} el
 * @param {"bottom"|"right"} edge
 */
function footprint(el, edge){
  const gap = parseFloat(getComputedStyle(el)[edge]) || 0;
  return Math.ceil((edge === "bottom" ? el.offsetHeight : el.offsetWidth) + gap);
}
const SWIPE_PX = 44;          /* a sideways swipe this far on the mini bar's song changes it */

/** "phone", "tablet" or "computer" — for "On Sam's phone". */
const deviceKind = () => matchMedia("(hover: hover) and (pointer: fine)").matches ? "computer"
  : Math.min(screen.width, screen.height) >= 600 ? "tablet" : "phone";

/** 3:07 */
const clock = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

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
    this.kind = deviceKind();
    this.openers = new Set();
    this.toggleListeners = new Set();
    this.listId = null;          /* the table's playlist (GameState.music) … */
    this.setAt = null;           /* … and when it was set: re-pasting the link reads its songs again */
    this.pb = undefined;         /* the shared playback (/v1/playback); null: none yet, undefined: not loaded yet */
    this.player = null;          /* YT.Player once created */
    this.playerReady = null;     /* Promise while it's being created */
    this.ready = false;          /* the player can take commands */
    this.mode = null;            /* "list": reading the playlist's songs; "song": one song, cued or playing */
    this.songId = null;          /* the song in the player */
    this.seenRev = null;         /* the shared change this player last followed */
    this.started = false;        /* has this player played yet? phones need that first tap on the video */
    this.askedAt = 0;            /* when the speaker last asked its player to play */
    this.playTries = 0;          /* a play that lands while a song is still being cued is ignored: ask again once it's cued */
    this.retryAt = 0;
    this.lastCur = 0;            /* the speaker's player time at the last tick … */
    this.adTicks = 0;            /* … running while YouTube says the song hasn't started: an ad */
    this.adUntil = 0;            /* an ad is playing (until about then): judge nothing, move nothing */
    this.settleUntil = 0;        /* the player is still loading / seeking: don't judge it yet */
    this.quietUntil = 0;         /* this player was just paused (it stopped being the speaker): not someone's tap */
    this.claimedAt = 0;          /* this device just took the music: its PLAYING is expected */
    this.closedAt = 0;           /* closed here just now: the speaker's own pause is on its way */
    this.paintKey = "";          /* playing / where, as last painted (they change with time: a speaker can go quiet) */
    this.pausedTicks = 0;
    this.lastSync = 0;
    this.lastBeat = 0;
    this.readKey = null;         /* the playlist whose songs this device is reading */
    this.readNow = null;         /* { listId, since }: this device set (or refreshed) the playlist — it reads it, without waiting for the music to stop */
    this.reading = null;         /* the playlist|setAt this device's player is reading now (it follows no song meanwhile) */
    this.refreshAsk = null;      /* Refresh songs pressed here: { listId, fromSetAt, songs, at } — say what changed once read */
    this.dueChecked = false;     /* the nightly re-read looked at once per page load */
    this.wantPlay = false;       /* play was pressed before the songs were read */
    this.problem = null;         /* [title, line] while YouTube can't play */
    this.now = null;             /* { id, title, author } of the table's song */
    this.errorsInARow = 0;
    this.lastNotice = 0;
    this.wakeLock = null;
    this.renderedIds = "";
    this.seeking = false;        /* the time slider is being dragged */
    this.dock = "bar";           /* "bar" (phones), or desktop's left column: "column" (big player + songs) / "compact" */
    this.away = new Set();       /* why the music is put away for now ("wins", "join", "lobby", "splash", "welcome"); empty: it shows */
    this.awayListeners = new Set();
    this.miniAway = new Set();   /* why the mini bar is hidden for now ("victory"); the open player is left as it is */
    this.miniBlur = new Set();   /* why the mini bar is blurred and out of reach for now ("battle") */
    this.holdKey = null;         /* the hold / unhold last sent (once per shared change) */
    this.swipe = null;           /* the mini bar's song, swiped away: { dir, at } until the next song shows */
    this.miniSongId = null;

    this.#build();
    game.onChange(state => this.#onState(state));
    game.onPlayback(pb => this.#onPlayback(pb));
    const sizes = new ResizeObserver(() => this.#measure());
    sizes.observe(this.el);
    sizes.observe(this.mini);
    addEventListener("resize", () => this.#measure());       /* rotation can move the bar without resizing it */
    document.addEventListener("visibilitychange", () => { this.lastBeat = 0; this.#keepAwake(); });
    setInterval(() => this.#tick(), TICK_MS);
    if(storage.get("musicOpen", false) === true) this.open();
  }

  get isOpen(){ return !this.el.hidden; }
  /** Put away for now (season wins, the sign-in screen, the lobby, the intro, the welcome): nothing of the music shows. */
  get isAway(){ return this.away.size > 0; }
  /** The mini bar is hidden for now (the victory screen) — only the closed bar: the open player still shows. */
  get isMiniAway(){ return this.miniAway.size > 0; }

  /** How much of the window's height the mini bar takes along the bottom — its card and the gap
      under it (0 while the player is open, the music is away, or the mini bar is hidden). */
  get miniHeight(){ return this.isOpen || this.isAway || this.isMiniAway ? 0 : footprint(this.mini, "bottom"); }

  /** A button elsewhere (map toolbar, tracker header) that opens / closes the bar. */
  addOpener(button){
    this.openers.add(button);
    button.addEventListener("click", () => this.toggle());
    this.#paintOpeners();
  }

  toggle(){ this.isOpen ? this.close() : this.open(); }

  /** Called after the bar opens or closes (the desktop layout makes room). */
  onToggle(fn){ this.toggleListeners.add(fn); }
  /** Called when the music is put away or comes back (or the mini bar is hidden or comes back). */
  onAway(fn){ this.awayListeners.add(fn); }

  /**
   * Put the music away for a reason (or bring it back once no reason is
   * left). A hidden player mustn't play (YouTube's rules), so on the device
   * playing the sound the shared playback is *held* (#syncHold): paused for
   * everyone, and a play from another device meanwhile waits instead of
   * calling this player back — the music plays when it's back if it was
   * playing, or if anyone pressed play meanwhile (and not if someone paused
   * it). The sign-in screen ("join") and the lobby ("lobby": today's games,
   * a new game, picking a color) hold it the same way, and the intro
   * ("splash") and the welcome ("welcome") for a moment.
   */
  setAway(reason, on){
    const was = this.isAway;
    if(on) this.away.add(reason); else this.away.delete(reason);
    const now = this.isAway;
    if(now !== was){
      if(now){
        this.#showSongs(false);
        this.#showPop(false);
        if(this.#localActive()){ this.quietUntil = this.#t + 2500; this.player.pauseVideo(); }
      }
      document.body.toggleAttribute("data-music-away", now);   /* css/music.css hides it all */
      this.#syncBody();
      this.#measure();
      for(const fn of this.awayListeners) fn(now);
      if(!now) this.#enter(this.isOpen ? this.el : this.mini);
    }
    this.#refresh();          /* (holds / unholds the shared playback — the reason may have changed too) */
  }

  /**
   * Hide the mini bar for a reason (or bring it back once no reason is
   * left) — the victory screen. Only the mini bar: if the player is open it
   * stays open and playing, and if it opens meanwhile (a play from another
   * device) it shows as usual. The mini bar has no player in it, so nothing
   * needs pausing.
   */
  setMiniAway(reason, on){
    const was = this.isMiniAway;
    if(on) this.miniAway.add(reason); else this.miniAway.delete(reason);
    const now = this.isMiniAway;
    if(now === was) return;
    if(now && !this.isOpen){ this.#showSongs(false); this.#showPop(false); }   /* the sheets opened from the mini bar */
    document.body.toggleAttribute("data-mini-away", now);   /* css/music.css hides the mini bar */
    this.#measure();
    for(const fn of this.awayListeners) fn(this.isAway);
    if(!now && !this.isOpen) this.#enter(this.mini);
  }

  /**
   * Blur the mini bar behind a pop-up for a reason (or bring it back once no
   * reason is left) — a battle. It keeps its place (nothing moves), out of
   * reach until then. Only the mini bar: an open player is never blurred or
   * covered (YouTube's rules), and one that opens meanwhile shows as usual.
   */
  setMiniBlur(reason, on){
    const was = this.miniBlur.size > 0;
    if(on) this.miniBlur.add(reason); else this.miniBlur.delete(reason);
    const now = this.miniBlur.size > 0;
    if(now === was) return;
    if(now && !this.isOpen){ this.#showSongs(false); this.#showPop(false); }   /* the sheets opened from the mini bar */
    this.mini.inert = now;
    document.body.toggleAttribute("data-mini-blur", now);   /* css/music.css blurs the mini bar */
  }

  /**
   * On the speaker: hold the shared playback while the music is put away,
   * and let go once it's back — also after a reload, when this page never
   * put it away itself.
   */
  #syncHold(){
    const n = this.pb?.now, me = this.game.deviceId;
    if(!n || !this.#queueReady) return;
    /* the screen it's on says why (Season wins, signing in, the lobby) — before the intro or the welcome over it */
    const why = !this.isAway ? null : ["wins", "join", "lobby"].find(r => this.away.has(r)) ?? [...this.away][0];
    let command = null;
    if(why && this.#isSpeaker && !(n.held === me && n.heldFor === why)) command = "hold";
    else if(!why && n.held === me) command = "unhold";
    if(!command) return;
    const key = `${command}|${why}|${n.rev}`;
    if(key === this.holdKey) return;           /* sent already; wait for it (or for someone else's change) */
    this.holdKey = key;
    this.#send(command, why ? { why } : undefined);
  }

  /** body[data-music="open"]: the player shows (open, and not away). */
  #syncBody(){
    if(this.isOpen && !this.isAway) document.body.dataset.music = "open";
    else delete document.body.dataset.music;
  }

  /** Slide in (css/music.css, .is-entering — which way depends on where it's docked). */
  #enter(el){
    if(el.hidden || this.isAway || (el === this.mini && this.isMiniAway) || reducedMotion()) return;
    el.classList.remove("is-entering");
    void el.offsetWidth;                     /* restart the animation */
    el.classList.add("is-entering");
    clearTimeout(el._enterTimer);
    el._enterTimer = setTimeout(() => el.classList.remove("is-entering"), 600);
  }

  /**
   * Where the bar lives: "bar" — along the bottom / right side (phones);
   * on desktop, the left column — "compact" (the 200 × 200 player beside
   * its controls; songs in a sheet) or "column" (the same, with the song
   * list under it) — or "wide", the music half of the music & tracker view
   * (a full-width 16:9 player, the controls in a row, then the songs).
   */
  setDock(mode){
    if(mode === this.dock) return;
    this.dock = mode;
    this.el.dataset.dock = mode;
    this.#placeSongs();
    this.listBtn.hidden = this.#songsInside;
    this.#showSongs(false);
    this.#measure();
  }

  /** Does this dock list the songs inside the bar (always shown)? */
  get #songsInside(){ return this.dock === "column" || this.dock === "wide"; }

  /** The column and wide docks list the songs inside the open bar; otherwise (and from the mini bar) it's a sheet of its own. */
  #placeSongs(){
    const inside = this.isOpen && this.#songsInside;
    if(inside){ if(this.songs.parentElement !== this.el) this.el.append(this.songs); }
    else if(this.songs.parentElement !== document.body) document.body.prepend(this.songs);
    this.songs.toggleAttribute("data-mini", !this.isOpen);
  }

  open(){
    const was = this.isOpen;
    this.#showSongs(false);
    this.el.hidden = false;
    this.mini.hidden = true;
    this.#syncBody();
    this.#placeSongs();
    if(!was) this.#enter(this.el);
    this.storage.set("musicOpen", true);
    if(this.problem && !this.#queueReady){ this.problem = null; this.readKey = null; }   /* couldn't read the playlist: try again */
    this.#measure();
    this.#paintOpeners();
    if(this.#songsInside) this.#showSongs(true);
    this.#refresh();
    for(const fn of this.toggleListeners) fn(true);
  }

  /** Close the bar. YouTube doesn't allow playing from a hidden player, so on the speaker the music pauses (for everyone). */
  close(){
    this.closedAt = this.#t;
    if(this.#isSpeaker && this.pb?.now?.playing) this.#send("pause");
    this.player?.pauseVideo?.();
    this.wantPlay = false;
    const was = this.isOpen;
    this.#showSongs(false);
    this.#showPop(false);
    this.el.hidden = true;
    this.mini.hidden = false;
    this.#syncBody();
    this.#placeSongs();
    if(was) this.#enter(this.mini);
    this.storage.set("musicOpen", false);
    this.#measure();
    this.#paintOpeners();
    this.#keepAwake();
    this.#paint();
    for(const fn of this.toggleListeners) fn(false);
  }

  /* ---------------- who plays the sound ---------------- */

  get #t(){ return this.game.now(); }
  /** This device plays the sound. */
  get #isSpeaker(){ return !!this.pb?.now?.speaker && this.pb.now.speaker === this.game.deviceId; }
  /** Another device plays the sound: this one is a remote (even while that one isn't responding — only Play here moves the sound). */
  get #elsewhere(){ return !!this.pb?.now?.speaker && !this.#isSpeaker; }
  /** The speaker hasn't been heard from for a while (closed, locked, offline). */
  get #quiet(){ return this.#elsewhere && !speakerOnline(this.pb, this.#t); }
  /** The table's music is playing somewhere it can be heard — or held with a play waiting (what play / pause shows). */
  get #playing(){ return wantsToPlay(this.pb, this.#t); }
  /** The speaker holds the music: "on Season wins" / "signing in" / "back in a moment". */
  get #heldWhy(){ return !isHeld(this.pb) ? null : HELD_WHY[this.pb.now.heldFor] ?? "back in a moment"; }
  /** The shared playback has this playlist's songs — maybe as last read, while it's being read again (it plays on). */
  get #queueReady(){
    const q = this.pb?.queue;
    return !!this.listId && q?.listId === this.listId && songCount(this.pb) > 0;
  }
  /** … read since the playlist was last set or refreshed. */
  get #queueFresh(){ return this.#queueReady && (this.pb.queue.setAt ?? null) === this.setAt; }
  /** "Sam's phone" */
  #where(){
    const n = this.pb?.now ?? {}, kind = n.speakerKind ?? "device";
    return n.speakerName ? `${n.speakerName}'s ${kind}` : `another ${kind}`;
  }
  #localState(){ return this.ready ? this.player.getPlayerState?.() : null; }
  #localActive(){ const s = this.#localState(); return s != null && (s === STATE().PLAYING || s === STATE().BUFFERING); }

  #send(command, arg){ return this.game.controlMusic(command, arg, { kind:this.kind }); }

  /** A remote's play: on the speaker — or, while the speaker holds the music, as soon as it's back. */
  #remotePlay(arg){
    if(isHeld(this.pb)){
      const where = this.#where(), Where = where[0].toUpperCase() + where.slice(1);
      const screen = HELD_SCREEN[this.pb.now.heldFor];
      this.toast.show(screen
        ? `${Where} ${screen} — the music plays as soon as they leave it. To play it here instead, tap “On ${where}”.`
        : `${Where} will play it in a moment.`, { ms:5000 });
    }
    return this.#send("play", arg);
  }

  /* ---------------- shared state → this device ---------------- */

  #onState(state){
    const m = state?.music ?? null, listId = m?.listId ?? null, setAt = m?.setAt ?? null;
    if(m && !this.dueChecked){
      this.dueChecked = true;
      if(playlistDue(m, this.#t)) this.game.refreshPlaylist({ ifSetAt:m.setAt });   /* once a game night: new videos join */
    }
    if(listId === this.listId && setAt === this.setAt){ this.#paint(); return; }
    this.listId = listId;
    this.setAt = setAt;
    this.renderedIds = "";
    if(!listId) this.player?.stopVideo?.();
    this.#refresh();
  }

  #onPlayback(pb){
    if(pb?.now?.videoId !== this.pb?.now?.videoId) this.problem = null;
    this.pb = pb;
    this.#refreshed();
    this.#refresh();
  }

  /** Refresh songs was pressed here and the list has been read again: say what changed. */
  #refreshed(){
    const ask = this.refreshAsk, q = this.pb?.queue;
    if(!ask) return;
    if(this.#t - ask.at > REFRESH_TOAST_MS || q?.listId !== ask.listId){ this.refreshAsk = null; return; }
    if((q.setAt ?? null) === ask.fromSetAt) return;           /* not read yet */
    this.refreshAsk = null;
    const { added, removed } = queueChanges(ask.songs, q.songs ?? []);
    const n = (k, what) => `${k} ${what}${k === 1 ? "" : "s"}`;
    this.toast.show(added && removed ? `${n(added, "new song")} added, ${n(removed, "song")} gone.`
      : added ? `${n(added, "new song")} added.`
      : removed ? `${n(removed, "song")} no longer in the playlist.`
      : "No new songs.");
  }

  /** Bring this device in line with the shared playback. */
  #refresh(){
    const ready = this.#queueReady;
    if(this.#readAsked && this.#queueFresh) this.readNow = null;   /* what this device asked for has been read */
    this.#syncHold();
    if(this.isAway){ this.#paint(); return; }    /* (held: a play from elsewhere waits — it never calls this player back) */
    if(ready && this.wantPlay){ this.wantPlay = false; this.#elsewhere ? this.#remotePlay() : this.#playHere(); }
    /* someone pressed play and the sound comes from here: the player shows (never from a hidden player) */
    if(ready && this.#isSpeaker && this.pb.now.playing && !this.isOpen && this.#t - this.closedAt > 3000){ this.open(); return; }
    if(this.isOpen && this.listId && this.pb !== undefined){
      if(ready && !this.reading) this.#follow();
      if(!this.#queueFresh) this.#readSongs();
    }
    this.#paint();
  }

  /**
   * The player follows the shared playback. The speaker plays it (seeking
   * when it's more than DRIFT_S off); a remote shows the song, cued and
   * still. Only changes this player hasn't followed yet count — the
   * speaker's own player changes go the other way, in #tick.
   */
  #follow(){
    const now = this.pb.now, t = this.#t;
    if(!this.ready){
      if(!this.playerReady){
        Object.assign(this, { mode:"song", songId:now.videoId, seenRev:null });
        this.#ensurePlayer({ videoId:now.videoId, playerVars:{ start:Math.floor(livePosition(this.pb, t)) } });
      }
      return;
    }
    const loaded = this.mode === "song" && this.songId === now.videoId;
    if(loaded && now.rev === this.seenRev) return;
    this.seenRev = now.rev;
    const p = this.player, pos = livePosition(this.pb, t), active = this.#localActive();

    if(!this.#isSpeaker){
      if(active){ this.quietUntil = t + 2500; p.pauseVideo(); }
      if(!loaded) this.#place("cue", now.videoId, pos);
      return;
    }
    if(!loaded){ this.#place(now.playing ? "load" : "cue", now.videoId, pos); return; }
    const state = this.#localState(), cued = state === STATE().CUED || state === STATE().UNSTARTED;
    const ad = t < this.adUntil;          /* (the time is the ad's then, not the song's) */
    const off = !ad && Math.abs((p.getCurrentTime?.() ?? 0) - pos) > DRIFT_S;
    if(now.playing){
      if(off) p.seekTo(pos, true);
      if(!active && !ad){ p.playVideo(); this.#asked(t); }
      else if(off) this.settleUntil = t + 3000;
    }else{
      if(active || ad) p.pauseVideo();
      if(off) cued ? this.#place("cue", now.videoId, pos) : p.seekTo(pos, true);   /* (seekTo plays a cued video) */
    }
  }

  /** Put a song in the player: "load" plays it, "cue" shows it still. */
  #place(how, videoId, pos){
    this.mode = "song";
    this.songId = videoId;
    const args = { videoId, startSeconds:Math.floor(pos) };
    if(how === "load"){ this.player.loadVideoById(args); this.#asked(this.#t); }
    else this.player.cueVideoById(args);
    this.settleUntil = this.#t + 4000;
  }

  /** The speaker asked its player to play. */
  #asked(t){
    this.askedAt = t;
    this.playTries = 2;
    this.settleUntil = Math.max(this.settleUntil, t + 3000);
    if(!this.started){
      clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => {
        if(!this.started && this.#isSpeaker && this.isOpen) this.toast.show("Tap the video to start — phones need the first tap on the player itself.", { ms:4000 });
      }, 1500);
    }
  }

  /* ---------------- this device's player → shared state ---------------- */

  #onPlayerState(state){
    const S = STATE(), t = this.#t;
    if(state === S.PLAYING){ this.started = true; this.errorsInARow = 0; this.problem = null; this.adUntil = 0; this.adTicks = 0; }   /* (the song itself: any ad is over) */
    if(this.mode === "song" && this.#queueReady){
      /* the speaker asked to play while the song was still being cued: ask again now */
      if(state === S.CUED && this.#isSpeaker && this.pb.now.playing && this.songId === this.pb.now.videoId && this.playTries-- > 0) this.player.playVideo();
      /* someone tapped the video on a remote */
      if(state === S.PLAYING && !this.#isSpeaker && t > this.quietUntil && t - this.claimedAt > 3000){
        if(this.#elsewhere){
          this.quietUntil = t + 2500;
          this.player.pauseVideo();
          if(!this.pb.now.playing) this.#send("play");          /* their tap starts the music — on the speaker */
          const where = this.#where();
          this.toast.show(`The music plays on ${where}. To play it here instead, tap “On ${where}”.`, { ms:4500 });
        }else{
          this.claimedAt = t;
          this.#send("play", { here:true });                     /* no speaker yet: this device is it */
        }
      }
      if(state === S.ENDED && this.#isSpeaker) this.#send("ended", { videoId:this.songId });
    }
    this.#keepAwake();
    this.#paint();
  }

  /**
   * Twice a second: the time display, and on the speaker, its "still here"
   * and a look at what its player is really doing, reported to everyone
   * when it differs from the shared playback.
   */
  #tick(){
    if(this.listId){
      const key = `${this.#playing}|${this.#elsewhere}|${this.#quiet}`;
      if(key !== this.paintKey){ this.paintKey = key; this.#paint(); }   /* e.g. the speaker went quiet: "Play", and no "On Sam's phone" */
      this.#paintTime();
    }
    /* (hidden too: a computer keeps playing in a background tab, and a remote mustn't think it's gone) */
    if(!this.#isSpeaker) return;
    const t = this.#t;
    if(t - this.lastBeat >= BEAT_MS){ this.lastBeat = t; this.game.musicBeat(); }
    if(!this.#queueReady || this.isAway) return;
    if(!this.isOpen){ if(this.pb.now.playing && t - this.closedAt > 3000) this.open(); return; }   /* a play that came in just as it closed */
    if(!this.ready) return;
    const now = this.pb.now;
    const S = STATE(), state = this.player.getPlayerState?.(), cur = this.player.getCurrentTime?.() ?? 0;
    /* an ad (YouTube's, before a song): the player says UNSTARTED / BUFFERING while the time runs —
       the ad's. It works, so it isn't waiting for a tap; until the song starts, judge nothing. A seek
       is a single jump, so it takes the time running steadily over two ticks. */
    const step = cur - this.lastCur;
    this.lastCur = cur;
    this.adTicks = this.mode === "song" && state !== S.PLAYING && state !== S.PAUSED && step > .2 && step < 1.5 ? this.adTicks + 1 : 0;
    if(this.adTicks >= 2){
      const fresh = t >= this.adUntil;
      this.adUntil = t + 2500;
      this.started = true;
      if(fresh){ this.#paint(); this.#keepAwake(); }                      /* "Ad — the song starts after it"; the screen stays on */
    }
    if(t < this.adUntil) return;
    if(now.rev !== this.seenRev || this.mode !== "song" || this.songId !== now.videoId || t < this.settleUntil) return;
    const duration = Math.round(this.player.getDuration?.() ?? 0);
    const report = patch => { if(t - this.lastSync < SYNC_GAP_MS) return; this.lastSync = t; this.#send("sync", { rev:now.rev, ...patch }); };
    this.pausedTicks = state === S.PAUSED ? this.pausedTicks + 1 : 0;
    if(state === S.PLAYING){
      if(!now.playing) report({ playing:true, pos:cur, duration });                                /* played from the video itself */
      else if(Math.abs(cur - livePosition(this.pb, t)) > DRIFT_S) report({ pos:cur, duration });  /* buffering or an ad held it back, or a seek on the video */
      else if(duration && duration !== now.duration) report({ duration });
    }else if(state === S.PAUSED){
      if(now.playing && this.pausedTicks >= 3) report({ playing:false, pos:cur });                /* paused on the video itself (a pause that lasts) */
      else if(!now.playing && Math.abs(cur - (now.pos ?? 0)) > DRIFT_S) report({ pos:cur });      /* moved while paused */
    }else if(now.playing && state !== S.BUFFERING && state !== S.ENDED){       /* asked to play, but cued / unstarted */
      if(!this.started && t - this.askedAt > FIRST_TAP_MS) report({ playing:false });   /* waiting for that first tap on the video: nothing's playing, say so */
      else if(t - this.retryAt > 2500){ this.retryAt = t; this.player.playVideo(); }
    }
  }

  /** Songs a label won't let play outside YouTube are skipped (by the speaker), not fatal. */
  #onPlayerError(code){
    if(this.mode !== "song" || !this.#isSpeaker) return;    /* reading a playlist only needs its list; a remote only shows the song */
    const { skip, message } = describePlayerError(code);
    const count = songCount(this.pb), videoId = this.songId;
    if(skip && count > 1 && ++this.errorsInARow < Math.min(count, 10)){
      if(Date.now() - this.lastNotice > 6000){ this.lastNotice = Date.now(); this.toast.show(message); }
      setTimeout(() => this.#send("ended", { videoId }), 400);
      return;
    }
    this.errorsInARow = 0;
    this.problem = ["Can't play this", message];
    this.#paint();
  }

  /* ---------------- buttons ---------------- */

  #togglePlay(){
    if(this.#playing) return this.#send("pause");
    if(this.#elsewhere) return this.#remotePlay();
    this.#playHere();
  }

  /** The mini bar's play: on a remote it just plays (on the speaker); here it opens the player and plays. */
  #playFromMini(){
    if(this.#playing) return this.#send("pause");
    if(this.#queueReady && this.#elsewhere) return this.#remotePlay();
    this.open();
    this.#playHere();
  }

  /** A song in the list. */
  #pick(index){ this.#elsewhere ? this.#remotePlay({ index }) : this.#playHere({ index }); }

  /** Play, with the sound on this device (it becomes the speaker). */
  #playHere(arg = {}){
    if(!this.isOpen) this.open();
    if(!this.#queueReady){ this.wantPlay = true; return; }       /* once the songs are read */
    const t = this.#t;
    /* inside the tap: a browser that allows it starts the video right away */
    if(arg.index == null && this.ready && this.mode === "song" && this.songId === this.pb.now.videoId){ this.claimedAt = t; this.player.playVideo(); }
    this.#send("play", { ...arg, here:true });
    this.#asked(t);
  }

  /** Play here: the sound moves to this device (playing or paused, as it was). */
  #takeOver(){
    this.#showPop(false);
    if(!this.isOpen) this.open();
    const t = this.#t;
    if(this.pb?.now?.playing){
      if(this.ready && this.mode === "song" && this.songId === this.pb.now.videoId){ this.claimedAt = t; this.player.playVideo(); }
      this.#asked(t);
    }
    this.#send("takeOver");
  }

  /* ---------------- reading a playlist's songs ---------------- */

  /**
   * The table's playlist changed (or this device is the first to open it):
   * a player opened on the playlist lists its songs, and they become the
   * shared queue. Any device with the bar open can do it; the speaker
   * waits a moment for another one, so it keeps its player.
   */
  #readSongs(){
    const key = `${this.listId}|${this.setAt}`;
    if(this.readKey === key || !this.#mayRead) return;
    this.readKey = key;
    clearTimeout(this.readTimer);
    /* the speaker gives a remote the chance first (it keeps its player) — even when it asked, if the old songs are playing */
    const wait = this.#isSpeaker && this.ready && (!this.#readAsked || this.#busy) ? READ_WAIT_MS : 0;
    this.readTimer = setTimeout(() => this.#startReading(key), wait);
  }

  /** This device asked for the reading under way (it pasted the link, or pressed Refresh songs). */
  get #readAsked(){ const r = this.readNow; return !!r && r.listId === this.listId && (this.setAt ?? 0) >= r.since; }
  /** The songs as last read are playing here (the speaker's player is the one the music comes from). */
  get #busy(){ return this.#queueReady && (this.pb.now.playing || this.#localActive()); }

  /**
   * May this device's player read the playlist now? A new player replaces
   * the one the music comes from, so while the songs as last read play on,
   * the speaker leaves it to a remote — unless it asked itself (Refresh
   * songs, the link pasted here) — and reads once the music stops.
   */
  get #mayRead(){ return !this.#isSpeaker || this.#readAsked || !this.#busy; }

  async #startReading(key){
    if(this.readKey !== key || this.#queueFresh) return;         /* another device read them meanwhile */
    if(!this.isOpen || this.isAway || !this.#mayRead){ this.readKey = null; return; }   /* read when it next can */
    this.reading = key;
    /* YouTube's loadPlaylist / cuePlaylist keep the old songs once a player has had a playlist: a fresh player */
    await this.#resetPlayer();
    if(this.readKey !== key || this.#queueFresh){ this.reading = null; this.#refresh(); return; }    /* (a player for the song, then) */
    this.mode = "list";
    const player = await this.#ensurePlayer({ playerVars:{ listType:"playlist", list:this.listId } });
    if(!player || this.readKey !== key){ if(this.reading === key) this.reading = null; return; }
    const since = Date.now();
    clearInterval(this.readPoll);
    const done = () => { clearInterval(this.readPoll); if(this.reading === key) this.reading = null; };
    /* YouTube sends no event when a new player's playlist arrives, so look for it */
    this.readPoll = setInterval(() => {
      if(this.readKey !== key || this.#queueFresh){ done(); this.#refresh(); return; }
      const songs = this.player?.getPlaylist?.() ?? [];
      if(songs.length){
        done();
        this.#send("load", { listId:this.listId, setAt:this.setAt, songs });
      }else if(Date.now() - since > 10000){
        done();
        if(this.#queueReady){                       /* reading it again failed: the songs as last read play on */
          if(this.refreshAsk){ this.refreshAsk = null; this.toast.show("Couldn't read the playlist. Make sure it's still public or unlisted."); }
          this.#refresh();
          return;
        }
        this.problem = ["Couldn't open this playlist", "Make sure it's public or unlisted, or paste another link."];
        this.#paint();
      }
    }, 400);
  }

  /** Refresh songs (the playlist pop-up): the playlist read again, so videos added on YouTube join — here, if this device can. */
  async #refreshSongs(){
    this.#showPop(false);
    if(!this.listId) return;
    const q = this.pb?.queue, same = q?.listId === this.listId;
    this.refreshAsk = { listId:this.listId, fromSetAt:same ? q.setAt ?? null : null, songs:same ? [...(q.songs ?? [])] : [], at:this.#t };
    this.readNow = { listId:this.listId, since:this.#t };   /* this device reads them (its player shows while it does) */
    if(!this.isOpen) this.open();
    this.toast.show("Reading the playlist for new songs…");
    if(!(await this.game.refreshPlaylist())) this.refreshAsk = null;
  }

  /* ---------------- the player ---------------- */

  #ensurePlayer({ videoId = null, playerVars = {} } = {}){
    if(this.playerReady) return this.playerReady;
    this.playerReady = loadYouTubeApi().then(YT => new Promise(resolve => {
      this.player = new YT.Player(this.host, {
        width:"100%", height:"100%",
        ...(videoId ? { videoId } : {}),
        playerVars:{ playsinline:1, rel:0, origin:location.origin, ...playerVars },
        events:{
          onReady:() => { this.ready = true; resolve(this.player); this.#refresh(); },
          onStateChange:e => this.#onPlayerState(e.data),
          onError:e => this.#onPlayerError(e.data),
        },
      });
    })).catch(err => {
      console.error(err);
      this.playerReady = null;
      this.problem = ["YouTube didn't load", "Check the connection, then open music again."];
      this.#paint();
      return null;
    });
    return this.playerReady;
  }

  /** Throw the player away; the next #ensurePlayer() makes a fresh one. */
  async #resetPlayer(){
    await this.playerReady;
    clearInterval(this.readPoll);
    this.player?.destroy?.();
    Object.assign(this, { player:null, playerReady:null, ready:false, mode:null, songId:null, seenRev:null, started:false });
    this.host = h("div");
    this.video.replaceChildren(this.host);
    this.#keepAwake();
  }

  /** Keep the phone awake while music plays here — a locked phone stops it. */
  async #keepAwake(){
    const want = this.isOpen && (this.#localActive() || this.#t < this.adUntil) && document.visibilityState === "visible";
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

  /* ---------------- structure ---------------- */

  #build(){
    /* the player (YT.Player replaces the host div with its iframe) */
    this.host = h("div");
    this.video = h("div", { class:"music-video" }, this.host);

    this.title = h("p", { class:"music-title" });
    this.artist = h("p", { class:"music-artist" });
    /* on a remote: where the sound is — tap it for "Play here" */
    this.whereText = h("span", { class:"where-text" });
    const whereIcon = h("span", { class:"where-icon", "aria-hidden":"true" });
    whereIcon.innerHTML = SVG.speaker;   /* static, trusted markup */
    this.whereBtn = h("button", { type:"button", class:"music-where", hidden:true, onClick:() => this.#showPop(true) }, whereIcon, this.whereText);

    /* the time, the same on every device; drag to move it for everyone */
    this.timeNow = h("span", { class:"music-time" }, "0:00");
    this.timeEnd = h("span", { class:"music-time" }, "–:––");
    this.seek = h("input", {
      type:"range", class:"music-seek", min:"0", max:"1", step:"1", value:"0", "aria-label":"Time in the song",
      onInput:() => { this.seeking = true; this.#paintTime(); },
      onChange:() => { this.seeking = false; this.#send("seek", Number(this.seek.value)); },
      onBlur:() => { this.seeking = false; },
    });
    this.progress = h("div", { class:"music-progress" }, this.timeNow, this.seek, this.timeEnd);

    this.playBtn = iconButton("Play", SVG.play, () => this.#togglePlay(), "music-btn is-play");
    this.prevBtn = iconButton("Previous song", SVG.prev, () => this.#send("skip", -1));
    this.nextBtn = iconButton("Next song", SVG.next, () => this.#send("skip", 1));
    this.shuffleBtn = iconButton("Shuffle", SVG.shuffle, () => this.#send("shuffle", this.pb?.queue?.shuffle !== true));
    this.listBtn = iconButton("Songs", SVG.list, () => this.#showSongs(this.songs.hidden));
    this.popBtn = iconButton("Playlist, where it plays, and the YouTube Music app", SVG.link, () => this.#showPop(this.pop.hidden));
    const closeBtn = iconButton("Close music (pauses it)", SVG.close, () => this.close());

    this.side = h("div", { class:"music-side" },
      h("div", { class:"music-now" }, this.title, this.artist, this.whereBtn),
      this.progress,
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

    /* playlist pop-up: only when its button (or "On Sam's phone") is tapped */
    this.hereText = h("p", { class:"music-hint" });
    this.hereBtn = h("button", { type:"button", class:"btn here-btn", onClick:() => this.#takeOver() });
    this.hereBtn.innerHTML = SVG.speaker;   /* static, trusted markup */
    this.hereBtn.append(`Play here, on this ${this.kind}`);
    this.hereBox = h("div", { class:"pop-here" }, h("p", { class:"pop-title" }, "Where the music plays"), this.hereText, this.hereBtn);
    const changeForm = this.#linkForm("Change");
    this.changeInput = changeForm.input;
    this.refreshBtn = h("button", { type:"button", class:"btn refresh-btn", onClick:() => this.#refreshSongs() });
    this.refreshBtn.innerHTML = SVG.refresh;   /* static, trusted markup */
    this.refreshBtn.append("Refresh songs");
    this.appLink = h("a", { class:"btn music-app-btn", target:"_blank", rel:"noopener",
      /* the app takes over the music: pause and close here so the map gets the screen */
      onClick:() => setTimeout(() => this.close(), 300) });
    this.appLink.innerHTML = SVG.external;
    this.appLink.prepend("Play in the YouTube Music app");
    this.pop = h("section", { class:"music-sheet music-pop", "aria-label":"Playlist", hidden:true },
      h("header", { class:"songs-head" }, h("h2", {}, "Playlist"), iconButton("Close", SVG.close, () => this.#showPop(false), "icon-btn")),
      h("div", { class:"pop-body" },
        this.hereBox,
        this.refreshBtn,
        h("label", { class:"field-label" }, "Change the playlist for everyone"),
        changeForm.form,
        h("div", { class:"pop-premium" },
          h("p", { class:"pop-title" }, "Have YouTube Premium?"),
          this.appLink,
          h("p", { class:"music-hint" },
            "To skip ads in this player instead, ",
            h("a", { href:SIGN_IN_URL, target:"_blank", rel:"noopener" }, "sign in to YouTube"),
            " in this browser. That works on Android; on iPhone, Safari usually hides the sign-in from players on other sites."))));

    /* closed: a thin bar along the bottom — the artwork and the song list on the left, the song in the
       middle (tap or swipe up: the player; swipe sideways: next / previous), ⏮ ▶ ⏭ on the right */
    this.miniArt = h("span", { class:"mini-art", "aria-hidden":"true" });
    this.miniTitle = h("span", { class:"mini-title" });
    this.miniArtist = h("span", { class:"mini-artist" });
    this.miniText = h("span", { class:"mini-text" }, this.miniTitle, this.miniArtist);
    this.miniLine = h("span", { class:"mini-progress", "aria-hidden":"true" });
    this.miniSongs = iconButton("Songs", SVG.list, () => this.#showSongs(this.songs.hidden), "music-btn mini-songs");
    this.miniPrev = iconButton("Previous song", SVG.prev, () => this.#send("skip", -1), "music-btn mini-prev");
    this.miniPlay = iconButton("Play", SVG.play, () => this.#playFromMini(), "music-btn mini-play");
    this.miniNext = iconButton("Next song", SVG.next, () => this.#send("skip", 1), "music-btn mini-next");
    this.miniMain = h("button", { type:"button", class:"mini-main", "aria-label":"Open the music player",
      onClick:e => { if(this.swiped){ e.preventDefault(); return; } this.open(); } },
      h("span", { class:"mini-grip", "aria-hidden":"true" }), this.miniText);
    this.#wireSwipe(this.miniMain);
    this.mini = h("section", { class:"music-mini", "aria-label":"Music" },
      this.miniLine,
      h("div", { class:"mini-side mini-left" }, this.miniArt, this.miniSongs),
      this.miniMain,
      h("div", { class:"mini-side mini-right" }, this.miniPrev, this.miniPlay, this.miniNext));

    this.observer = new IntersectionObserver(entries => {
      for(const e of entries) if(e.isIntersecting){ this.observer.unobserve(e.target); this.#fillSong(e.target); }
    }, { root:this.songList, rootMargin:"200px" });

    document.body.append(this.songs, this.pop, this.el, this.mini);
    this.#paintMini();
  }

  /**
   * The mini bar's song follows a finger: sideways far enough changes the
   * song (left: next, right: previous, like a music app), up opens the
   * player. A swipe isn't also a tap.
   */
  #wireSwipe(zone){
    let g = null;
    const text = this.miniText;
    zone.addEventListener("pointerdown", e => {
      if(e.button) return;
      g = { id:e.pointerId, x:e.clientX, y:e.clientY, dir:null };
      this.swiped = false;
    });
    zone.addEventListener("pointermove", e => {
      if(!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if(!g.dir && Math.hypot(dx, dy) > 8){
        g.dir = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        try{ zone.setPointerCapture(e.pointerId); }catch{}
      }
      if(g.dir === "x" && this.#queueReady){
        text.style.transition = "none";
        text.style.transform = `translateX(${dx * .7}px)`;
        text.style.opacity = String(Math.max(.25, 1 - Math.abs(dx) / 220));
      }
    });
    const end = e => {
      if(!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y, dir = g.dir;
      g = null;
      if(!dir) return;
      this.swiped = true;                       /* the click that follows isn't a tap */
      setTimeout(() => { this.swiped = false; }, 0);
      if(dir === "x" && Math.abs(dx) >= SWIPE_PX && this.#queueReady) this.#swipeSong(dx < 0 ? 1 : -1);
      else if(dir === "y" && dy < -SWIPE_PX / 2){ this.#settleText(); this.open(); }
      else this.#settleText();
    };
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", () => { g = null; this.#settleText(); });
  }

  /** Swiped: the song slides off that way, and the next one slides in from the other side once it shows. */
  #swipeSong(delta){
    const text = this.miniText;
    this.swipe = { dir:delta, at:Date.now() };
    text.style.transition = reducedMotion() ? "none" : "transform .16s ease-in, opacity .16s ease-in";
    text.style.transform = `translateX(${delta < 0 ? 70 : -70}%)`;
    text.style.opacity = "0";
    this.#send("skip", delta);
    clearTimeout(this.swipeTimer);
    this.swipeTimer = setTimeout(() => { if(this.swipe){ this.swipe = null; this.#settleText(); } }, 1500);   /* no new song showed */
  }

  /** The song back in the middle (from a swipe: in from the side it went off on the other side of). */
  #settleText(from = 0){
    const text = this.miniText;
    if(from && !reducedMotion()){
      text.style.transition = "none";
      text.style.transform = `translateX(${from > 0 ? 70 : -70}%)`;
      text.style.opacity = "0";
      void text.offsetWidth;
    }
    text.style.transition = reducedMotion() ? "none" : "transform .24s cubic-bezier(.2,.9,.3,1.15), opacity .2s ease-out";
    text.style.transform = "";
    text.style.opacity = "";
  }

  /** A paste-a-link form (setup and the playlist pop-up each have one). */
  #linkForm(submitLabel){
    const input = h("input", {
      type:"url", inputmode:"url", placeholder:"Paste a playlist link", autocomplete:"off",
      autocapitalize:"off", spellcheck:"false", enterkeyhint:"go", "aria-label":"Playlist link",
    });
    const form = h("form", { class:"seed-row music-link", onSubmit:async e => {
      e.preventDefault();
      const listId = parsePlaylist(input.value).listId;
      this.readNow = listId ? { listId, since:this.#t } : null;   /* this device reads its songs, straight away */
      const id = await this.game.setPlaylist(input.value);
      if(!id) return;                      /* the toast explains what's wrong */
      input.value = "";
      input.blur();
      this.#showPop(false);
      this.toast.show("Playlist saved for everyone.");
    } }, input, h("button", { type:"submit", class:"btn" }, submitLabel));
    return { form, input };
  }

  /* ---------------- paint ---------------- */

  /** Publish how much of the window the bar takes (its card and the gap round it); a column
      (phone landscape) takes width, a bottom bar height. */
  #measure(){
    const root = document.documentElement.style;
    if(this.isAway){                                  /* nothing shows */
      root.setProperty("--music-h", "0px");
      root.setProperty("--music-w", "0px");
      return;
    }
    if(!this.isOpen){                                 /* the mini bar: always along the bottom (unless it's hidden for now) */
      root.setProperty("--music-h", this.isMiniAway ? "0px" : `${footprint(this.mini, "bottom")}px`);
      root.setProperty("--music-w", "0px");
      return;
    }
    /* in desktop's left column the layout makes room itself (DesktopLayout); a column or a bar by
       the CSS's own media query — the card's shape can't tell on a short phone (~280 px tall) */
    const open = this.dock === "bar", side = matchMedia(SIDE_QUERY).matches;
    root.setProperty("--music-h", open && !side ? `${footprint(this.el, "bottom")}px` : "0px");
    root.setProperty("--music-w", open && side ? `${footprint(this.el, "right")}px` : "0px");
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
    this.#paintNow();
    if(setup) return;

    const ready = this.#queueReady, playing = this.#playing, label = playing ? "Pause" : "Play";
    for(const b of [this.playBtn, this.prevBtn, this.nextBtn, this.shuffleBtn]) b.disabled = !ready;
    this.playBtn.innerHTML = playing ? SVG.pause : SVG.play;
    this.playBtn.setAttribute("aria-label", label);
    this.playBtn.title = label;
    this.shuffleBtn.setAttribute("aria-pressed", String(this.pb?.queue?.shuffle === true));
    const elsewhere = ready && this.#elsewhere;
    this.whereBtn.hidden = !elsewhere;
    this.el.toggleAttribute("data-elsewhere", elsewhere);
    if(elsewhere){
      const where = this.#where(), quiet = this.#quiet, held = this.#heldWhy;
      this.whereText.textContent = quiet ? `On ${where} · not responding` : held ? `On ${where} · ${held}` : `On ${where}`;
      this.whereBtn.setAttribute("aria-label", `${quiet ? "Set to play on" : "Playing on"} ${where} — tap to play it here instead`);
    }
    this.#paintHere();
    this.appLink.href = playlistUrl(this.listId);
    this.#paintTime();
    if(!this.songs.hidden) this.#renderSongs();
  }

  /** The table's song: its title and artist (from oEmbed), or what's wrong. */
  #paintNow(){
    if(!this.listId) return this.#setNow("", "");
    if(this.problem) return this.#setNow(...this.problem);
    const ready = this.#queueReady, id = ready ? this.pb.now.videoId : null;
    if(!id) return this.#setNow("Loading playlist…", "");
    if(this.now?.id !== id){
      const fallback = `Song ${(this.pb.now.index ?? 0) + 1}`;
      this.now = { id, title:"", author:"" };
      songInfo(id).then(info => {
        if(this.now?.id !== id) return;
        this.now = { id, title:info?.title ?? fallback, author:info?.author ?? "" };
        this.#paintNow();
      });
    }
    const hint = !this.#isSpeaker ? null
      : this.#t < this.adUntil ? "Ad — the song starts after it"
      : !this.started && this.pb.now.playing ? "Tap the video to start" : null;
    this.#setNow(this.now.title || "…", hint ?? this.now.author);
  }

  #setNow(title, artist){
    this.title.textContent = title;
    this.artist.textContent = artist;
    this.#paintMini();
  }

  #paintMini(){
    const setup = !this.listId, ready = this.#queueReady;
    this.mini.dataset.state = setup ? "setup" : "player";
    for(const b of [this.miniPlay, this.miniNext, this.miniPrev, this.miniSongs]) b.hidden = setup;
    for(const b of [this.miniNext, this.miniPrev]) b.disabled = !ready;
    const song = ready ? this.now : null;
    /* a new song after a swipe slides in from the far side */
    const shownId = song?.title ? song.id : null;
    if(shownId && shownId !== this.miniSongId){
      this.miniSongId = shownId;
      if(this.swipe && Date.now() - this.swipe.at < 4000){ const dir = this.swipe.dir; this.swipe = null; clearTimeout(this.swipeTimer); this.#settleText(dir); }
    }
    const art = song?.id ? thumbnailUrl(song.id) : null;
    if(this.miniArt.dataset.src !== (art ?? "")){
      this.miniArt.dataset.src = art ?? "";
      if(art) this.miniArt.replaceChildren(h("img", { src:art, alt:"", width:44, height:44 }));
      else this.miniArt.innerHTML = SVG.note;   /* static, trusted markup */
    }
    const where = ready && this.#elsewhere ? `On ${this.#where()}${this.#quiet ? " (not responding)" : this.#heldWhy ? ` (${this.#heldWhy})` : ""}` : "";
    this.miniTitle.textContent = setup ? "Music for the table" : song?.title || (ready ? "…" : "Your playlist");
    this.miniArtist.textContent = setup ? "Tap to add a YouTube playlist"
      : [song?.title ? song.author : (ready ? "" : "Tap play to start"), where].filter(Boolean).join(" · ");
    const playing = this.#playing, label = playing ? "Pause" : "Play";
    this.miniPlay.innerHTML = playing ? SVG.pause : SVG.play;
    this.miniPlay.setAttribute("aria-label", label);
    this.miniPlay.title = label;
  }

  /** The time: the slider, the clock either side of it, and the line along the top of the mini bar. */
  #paintTime(){
    const ready = this.#queueReady, now = this.pb?.now;
    const pos = ready ? livePosition(this.pb, this.#t) : 0;
    let dur = ready ? now.duration ?? 0 : 0;
    if(!dur && ready && this.ready && this.mode === "song" && this.songId === now.videoId) dur = Math.round(this.player.getDuration?.() ?? 0);
    const shown = this.seeking ? Number(this.seek.value) : Math.min(pos, dur || pos);
    if(!this.seeking){ this.seek.max = String(dur || 1); this.seek.value = String(dur ? shown : 0); }
    this.seek.disabled = !dur;
    this.seek.style.setProperty("--fill", `${dur ? Math.min(100, shown / dur * 100) : 0}%`);
    this.timeNow.textContent = clock(shown);
    this.timeEnd.textContent = dur ? clock(dur) : "–:––";
    this.miniLine.style.transform = `scaleX(${dur ? Math.min(1, pos / dur) : 0})`;
  }

  /** The playlist pop-up's "Where the music plays". */
  #paintHere(){
    const ready = this.#queueReady, kind = this.kind;
    this.hereBox.hidden = !ready;
    if(!ready) return;
    const elsewhere = this.#elsewhere;
    this.hereBtn.hidden = !elsewhere;
    this.hereText.textContent = !elsewhere
      ? this.#isSpeaker
        ? `On this ${kind}. Everyone's play, skip and time slider control it here; it stays here until someone taps Play here on theirs.`
        : `Nowhere yet. Press play and it plays on this ${kind}; every other device becomes a remote for it.`
      : this.#quiet
        ? `On ${this.#where()}, which isn't responding (closed, locked or offline). It plays there again when it's back — or move the sound to this ${kind}.`
        : HELD_SCREEN[this.pb.now.heldFor] && isHeld(this.pb)
        ? `On ${this.#where()}, which ${HELD_SCREEN[this.pb.now.heldFor]}, so the music waits — it plays there as soon as they leave it if someone pressed play. Or move the sound to this ${kind}.`
        : `On ${this.#where()}. Every phone's buttons control it there, and it stays there — or move the sound to this ${kind}.`;
  }

  /* ---------------- songs sheet ---------------- */

  #showSongs(show){
    if(this.isOpen && this.#songsInside) show = true;   /* these docks always have room for the list */
    if(this.isAway) show = false;
    if(show) this.#showPop(false);
    const appearing = show && this.songs.hidden;
    this.songs.hidden = !show;
    if(appearing && !(this.isOpen && this.#songsInside)) this.#enter(this.songs);
    this.listBtn.setAttribute("aria-pressed", String(show));
    this.miniSongs?.setAttribute("aria-pressed", String(show && !this.isOpen));
    if(show) this.#renderSongs();
  }

  #showPop(show){
    if(show) this.#showSongs(false);
    if(this.isAway) show = false;
    if(show && this.pop.hidden){ this.pop.hidden = false; this.#enter(this.pop); }
    this.pop.hidden = !show;
    this.popBtn.setAttribute("aria-pressed", String(show));
    if(show) this.#paintHere();
  }

  /** The songs in play order (shuffled or not — the same on every device); tap one to play it. */
  #renderSongs(){
    const ready = this.#queueReady;
    const ids = ready ? this.pb.queue.order : [];
    const current = ready ? this.pb.now.index : -1;
    const key = ids.join(",");
    if(key !== this.renderedIds){
      this.renderedIds = key;
      this.observer.disconnect();
      this.songList.replaceChildren(...ids.map((id, i) => {
        const row = h("button", { type:"button", class:"song", role:"listitem", "data-id":id, onClick:() => this.#pick(i) },
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
