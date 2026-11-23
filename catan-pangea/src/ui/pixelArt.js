/**
 * 8-bit pixel art as SVG — the season badges (badges.js) and the knights
 * (knights.js). Art is a grid of letters, one per pixel ("." empty), each
 * letter a color; runs of the same color become one <rect>, drawn with
 * crisp edges, so it scales up without blurring.
 */
import { s } from "./dom.js";

/** The grid with a one-pixel outline (`ink`) round everything drawn. */
export function outlined(rows, ink = "o"){
  const g = [rows[0].replace(/./g, "."), ...rows, rows[0].replace(/./g, ".")].map(r => [".", ...r, "."]);
  const drawn = (x, y) => g[y]?.[x] != null && g[y][x] !== "." && g[y][x] !== ink;
  for(let y = 0; y < g.length; y++) for(let x = 0; x < g[y].length; x++)
    if(g[y][x] === "." && (drawn(x - 1, y) || drawn(x + 1, y) || drawn(x, y - 1) || drawn(x, y + 1))) g[y][x] = ink;
  return g.map(r => r.join(""));
}

/** `top` drawn over `base` at (dx, dy) — its "." pixels let the base show through. */
export function layer(base, top, dx = 0, dy = 0){
  const g = base.map(r => [...r]);
  top.forEach((row, y) => [...row].forEach((c, x) => { if(c !== "." && g[y + dy]?.[x + dx] != null) g[y + dy][x + dx] = c; }));
  return g.map(r => r.join(""));
}

/** An empty grid. */
export const blank = (w, h) => Array.from({ length:h }, () => ".".repeat(w));

/**
 * One <rect> per run of same-colored pixels in a row.
 * @param {Record<string,string>} [colors]  letter → fill
 * @param {(c:string) => boolean} [filter]  which letters to draw
 * @param {Record<string,string>} [themed]  letter → a class instead of a fill (colors that follow the theme, in CSS)
 */
export function pixels(rows, colors = {}, filter = () => true, themed = {}){
  const out = [];
  rows.forEach((row, y) => {
    for(let x = 0; x < row.length;){
      const c = row[x];
      let n = 1;
      while(row[x + n] === c) n++;
      if(c !== "." && filter(c)){
        const attrs = { x, y, width:n, height:1 };
        if(themed[c]) attrs.class = themed[c]; else attrs.fill = colors[c];
        out.push(s("rect", attrs));
      }
      x += n;
    }
  });
  return out;
}

/** The <svg> for a grid, `px` screen pixels per art pixel (CSS may size it otherwise). */
export function art(rows, cls, children = [], px = 2){
  const w = rows[0].length, hgt = rows.length;
  const svg = s("svg", { class:cls, viewBox:`0 0 ${w} ${hgt}`, width:w * px, height:hgt * px, "shape-rendering":"crispEdges", "aria-hidden":"true", focusable:"false" });
  svg.append(...[children].flat(Infinity));
  return svg;
}

/** A <g> of pixels, with a class (CSS shows, hides or animates it). */
export function group(cls, children){
  const g = s("g", { class:cls });
  g.append(...[children].flat(Infinity));
  return g;
}
