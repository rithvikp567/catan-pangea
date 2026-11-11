/**
 * Draws a Board into an <svg>. The viewBox is fitted tightly around the
 * board and scaled with "meet", so the whole map always fits its box —
 * portrait, landscape or desktop — without scrolling.
 *
 * Colours are resolved to concrete values at draw time (no CSS var()
 * references in the markup), so the SVG can be serialised straight to an
 * image that matches the screen.
 */
import { unhk, hexVerts, vertexToPixel, hexToPixel } from "../engine/hex.js";
import { PIPS, RES_LABEL } from "../engine/catalog.js";
import { s } from "./dom.js";
import { TERRAIN_COLOR, RESOURCE_COLOR } from "./palette.js";

const R = 44;                 /* hex radius in viewBox units */
const TOKEN_R = R * 0.36;
const PORT_R = R * 0.27;

const hexPoints = k => {
  const [q, r] = unhk(k);
  return hexVerts(q, r).map(v => vertexToPixel(v, R).map(n => n.toFixed(2)).join(",")).join(" ");
};

export class BoardView {
  /** @param {SVGSVGElement} svg */
  constructor(svg){
    this.svg = svg;
  }

  /** @param {import("../engine/Board.js").Board} board @param {ReturnType<import("./palette.js").readBoardPalette>} pal */
  render(board, pal){
    const svg = this.svg;
    svg.replaceChildren();
    svg.setAttribute("font-family", pal.font);
    this.bounds = { minX:Infinity, minY:Infinity, maxX:-Infinity, maxY:-Infinity };

    const water = s("g"), land = s("g"), tokens = s("g"), ports = s("g");
    for(const k of board.waterHexes) water.append(this.#hex(k, pal.sea, pal.gap));
    for(const t of board.tiles.values()){
      land.append(this.#hex(t.key, TERRAIN_COLOR[t.terrain], pal.gap));
      if(t.num) tokens.append(this.#token(t, pal));
    }
    board.portSlots.forEach(slot => ports.append(this.#port(slot, board.isShipOnly(slot), pal)));

    svg.append(water, land, ports, tokens);
    this.#fit();
  }

  /** Dim the current board while a new one is being generated. */
  setStale(stale){ this.svg.classList.toggle("is-stale", stale); }

  #grow(x, y){
    const b = this.bounds;
    b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y);
  }

  #hex(k, fill, gap){
    const [q, r] = unhk(k);
    for(const v of hexVerts(q, r)) this.#grow(...vertexToPixel(v, R));
    return s("polygon", { points:hexPoints(k), fill, stroke:gap, "stroke-width":3, "stroke-linejoin":"round" });
  }

  #token(tile, pal){
    const [cx, cy] = hexToPixel(...unhk(tile.key), R);
    const red = tile.num === 6 || tile.num === 8;
    const ink = red ? pal.red : pal.tokenInk;
    const g = s("g");
    g.append(s("circle", { cx, cy, r:TOKEN_R, fill:pal.token }));
    const label = s("text", {
      x:cx, y:cy + R*0.09, "text-anchor":"middle", "font-size":R*0.42,
      "font-weight":red ? 750 : 650, fill:ink,
    });
    label.textContent = tile.num;
    g.append(label);
    const n = PIPS[tile.num], gap = 3.8;
    for(let i = 0; i < n; i++){
      g.append(s("circle", { cx:cx + (i - (n-1)/2) * gap, cy:cy + R*0.2, r:1.4, fill:ink }));
    }
    return g;
  }

  #port(slot, shipOnly, pal){
    const [a, b] = slot.edge.split("/").map(v => vertexToPixel(v, R));
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const [hx, hy] = hexToPixel(...unhk(slot.hex), R);
    let nx = mid[0] - hx, ny = mid[1] - hy;
    const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    const px = mid[0] + nx * R * 0.55, py = mid[1] + ny * R * 0.55;
    const isTwo = slot.port.type === "two";
    const g = s("g");

    for(const end of [a, b]){
      g.append(s("line", { x1:end[0], y1:end[1], x2:px, y2:py, stroke:pal.port, "stroke-width":2, "stroke-linecap":"round" }));
    }
    g.append(s("circle", {
      cx:px, cy:py, r:PORT_R,
      fill: isTwo ? RESOURCE_COLOR[slot.port.res] : pal.port3,
      stroke: pal.port, "stroke-width": shipOnly ? 2 : 1.2,
      "stroke-dasharray": shipOnly ? "3 2.5" : null,
    }));
    const ratio = s("text", { x:px, y:py + 3.6, "text-anchor":"middle", "font-size":10.5, "font-weight":700, fill: isTwo ? "#FFFFFF" : pal.tokenInk });
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
      const name = s("text", { x:lx, y:ly, "text-anchor":anchor, "font-size":10, "font-weight":550, fill:pal.label });
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
