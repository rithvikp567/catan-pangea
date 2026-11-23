/**
 * The season standings' badges, in the same 8-bit pixel style as the winter
 * frost: a shining crown for first place and a stinking turd, with flies,
 * for everyone else. Drawn as pixel grids (one letter per pixel, "." empty,
 * an outline added round the edge); the animation is all CSS
 * (css/screens.css, "season badges"), still under prefers-reduced-motion.
 */
import { h, s } from "./dom.js";
import { outlined, pixels as drawPixels, art as drawArt } from "./pixelArt.js";

const PX = 2;                       /* screen px per art pixel */

/* ---------- the art ---------- */
const CROWN = [
  ".LY....LY....LY.",
  "LYYd..LYYd..LYYd",
  ".Yd....Yd....Yd.",
  ".LY....LY....Yd.",
  ".LY...LYYd...Yd.",
  ".LYY..LWRd..YYd.",
  ".LYYY.LRrd.YYYd.",
  ".LYYYYYYYYYYYYd.",
  ".LYYYYYYYYYYYYd.",
  "LLLLLLLLLLLLLLLd",
  "YYWRYYYWBYYYWRYd",
  "YYrrYYYbbYYYrrYd",
  "dddddddddddddddd",
];
const CROWN_COLORS = { o:"#6E3F06", Y:"#F6C431", L:"#FFEB8F", d:"#D48A12", W:"#FFFFFF", R:"#E2433A", r:"#A82A24", B:"#3C7FE0", b:"#2A5BB0" };

const TURD = [
  ".........l......",
  "........lB......",
  "......lWBB......",
  ".....lBBBBd.....",
  ".....dddddd.....",
  "...llWBBBBBBd...",
  "..lBBBBBBBBBBd..",
  "...dddddddddd...",
  ".llWBBBBBBBBBBd.",
  "lBBBBBBBBBBBBBBd",
  "lBBBBBBBBBBBBBBd",
  ".dddddddddddddd.",
];
const TURD_COLORS = { o:"#2E1A0B", B:"#94592A", l:"#C2864C", d:"#5F3615", W:"#E8C9A0" };

/* a wisp of stink, and a fly (its wings drawn twice: up, then down) */
const STINK = [".g.", "g..", "g..", ".g.", "..g", "..g", ".g."];
const FLY_BODY = ["..k..", ".kkk.", ".kkk.", "..k.."];
const WINGS_UP = ["w...w", "w...w", ".....", "....."];
const WINGS_DOWN = [".....", ".....", "w...w", "w...w"];
const SPARK = ["..a..", "..a..", "aacaa", "..a..", "..a.."];
/* colours that change with the theme are classes (css), not fills */
const THEMED = { g:"stink-px", k:"fly-px", w:"wing-px", a:"spark-px", c:"spark-core" };

/** Pixels with the badges' themed colors (stink, flies, sparks follow the theme). */
const pixels = (rows, colors = {}, filter = () => true) => drawPixels(rows, colors, filter, THEMED);
const art = (rows, cls, ...children) => drawArt(rows, cls, children, PX);

let uid = 0;

/** First place: a gold crown that glints, glows and sparkles. */
export function crown(){
  const rows = outlined(CROWN);
  /* the glint: a stepped diagonal band, clipped to the gold, that sweeps across */
  const clip = `crown-clip-${++uid}`;
  const cp = s("clipPath", { id:clip });
  cp.append(...pixels(rows, {}, c => c !== "o"));
  const defs = s("defs");
  defs.append(cp);
  const band = s("g", { class:"crown-shine", opacity:".85" });
  for(let y = 0; y < rows.length; y++) band.append(s("rect", { x:Math.floor((rows.length - y) / 3), y, width:2, height:1, fill:"#FFFFFF" }));
  const shine = s("g", { "clip-path":`url(#${clip})` });
  shine.append(band);
  return h("span", { class:"badge badge-crown", role:"img", "aria-label":"Crown: first place", title:"First place" },
    art(rows, "badge-art", defs, pixels(rows, CROWN_COLORS), shine),
    [1, 2, 3].map(i => h("span", { class:`spark spark-${i}` }, art(SPARK, "spark-art", pixels(SPARK)))));
}

/** Everyone else: a turd, with stink rising and two flies buzzing round it. */
export function turd(){
  const fly = i => h("span", { class:`fly fly-${i}` },
    h("span", { class:"fly-buzz" },
      art(FLY_BODY, "fly-art", pixels(FLY_BODY), s("g", { class:"wings-up" }), s("g", { class:"wings-down" }))));
  const el = h("span", { class:"badge badge-turd", role:"img", "aria-label":"Turd", title:"Not first" },
    [1, 2, 3].map(i => h("span", { class:`stink stink-${i}` }, h("span", { class:"stink-wave" }, art(STINK, "stink-art", pixels(STINK))))),
    art(outlined(TURD), "badge-art", pixels(outlined(TURD), TURD_COLORS)),
    fly(1), fly(2));
  for(const svg of el.querySelectorAll(".fly-art")){
    svg.querySelector(".wings-up").append(...pixels(WINGS_UP));
    svg.querySelector(".wings-down").append(...pixels(WINGS_DOWN));
  }
  return el;
}
