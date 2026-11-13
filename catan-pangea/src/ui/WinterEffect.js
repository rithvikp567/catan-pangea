/**
 * Winter is coming: 8-bit pixel snow and frost that build up as the
 * WALKER counter fills (level 0…6), on every phone at the table.
 *
 *   - Snow: pixel-art flakes (specks, crosses, flakes, crystals, sparkles)
 *     drawn on a low-resolution canvas and scaled up with hard pixel edges.
 *     Flakes blink (vanish for a few frames), twinkle (flash into a star)
 *     and pulse (breathe between sizes). More, bigger and faster flakes
 *     with every letter.
 *   - Frost: pixel frost creeping in from the screen edges, deeper in the
 *     corners, with icicles along the top. It grows and recedes smoothly.
 *   - Back to 0 (the word started over): everything fades out slowly
 *     instead of vanishing.
 *
 * Purely decorative: pointer-events none, and drawn under the music bar so
 * it never covers the YouTube player. Reduced motion: frost only, no snow.
 */
import { h } from "./dom.js";

const FADE_MS = 2800;
const FRAME_MS = 1000 / 40;            /* draw at ~40 fps: plenty for pixel art, kinder to phones */

/* sprites: 1 = core, 2 = shade, 3 = rim (keeps white flakes visible on a light screen) */
const SPRITES = {
  speck:  ["21", "12"],
  cross:  [".3.", "313", ".3."],
  flake:  ["3.1.3", ".212.", "31113", ".212.", "3.1.3"],
  crystal:["...3...", ".3.1.3.", "..212..", "3121213", "..212..", ".3.1.3.", "...3..."],
  starA:  ["..3..", "..1..", "31113", "..1..", "..3.."],
  starB:  ["3...3", ".1.1.", "..1..", ".1.1.", "3...3"],
  dot:    ["1"],
};
/* what each kind shrinks to when it pulses, and its share of the snow at low / full intensity */
const KINDS = [
  { name:"speck",   small:"speck", low:.55, high:.34, speed:[34, 52], sway:[1, 3] },
  { name:"cross",   small:"speck", low:.28, high:.28, speed:[42, 66], sway:[2, 5] },
  { name:"flake",   small:"cross", low:.12, high:.22, speed:[52, 80], sway:[3, 7] },
  { name:"crystal", small:"flake", low:.02, high:.11, speed:[64, 96], sway:[4, 9] },
  { name:"star",    small:"dot",   low:.03, high:.05, speed:[20, 34], sway:[1, 2] },
];

const PALETTES = {
  light:{ snow:["#FFFFFF", "#CFE5F8", "#6E9FCB"], frost:[[214, 234, 250], [170, 207, 238], [120, 168, 214]], tint:[120, 170, 225] },
  dark: { snow:["#FFFFFF", "#D6EAFF", "#86AEDB"], frost:[[236, 246, 255], [192, 222, 250], [128, 172, 222]], tint:[140, 190, 245] },
};

const rand = (a, b) => a + Math.random() * (b - a);

export class WinterEffect {
  /**
   * @param {object} [p]
   * @param {number} [p.max]  the level at which winter is fully here
   * @param {HTMLElement} [p.parent]
   */
  constructor({ max = 6, parent = document.body } = {}){
    this.max = max;
    this.level = 0;
    this.frost = 0;               /* drawn frost depth, 0…1, eases toward level / max */
    this.drawnFrost = -1;
    this.flakes = [];
    this.running = false;
    this.fading = false;

    this.frostCanvas = h("canvas", { class:"winter-frost" });
    this.snowCanvas = h("canvas", { class:"winter-snow" });
    this.el = h("div", { class:"winter", "aria-hidden":"true", hidden:true }, this.frostCanvas, this.snowCanvas);
    parent.append(this.el);

    this.reduced = matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced.addEventListener("change", () => this.#restart());
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.refreshTheme());
    new ResizeObserver(() => this.#resize()).observe(this.el);
    this.refreshTheme();
  }

  /** @param {number} level  letters lit, 0…max */
  set(level){
    level = Math.max(0, Math.min(this.max, Number(level) || 0));
    if(level === this.level) return;
    const was = this.level;
    this.level = level;
    if(level === 0){ if(was > 0) this.#fadeOut(); return; }
    this.#cancelFade();
    this.el.hidden = false;
    this.#resize();
    this.#restart();
  }

  /** Colors follow the light / dark theme. */
  refreshTheme(){
    const dark = getComputedStyle(document.documentElement).colorScheme.includes("dark");
    this.palette = PALETTES[dark ? "dark" : "light"];
    this.sprites = Object.fromEntries(Object.entries(SPRITES).map(([k, rows]) => [k, this.#sprite(rows)]));
    this.drawnFrost = -1;
    if(!this.el.hidden && !this.running) this.#drawFrost();
  }

  get #target(){ return this.level / this.max; }

  /* ---------------- lifecycle ---------------- */

  #restart(){
    if(this.reduced.matches){
      this.running = false;
      this.flakes = [];
      this.snowCtx?.clearRect(0, 0, this.W, this.H);
      this.frost = this.#target;
      this.#drawFrost();
      this.#tint();
      return;
    }
    if(this.running) return;
    this.running = true;
    this.last = this.lastDraw = performance.now();
    requestAnimationFrame(t => this.#tick(t));
  }

  #fadeOut(){
    this.fading = true;
    this.el.classList.add("is-fading");
    clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => {
      this.fading = false;
      this.running = false;
      this.flakes = [];
      this.frost = 0;
      this.drawnFrost = -1;
      this.el.hidden = true;
      this.el.classList.remove("is-fading");
      this.snowCtx?.clearRect(0, 0, this.W, this.H);
      this.frostCtx?.clearRect(0, 0, this.W, this.H);
    }, this.reduced.matches ? 0 : FADE_MS);
  }

  #cancelFade(){
    if(!this.fading) return;
    this.fading = false;
    clearTimeout(this.fadeTimer);
    this.el.classList.remove("is-fading");
  }

  /* ---------------- canvas setup ---------------- */

  #resize(){
    const r = this.el.getBoundingClientRect();
    if(!r.width || !r.height) return;
    /* one "pixel" of the 8-bit grid in CSS px — chunkier on bigger screens */
    const P = Math.max(3, Math.round(Math.min(r.width, r.height) / 200));
    const W = Math.ceil(r.width / P), H = Math.ceil(r.height / P);
    if(W === this.W && H === this.H && P === this.P) return;
    Object.assign(this, { P, W, H });
    for(const c of [this.frostCanvas, this.snowCanvas]){ c.width = W; c.height = H; }
    this.snowCtx = this.snowCanvas.getContext("2d");
    this.frostCtx = this.frostCanvas.getContext("2d");
    this.snowCtx.imageSmoothingEnabled = false;
    this.#noise();
    this.drawnFrost = -1;
    for(const f of this.flakes) if(f.x > W) f.x = rand(0, W);
    if(!this.el.hidden && !this.running) this.#drawFrost();
  }

  /** Blocky value noise for the frost edge, and the icicles along the top. */
  #noise(){
    const { W, H } = this, B = 3;
    const bw = Math.ceil(W / B) + 1, bh = Math.ceil(H / B) + 1;
    const blocks = Float32Array.from({ length:bw * bh }, Math.random);
    this.grain = new Float32Array(W * H);
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      this.grain[y * W + x] = .62 * blocks[((y / B) | 0) * bw + ((x / B) | 0)] + .38 * Math.random();
    }
    this.icicles = Float32Array.from({ length:W }, () => Math.random() < .14 ? rand(.5, 1.4) : rand(0, .25));
    /* icicles are a few pixels wide: spread each one to its neighbours */
    const ic = this.icicles.slice();
    for(let x = 1; x < W - 1; x++) this.icicles[x] = Math.max(ic[x], ic[x - 1] * .55, ic[x + 1] * .55);
  }

  #sprite(rows){
    const c = document.createElement("canvas");
    c.width = rows[0].length; c.height = rows.length;
    const ctx = c.getContext("2d");
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if(ch === ".") return;
      ctx.fillStyle = this.palette.snow[Number(ch) - 1];
      ctx.fillRect(x, y, 1, 1);
    }));
    return c;
  }

  /* ---------------- snow ---------------- */

  #flakeCount(f){
    const area = this.W * this.H * this.P * this.P;           /* CSS px² */
    const most = Math.max(70, Math.min(420, area / 2000));
    return Math.round(most * Math.pow(f, 1.25));
  }

  #spawn(f, anywhere){
    const r = Math.random();
    let acc = 0, kind = KINDS[0];
    for(const k of KINDS){ acc += k.low + (k.high - k.low) * f; if(r <= acc){ kind = k; break; } }
    const fast = 1 + .45 * f;                                  /* the storm picks up */
    return {
      kind,
      x: rand(0, this.W), y: anywhere ? rand(-.2 * this.H, .95 * this.H) : rand(-.25 * this.H, -2),
      vy: rand(...kind.speed) * fast / this.P,                  /* grid px per second */
      sway: rand(...kind.sway) * (1 + f) / 3, swayHz: rand(.15, .45), phase: rand(0, 6.3),
      blinkAt: performance.now() + rand(600, 5000), blinkUntil: 0,
      twinkleAt: performance.now() + rand(1500, 9000), twinkleUntil: 0,
      pulseHz: rand(.4, .9), born: performance.now(),
    };
  }

  #tick(now){
    if(!this.running) return;
    if(!this.snowCtx){ this.#resize(); requestAnimationFrame(n => this.#tick(n)); return; }   /* not laid out yet */
    const dt = Math.min(.05, (now - this.last) / 1000);
    this.last = now;
    const f = this.#target, t = now / 1000;

    /* frost eases toward the level (it stays put while fading out) */
    if(!this.fading){
      const step = dt * .5;
      this.frost += Math.max(-step, Math.min(step, f - this.frost));
    }
    if(Math.abs(this.frost - this.drawnFrost) > .006){ this.#drawFrost(); this.#tint(); }

    /* flakes: top up to the level's count; extras just fall off the bottom */
    const want = this.fading ? this.flakes.length : this.#flakeCount(f);
    const fresh = !this.flakes.length;
    while(this.flakes.length < want) this.flakes.push(this.#spawn(f, fresh || Math.random() < .5));
    const wind = Math.sin(t * .23) * 6 * f / this.P + Math.sin(t * 1.7) * 2 * f * f / this.P;
    for(let i = this.flakes.length - 1; i >= 0; i--){
      const fl = this.flakes[i];
      fl.y += fl.vy * dt;
      fl.x += wind * dt;
      if(fl.x < -8) fl.x += this.W + 16; else if(fl.x > this.W + 8) fl.x -= this.W + 16;
      if(fl.y > this.H + 8){
        if(this.flakes.length > want){ this.flakes.splice(i, 1); continue; }
        this.flakes[i] = this.#spawn(f, false);
      }
    }

    if(now - this.lastDraw >= FRAME_MS){ this.lastDraw = now; this.#drawSnow(now); }
    requestAnimationFrame(n => this.#tick(n));
  }

  #drawSnow(now){
    const ctx = this.snowCtx, t = now / 1000;
    ctx.clearRect(0, 0, this.W, this.H);
    for(const fl of this.flakes){
      /* blink: gone for a few frames now and then */
      if(now > fl.blinkAt){ fl.blinkUntil = now + rand(70, 220); fl.blinkAt = now + rand(1800, 7000); }
      if(now < fl.blinkUntil) continue;
      /* twinkle: flash into a star */
      if(now > fl.twinkleAt){ fl.twinkleUntil = now + rand(180, 420); fl.twinkleAt = now + rand(2500, 11000); }
      const pulse = Math.sin(t * fl.pulseHz * 6.283 + fl.phase);
      let sprite;
      if(fl.kind.name === "star"){
        /* sparkles cycle star → cross → dot → cross, stepping like an old game */
        const frame = Math.floor(t * 6 + fl.phase * 3) % 4;
        sprite = this.sprites[["starA", "cross", "dot", "starB"][frame]];
      }else if(now < fl.twinkleUntil){
        sprite = this.sprites[Math.floor(now / 90) % 2 ? "starA" : "starB"];
      }else{
        /* pulse: breathe between this kind's size and the one below */
        sprite = this.sprites[pulse > .35 ? fl.kind.name : fl.kind.small];
      }
      const age = Math.min(1, (now - fl.born) / 500);           /* new flakes fade in */
      ctx.globalAlpha = age * (.72 + .28 * (pulse * .5 + .5));
      const x = Math.round(fl.x + Math.sin(t * fl.swayHz * 6.283 + fl.phase) * fl.sway);
      ctx.drawImage(sprite, x - (sprite.width >> 1), Math.round(fl.y) - (sprite.height >> 1));
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- frost ---------------- */

  #drawFrost(){
    const { W, H } = this;
    if(!this.frostCtx || !W) return;
    this.drawnFrost = this.frost;
    const img = this.frostCtx.createImageData(W, H), px = img.data;
    const depth = this.frost * Math.min(W, H) * .12;
    if(depth >= .5){
      const [c1, c2, c3] = this.palette.frost, band = Math.ceil(depth * 3.2) + 2;
      const cornerR = Math.min(W, H) * .3;
      for(let y = 0; y < H; y++){
        const dy = Math.min(y, H - 1 - y);
        for(let x = 0; x < W; x++){
          const dx = Math.min(x, W - 1 - x);
          if(dx > band && dy > band) continue;
          const n = this.grain[y * W + x];
          const corner = 1 + .55 * Math.max(0, 1 - Math.hypot(dx, dy) / cornerR);
          const reach = depth * (.35 + .65 * n) * corner;
          /* how far into its reach this cell is, from the nearest edge (icicles hang from the top) */
          const ratio = Math.min(dx / reach, (H - 1 - y) / reach, y / (reach * (1 + this.icicles[x])));
          if(ratio >= 1) continue;
          const c = ratio < .3 ? c1 : ratio < .65 ? c2 : c3;
          const i = (y * W + x) * 4;
          px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
          px[i + 3] = Math.round(255 * (.8 - .62 * ratio) * Math.min(1, this.frost * 3));   /* see-through: buttons under it stay readable */
        }
      }
    }
    this.frostCtx.putImageData(img, 0, 0);
  }

  /** A faint cold tint over everything, stronger with the frost. */
  #tint(){
    const [r, g, b] = this.palette.tint;
    this.el.style.backgroundColor = `rgb(${r} ${g} ${b} / ${(this.frost * .09).toFixed(3)})`;
  }
}
