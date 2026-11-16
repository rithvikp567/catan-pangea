/**
 * Little sound effects, made on the spot with the Web Audio API — no audio
 * files: a wooden clack as each tile lands, a flick as a number token turns
 * over and a pop as it lands, a lighter pop for each port, and a short
 * 8-bit fanfare for the welcome.
 *
 * Browsers only let a page make sound after a tap, so the audio starts on
 * the first tap or key press anywhere; until then (and where there's no Web
 * Audio) every call is silently nothing. Times are seconds from now, so a
 * sound can be lined up with an animation that starts at the same moment.
 */
export class Sound {
  constructor(){
    this.ctx = null;
    this.out = null;
    this.noiseBuf = null;
    const unlock = () => this.#unlock();
    for(const ev of ["pointerdown", "keydown", "touchend"]) addEventListener(ev, unlock, { capture:true, passive:true });
  }

  /** Can it make sound right now (a tap has started the audio)? */
  get ready(){ return this.ctx?.state === "running"; }

  #unlock(){
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if(!AC) return;
    try{
      if(!this.ctx){
        this.ctx = new AC();
        this.out = this.ctx.createGain();
        this.out.gain.value = 0.5;
        this.out.connect(this.ctx.destination);
      }
      if(this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    }catch{ this.ctx = null; }
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
  #env(t, peak, len){
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    g.connect(this.out);
    return g;
  }

  #burst(t, { freq, q = 1, type = "bandpass", peak, len }){
    const src = this.ctx.createBufferSource();
    src.buffer = this.#noise();
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    src.connect(f).connect(this.#env(t, peak, len));
    src.start(t, Math.random() * 0.8, len + 0.02);
  }

  #tone(t, { from, to = from, len, peak, type = "sine" }){
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if(to !== from) o.frequency.exponentialRampToValueAtTime(to, t + len * 0.8);
    o.connect(this.#env(t, peak, len));
    o.start(t);
    o.stop(t + len + 0.02);
  }

  /** A tile landing: a wooden clack over a low thump (pitch ~0.8–1.2 for variety). */
  tile(at = 0, pitch = 1){
    if(!this.ready) return;
    const t = this.ctx.currentTime + Math.max(0, at);
    this.#burst(t, { freq:1500 * pitch, q:1.4, peak:0.45, len:0.06 });
    this.#tone(t, { from:190 * pitch, to:70 * pitch, len:0.11, peak:0.32 });
  }

  /** A number token turning over: a tiny flick. */
  flip(at = 0){
    if(!this.ready) return;
    this.#burst(this.ctx.currentTime + Math.max(0, at), { freq:5200, q:0.8, type:"highpass", peak:0.14, len:0.03 });
  }

  /** A number token landing face up: a round pop. */
  pop(at = 0, pitch = 1){
    if(!this.ready) return;
    const t = this.ctx.currentTime + Math.max(0, at);
    this.#tone(t, { from:320 * pitch, to:880 * pitch, len:0.09, peak:0.36 });
    this.#tone(t, { from:640 * pitch, to:1500 * pitch, len:0.05, peak:0.08, type:"triangle" });
  }

  /** A port appearing: a lighter, higher pop. */
  portPop(at = 0){
    if(!this.ready) return;
    this.#tone(this.ctx.currentTime + Math.max(0, at), { from:620, to:1250, len:0.07, peak:0.18 });
  }

  /** The welcome: four rising square-wave notes, the last one held. */
  fanfare(at = 0){
    if(!this.ready) return;
    const t = this.ctx.currentTime + Math.max(0, at);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this.#tone(t + i * 0.11, { from:f, len:i === 3 ? 0.42 : 0.12, peak:0.09, type:"square" }));
  }
}
