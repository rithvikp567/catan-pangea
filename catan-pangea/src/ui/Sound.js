/**
 * Little sound effects, made on the spot with the Web Audio API — no audio
 * files: a wooden clack as each tile lands, a flick as a number token turns
 * over and a pop as it lands, a lighter pop for each port, and a short
 * 8-bit fanfare for the welcome.
 *
 * Browsers only let a page make sound after a tap, so the audio starts on
 * the first tap or key press anywhere. It can stop again behind the page's
 * back — on an iPhone a dialog (New map's "start over?"), a call, locking
 * the phone or another app's sound leaves it *suspended* or *interrupted* —
 * so every tap (and coming back to the page) starts it again if it isn't
 * running. Until it runs, nothing plays; nothing ever throws.
 *
 * `play(cues, start)` plays a timeline lined up with an animation that
 * starts at `start` (a performance.now() time, possibly already past — a
 * device that heard about a new map late joins in where it's got to, and
 * skips what's gone by), and returns a function that stops what hasn't
 * played yet. Muted (`setMuted` — Player Settings → Sound effects, each
 * person's own: App) it's all silent.
 */
const START_TIMEOUT_MS = 600;   /* how long a timeline waits for the audio to start (after that it's skipped) */
const VOLUME = 0.5;

const AC = () => globalThis.AudioContext ?? globalThis.webkitAudioContext;
const wait = ms => new Promise(r => setTimeout(r, ms));

export class Sound {
  constructor(){
    this.muted = false;
    this.ctx = null;
    this.out = null;
    this.noiseBuf = null;
    this.unlocked = false;
    this.listeners = new Set();
    const wake = () => this.wake();
    for(const ev of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) addEventListener(ev, wake, { capture:true, passive:true });
    document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") this.#resume(); });
  }

  /** Is the audio running (whether or not it's muted)? */
  get running(){ return this.ctx?.state === "running"; }

  /** Mute / unmute every sound effect on this device (not the music). */
  setMuted(on){
    if(this.muted === !!on) return;
    this.muted = !!on;
    if(this.out && this.ctx){
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setTargetAtTime(this.muted ? 0 : VOLUME, t, 0.015);
    }
    for(const fn of this.listeners) fn(this.muted);
  }

  /** @param {(muted:boolean) => void} fn */
  onMuted(fn){ this.listeners.add(fn); }

  /**
   * Start (or restart) the audio. Runs on every tap; call it again inside a
   * tap handler after anything that may have stopped it (a confirm()).
   */
  wake(){
    const Ctor = AC();
    if(!Ctor) return;
    try{
      if(!this.ctx || this.ctx.state === "closed") this.#create(Ctor);
      if(this.ctx.state !== "running") this.ctx.resume().catch(() => {});
      if(!this.unlocked){
        /* older iPhones only open the audio for a sound started inside the tap: a silent one */
        const src = this.ctx.createBufferSource();
        src.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
        src.connect(this.ctx.destination);
        src.start(0);
        this.unlocked = true;
      }
    }catch{ this.ctx = null; }
  }

  #create(Ctor){
    this.ctx = new Ctor();
    this.out = this.ctx.createGain();
    this.out.gain.value = this.muted ? 0 : VOLUME;
    this.out.connect(this.ctx.destination);
    this.noiseBuf = null;
    this.unlocked = false;
  }

  /**
   * Try to get the audio running without a tap (allowed once the page has
   * had one, in most browsers). Resolves either way, within a moment.
   */
  async #resume(){
    const Ctor = AC();
    if(!Ctor) return;
    try{
      if(!this.ctx || this.ctx.state === "closed"){
        if(!navigator.userActivation?.hasBeenActive) return;   /* no tap yet: it can't start */
        this.#create(Ctor);
      }
      if(this.ctx.state !== "running") await Promise.race([this.ctx.resume(), wait(START_TIMEOUT_MS)]);
    }catch{ /* stays silent */ }
  }

  /**
   * Play a timeline of cues lined up with something that starts at `start`.
   * @param {{ at:number, kind:"tile"|"flip"|"pop"|"port", pitch?:number }[]} cues   `at`: ms after `start`
   * @param {number} [start]  a performance.now() time (may be in the past)
   * @returns {() => void}  stops whatever hasn't played yet
   */
  play(cues, start = performance.now()){
    let bus = null, stopped = false;
    const go = () => {
      if(stopped || !this.running) return;
      const ctx = this.ctx, now = ctx.currentTime;
      bus = ctx.createGain();
      bus.connect(this.out);
      const base = now + (start - performance.now()) / 1000;
      for(const c of cues){
        const t = base + c.at / 1000;
        if(t < now - 0.04) continue;                     /* gone by already */
        this.#voice(c.kind, Math.max(t, now), c.pitch ?? 1, bus);
      }
    };
    if(this.running) go();
    else this.#resume().then(go);
    return () => {
      stopped = true;
      try{ bus?.disconnect(); }catch{ /* already */ }
    };
  }

  /** One pop now — what you hear when you turn the sound effects back on. */
  preview(){ this.play([{ at:0, kind:"pop", pitch:1.1 }]); }

  /** The welcome: four rising square-wave notes, the last one held. */
  fanfare(){
    const go = () => {
      if(!this.running) return;
      const t = this.ctx.currentTime + 0.02;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        this.#tone(t + i * 0.11, this.out, { from:f, len:i === 3 ? 0.42 : 0.12, peak:0.09, type:"square" }));
    };
    if(this.running) go();
    else this.#resume().then(go);
  }

  #voice(kind, t, pitch, dest){
    switch(kind){
      case "tile":    /* a tile landing: a wooden clack over a low thump (pitch ~0.8–1.2 for variety) */
        this.#burst(t, dest, { freq:1500 * pitch, q:1.4, peak:0.45, len:0.06 });
        this.#tone(t, dest, { from:190 * pitch, to:70 * pitch, len:0.11, peak:0.32 });
        break;
      case "flip":    /* a number token turning over: a tiny flick */
        this.#burst(t, dest, { freq:5200, q:0.8, type:"highpass", peak:0.14, len:0.03 });
        break;
      case "pop":     /* a number token landing face up: a round pop */
        this.#tone(t, dest, { from:320 * pitch, to:880 * pitch, len:0.09, peak:0.36 });
        this.#tone(t, dest, { from:640 * pitch, to:1500 * pitch, len:0.05, peak:0.08, type:"triangle" });
        break;
      case "port":    /* a port appearing: a lighter, higher pop */
        this.#tone(t, dest, { from:620 * pitch, to:1250 * pitch, len:0.07, peak:0.18 });
        break;
    }
  }

  /** One second of white noise, made once. */
  #noise(){
    if(!this.noiseBuf){
      const n = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, n, n), d = buf.getChannelData(0);
      for(let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    return this.noiseBuf;
  }

  /** A gain that rises in a few ms to `peak` and decays to silence over `len` s. */
  #env(t, dest, peak, len){
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    g.connect(dest);
    return g;
  }

  #burst(t, dest, { freq, q = 1, type = "bandpass", peak, len }){
    const src = this.ctx.createBufferSource();
    src.buffer = this.#noise();
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    src.connect(f).connect(this.#env(t, dest, peak, len));
    src.start(t, Math.random() * 0.8, len + 0.02);
  }

  #tone(t, dest, { from, to = from, len, peak, type = "sine" }){
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if(to !== from) o.frequency.exponentialRampToValueAtTime(to, t + len * 0.8);
    o.connect(this.#env(t, dest, peak, len));
    o.start(t);
    o.stop(t + len + 0.02);
  }
}
