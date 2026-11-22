/**
 * Draws a Board into an <svg>. The viewBox is fitted tightly around the
 * board and scaled with "meet", so the whole map always fits its box —
 * portrait, landscape or desktop — without scrolling.
 *
 * Colors are resolved to concrete values at draw time (no CSS var()
 * references in the markup), so the SVG can be serialised straight to an
 * image that matches the screen.
 *
 * A new map can be built in (`build`): the tiles fly in from off screen,
 * the middle first, building the island out; then the number tokens fly in
 * face down (grey), flip over and land face up with a pop; then the ports
 * pop in. It's all Web Animations on the drawn elements — nothing in the
 * markup changes, so the image export is unaffected (the tokens' grey backs
 * are removed once they've turned over). With a Sound, each landing makes
 * its sound, lined up with the animation.
 *
 * The build is the same on every device: its order, spins and pitches come
 * from a seeded random (`build.seed`), and it runs from a shared moment
 * (`build.start`), so a device that heard about the map late starts part
 * way through, in step with the others. A device not showing the map can
 * play just the sounds (`motion:false`).
 */
import { unhk, hexVerts, vertexToPixel, hexToPixel } from "../engine/hex.js";
import { PIPS, RES_LABEL } from "../engine/catalog.js";
import { s } from "./dom.js";
import { mulberry32, hashSeed, shuffle } from "../engine/random.js";
import { TERRAIN_COLOR, RESOURCE_COLOR } from "./palette.js";

const R = 44;                 /* hex radius in viewBox units */
const TOKEN_R = R * 0.36;
const PORT_R = R * 0.27;

/* the build animation (ms) */
const TILE_MS = 520, TOKEN_MS = 420, FLIP_MS = 90, FACE_MS = 170, PORT_MS = 320;
const TOKEN_BACK = "#A39F96", TOKEN_BACK_RING = "#8A867E";

const hexPoints = k => {
  const [q, r] = unhk(k);
  return hexVerts(q, r).map(v => vertexToPixel(v, R).map(n => n.toFixed(2)).join(",")).join(" ");
};

export class BoardView {
  /** @param {SVGSVGElement} svg */
  constructor(svg){
    this.svg = svg;
    this.running = [];         /* the build's animations */
    this.silence = null;       /* stops the build's sounds still to come */
  }

  /**
   * @typedef {object} Build      a new map building itself in
   * @property {number} start     when it starts (performance.now() time; may be past)
   * @property {boolean} motion   animate it (the map is on screen here)
   * @property {import("./Sound.js").Sound|null} sound   …and play its sounds
   * @property {string} seed      the same on every device → the same build
   *
   * @param {import("../engine/Board.js").Board} board
   * @param {ReturnType<import("./palette.js").readBoardPalette>} pal
   * @param {{ build?:Build|null }} [opts]
   */
  render(board, pal, { build = null } = {}){
    const svg = this.svg;
    this.#stop();
    const animate = !!build?.motion;
    svg.replaceChildren();
    svg.setAttribute("font-family", pal.font);
    this.bounds = { minX:Infinity, minY:Infinity, maxX:-Infinity, maxY:-Infinity };

    const water = s("g"), land = s("g"), tokens = s("g"), ports = s("g");
    for(const k of board.waterHexes) water.append(this.#hex(k, pal.sea, pal.gap, "fill:sea stroke:gap"));
    for(const t of board.tiles.values()){
      land.append(this.#hex(t.key, TERRAIN_COLOR[t.terrain], pal.gap, "stroke:gap"));
      if(t.num) tokens.append(this.#token(t, pal, animate));
    }
    board.portSlots.forEach(slot => ports.append(this.#port(slot, board.isShipOnly(slot), pal)));

    svg.append(water, land, ports, tokens);
    this.#fit();
    if(build) this.#build({ water, land, tokens, ports }, build);
  }

  /**
   * The theme changed: repaint the board's theme colors in place — a New
   * map building in carries on (render() would start it over).
   * @param {ReturnType<import("./palette.js").readBoardPalette>} pal
   */
  recolor(pal){
    for(const el of this.svg.querySelectorAll("[data-paint]")){
      for(const pair of el.dataset.paint.split(" ")){
        const [attr, key] = pair.split(":");
        if(pal[key]) el.setAttribute(attr, pal[key]);
      }
    }
  }

  /** Stop a build under way: its animations and the sounds still to come. */
  #stop(){
    for(const a of this.running) a.cancel();
    this.running = [];
    this.silence?.();
    this.silence = null;
  }

  /**
   * The build: tiles fly in from off screen (from the side they sit on,
   * spinning, the middle of the island first), then each number token flies
   * in face down, flips and lands with a pop, then the ports pop in. All the
   * times are ms from `start`; everything random comes from `seed`, in the
   * same order whether it animates here or not.
   */
  #build({ water, land, tokens, ports }, { start, motion, sound, seed }){
    const rng = mulberry32(hashSeed(String(seed)));
    const rand = (lo, hi) => lo + rng() * (hi - lo);
    const shift = start - performance.now();          /* < 0: it started already (on the other devices) */
    const cues = [];
    const run = (el, frames, opts) => {
      if(!motion) return null;
      const a = el.animate(frames, { fill:"backwards", ...opts, delay:(opts.delay ?? 0) + shift });
      this.running.push(a);
      return a;
    };
    const b = this.bounds, cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    /* far enough to start outside the visible board, whatever the box's shape */
    const box = this.svg.getBoundingClientRect(), vb = this.svg.viewBox.baseVal;
    const scale = Math.min(box.width / vb.width, box.height / vb.height) || 1;
    const far = Math.hypot(box.width / scale, box.height / scale) * 0.62 + R * 2;
    const from = (x, y) => {
      let dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy);
      const a = (len < R ? rand(0, Math.PI * 2) : Math.atan2(dy, dx)) + rand(-0.45, 0.45);
      return [Math.cos(a) * far, Math.sin(a) * far];
    };

    for(const w of water.children) run(w, [{ opacity:0 }, { opacity:1 }], { duration:500, easing:"ease-out" });

    /* tiles: the middle first, so the island builds outward */
    const tiles = [...land.children].map(el => ({ el, x:+el.dataset.x, y:+el.dataset.y }))
      .map(t => ({ ...t, d:Math.hypot(t.x - cx, t.y - cy) + rand(0, R * 0.9) }))
      .sort((p, q) => p.d - q.d);
    const tileGap = Math.max(28, Math.min(55, 1000 / tiles.length));
    tiles.forEach((t, i) => {
      const [dx, dy] = from(t.x, t.y), spin = rand(-200, 200), at = i * tileGap;
      run(t.el, [
        { transform:`translate(${dx}px, ${dy}px) rotate(${spin}deg) scale(.5)`, opacity:0 },
        { transform:`translate(0px, 0px) rotate(0deg) scale(1.07)`, opacity:1, offset:.78 },
        { transform:"none", opacity:1 },
      ], { duration:TILE_MS, delay:at, easing:"cubic-bezier(.22,.75,.3,1)" });
      cues.push({ at:at + TILE_MS * 0.78, kind:"tile", pitch:rand(0.82, 1.18) });
    });
    const tilesDone = (tiles.length - 1) * tileGap + TILE_MS;

    /* number tokens: fly in face down, flip, land face up */
    const toks = shuffle(rng, [...tokens.children]);
    const tokGap = Math.max(40, Math.min(75, 1100 / Math.max(1, toks.length)));
    const tokStart = tilesDone + 60;
    toks.forEach((g, i) => {
      const at = tokStart + i * tokGap, land = at + TOKEN_MS;
      const back = g.querySelector(".tok-back"), face = g.querySelector(".tok-face");
      const [dx, dy] = from(+g.dataset.x, +g.dataset.y);
      run(g, [
        { transform:`translate(${dx * .8}px, ${dy * .8}px) scale(1.6)`, opacity:0 },
        { transform:"translate(0px, 0px) scale(1)", opacity:1, offset:.85 },
        { transform:"none", opacity:1 },
      ], { duration:TOKEN_MS, delay:at, easing:"cubic-bezier(.3,.7,.35,1)" });
      if(back){
        run(back, [{ transform:"scaleX(1)" }, { transform:"scaleX(0)" }], { duration:FLIP_MS, delay:land, easing:"ease-in", fill:"both" })
          ?.finished.then(() => back.remove(), () => {});         /* (gone, so it never shows in a saved image) */
      }
      run(face, [
        { transform:"scaleX(0)" },
        { transform:"scale(1.22, 1.22)", offset:.55 },
        { transform:"none" },
      ], { duration:FACE_MS, delay:land + FLIP_MS, easing:"ease-out" });
      cues.push({ at:land, kind:"flip" }, { at:land + FLIP_MS + FACE_MS * 0.5, kind:"pop", pitch:rand(0.9, 1.15) });
    });
    const toksDone = toks.length ? tokStart + (toks.length - 1) * tokGap + TOKEN_MS + FLIP_MS + FACE_MS : tilesDone;

    /* ports pop in, round the coast */
    [...ports.children].forEach((p, i) => {
      const at = toksDone + 100 + i * 55;
      run(p, [
        { transform:"scale(0)", opacity:0 },
        { transform:"scale(1.18)", opacity:1, offset:.65 },
        { transform:"none", opacity:1 },
      ], { duration:PORT_MS, delay:at, easing:"ease-out" });
      cues.push({ at:at + PORT_MS * 0.4, kind:"port" });
    });

    const total = (ports.children.length ? toksDone + 100 + (ports.children.length - 1) * 55 + PORT_MS : toksDone);
    if(shift + total <= 0){                            /* all over already: just the finished board */
      this.#stop();
      for(const back of tokens.querySelectorAll(".tok-back")) back.remove();
      return;
    }
    if(sound) this.silence = sound.play(cues, start);
  }

  /** Dim the current board while a new one is being generated. */
  setStale(stale){ this.svg.classList.toggle("is-stale", stale); }

  #grow(x, y){
    const b = this.bounds;
    b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y);
  }

  /** @param {string} paint  which attributes follow the theme ("attr:paletteKey …", for recolor) */
  #hex(k, fill, gap, paint){
    const [q, r] = unhk(k);
    for(const v of hexVerts(q, r)) this.#grow(...vertexToPixel(v, R));
    const [x, y] = hexToPixel(q, r, R);
    return s("polygon", { points:hexPoints(k), fill, stroke:gap, "stroke-width":3, "stroke-linejoin":"round", "data-x":x.toFixed(1), "data-y":y.toFixed(1), "data-paint":paint });
  }

  /** A number token; animated, it also gets a grey back (face down) on top of its face. */
  #token(tile, pal, withBack = false){
    const [cx, cy] = hexToPixel(...unhk(tile.key), R);
    const red = tile.num === 6 || tile.num === 8;
    const ink = red ? pal.red : pal.tokenInk, inkPaint = red ? "fill:red" : "fill:tokenInk";
    const tok = s("g", { class:"tok", "data-x":cx.toFixed(1), "data-y":cy.toFixed(1) });
    const g = s("g", { class:"tok-face" });
    tok.append(g);
    g.append(s("circle", { cx, cy, r:TOKEN_R, fill:pal.token, "data-paint":"fill:token" }));
    const label = s("text", {
      x:cx, y:cy + R*0.09, "text-anchor":"middle", "font-size":R*0.42,
      "font-weight":red ? 750 : 650, fill:ink, "data-paint":inkPaint,
    });
    label.textContent = tile.num;
    g.append(label);
    const n = PIPS[tile.num], gap = 3.8;
    for(let i = 0; i < n; i++){
      g.append(s("circle", { cx:cx + (i - (n-1)/2) * gap, cy:cy + R*0.2, r:1.4, fill:ink, "data-paint":inkPaint }));
    }
    if(withBack){
      const back = s("g", { class:"tok-back" });
      back.append(
        s("circle", { cx, cy, r:TOKEN_R, fill:TOKEN_BACK, stroke:TOKEN_BACK_RING, "stroke-width":1.6 }),
        s("polygon", { points:hexVerts(0, 0).map(v => vertexToPixel(v, TOKEN_R * 0.34)).map(([x, y]) => `${(cx + x).toFixed(2)},${(cy + y).toFixed(2)}`).join(" "),
          fill:"rgb(255 255 255 / .32)" }));
      tok.append(back);
    }
    return tok;
  }

  #port(slot, shipOnly, pal){
    const [a, b] = slot.edge.split("/").map(v => vertexToPixel(v, R));
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const [hx, hy] = hexToPixel(...unhk(slot.hex), R);
    let nx = mid[0] - hx, ny = mid[1] - hy;
    const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    const px = mid[0] + nx * R * 0.55, py = mid[1] + ny * R * 0.55;
    const isTwo = slot.port.type === "two";
    const g = s("g", { class:"port" });

    for(const end of [a, b]){
      g.append(s("line", { x1:end[0], y1:end[1], x2:px, y2:py, stroke:pal.port, "stroke-width":2, "stroke-linecap":"round", "data-paint":"stroke:port" }));
    }
    g.append(s("circle", {
      cx:px, cy:py, r:PORT_R,
      fill: isTwo ? RESOURCE_COLOR[slot.port.res] : pal.port3,
      stroke: pal.port, "stroke-width": shipOnly ? 2 : 1.2,
      "stroke-dasharray": shipOnly ? "3 2.5" : null,
      "data-paint": isTwo ? "stroke:port" : "fill:port3 stroke:port",
    }));
    const ratio = s("text", { x:px, y:py + 3.6, "text-anchor":"middle", "font-size":10.5, "font-weight":700, fill: isTwo ? "#FFFFFF" : pal.tokenInk,
      "data-paint": isTwo ? null : "fill:tokenInk" });
    ratio.textContent = isTwo ? "2:1" : "3:1";
    g.append(ratio);
    this.#grow(px - PORT_R, py - PORT_R); this.#grow(px + PORT_R, py + PORT_R);

    if(isTwo){
      /* the resource name sits further out along the same outward
         direction, so it never lands on the tiles or the dock lines */
      const LABEL_W = 34;
      const sideways = Math.abs(nx) > 0.6;
      const out = PORT_R + (sideways ? 5 : 12);
      const lx = px + (sideways ? Math.sign(nx) * out : nx * out);
      const ly = py + ny * out + 3.5;
      const anchor = sideways ? (nx > 0 ? "start" : "end") : "middle";
      const name = s("text", { x:lx, y:ly, "text-anchor":anchor, "font-size":10, "font-weight":550, fill:pal.label, "data-paint":"fill:label" });
      name.textContent = RES_LABEL[slot.port.res];
      g.append(name);
      const x0 = anchor === "start" ? lx : anchor === "end" ? lx - LABEL_W : lx - LABEL_W/2;
      this.#grow(x0, ly - 10); this.#grow(x0 + LABEL_W, ly + 3);
    }
    return g;
  }

  #fit(){
    const { minX, minY, maxX, maxY } = this.bounds, pad = 8;
    const x = minX - pad, y = minY - pad, w = maxX - minX + 2*pad, h = maxY - minY + 2*pad;
    this.svg.setAttribute("viewBox", `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
    this.svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }
}
