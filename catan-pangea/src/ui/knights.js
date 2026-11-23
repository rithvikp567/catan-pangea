/**
 * The knights of a battle (ui/BattleOverlay.js), in the app's 8-bit style
 * (ui/pixelArt.js, like the season badges): original art, worn in the
 * player's color.
 *
 *   tiers      basic (1): an open-faced kettle helmet; strong (2): a great
 *              helm with a plume; mighty (3): a great helm with a gold crown
 *   knight()   standing — "ready" (sword down, shield up: the knights to pick
 *              from), "victory" (sword raised, sparkling) or "wounded"
 *              (bandaged head, arm in a sling, a broken sword, a cracked
 *              shield, stars round the head)
 *   rider()    on a horse in the player's colors, lance forward, facing
 *              right (the right-hand rider is mirrored in CSS); two leg
 *              frames for the gallop
 *   dust()     the cloud where they collide
 *
 * The animation is CSS (css/screens.css, "battle").
 */
import { h } from "./dom.js";
import { outlined, layer, blank, pixels, art, group } from "./pixelArt.js";

/* fixed colors; c / C are the player's color and its shade */
const BASE = {
  o:"#231E1A",                                   /* outline */
  S:"#7F8C99", s:"#C2CBD4", W:"#F3F6F9",         /* steel: shade, plate, shine */
  e:"#1B1F24",                                   /* eye slit */
  k:"#F0BE94", K:"#C88E66",                      /* skin */
  g:"#F6C431", G:"#C98A12",                      /* gold */
  n:"#8B5A2B", N:"#5B3920",                      /* leather, wood */
  b:"#A0693A", B:"#6E4524", m:"#3A2616", h:"#2A2522",   /* horse, its shade, mane, hooves */
  w:"#F7F3EA", r:"#C9302C",                      /* bandage, blood */
};
/* sparkles and dizzy stars follow the theme (css) */
const THEMED = { y:"knight-spark", z:"knight-star" };

/** The player's color and a shade of it. */
function palette(hex){
  const n = parseInt(String(hex).slice(1), 16) || 0;
  const shade = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.round(v * .66));
  return { ...BASE, c:hex, C:`rgb(${shade.join(",")})` };
}

/* ---------- heads (8 × 8): facing us, and facing right (riding) ---------- */
const HEAD = {
  1: [
    "..SSSS..",
    ".SsWssS.",
    "SSSSSSSS",
    ".kkkkkk.",
    ".kekkek.",
    ".kkkkkk.",
    ".KkkkkK.",
    "..KKKK..",
  ],
  2: [
    "...cc...",
    "...Cc...",
    "..SSSS..",
    ".SsWssS.",
    ".SeeeeS.",
    ".SssssS.",
    ".SsSSsS.",
    "..SSSS..",
  ],
  3: [
    ".g.gg.g.",
    ".gggggg.",
    ".GGGGGG.",
    ".SsWssS.",
    ".SeeeeS.",
    ".SssssS.",
    ".SsSSsS.",
    "..SSSS..",
  ],
};
const SIDE_HEAD = {
  1: [
    "..SSSS..",
    ".SsWssS.",
    "SSSSSSSS",
    "..kkkkk.",
    "..kkkek.",
    "..kkkkkk",
    "..Kkkkk.",
    "...KKK..",
  ],
  2: [
    "cc......",
    ".cCSSS..",
    "..SsWsS.",
    "..SssssS",
    "..SsseeS",
    "..SssssS",
    "..SsSssS",
    "...SSSS.",
  ],
  3: [
    "cc.g.g.g",
    ".cCggggg",
    "..GGGGG.",
    "..SsWssS",
    "..SsseeS",
    "..SssssS",
    "..SsSssS",
    "...SSSS.",
  ],
};

/* ---------- standing (16 × 22): the head at (4, 2) ---------- */
const BODY = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "....SSccccSS....",
  "...SSccccccSS...",
  "...SccCccCccS...",
  "...SccccccccS...",
  "...NNNNggNNNN...",
  "....cCccccCc....",
  "....cccccccc....",
  ".....ss..ss.....",
  ".....sS..Ss.....",
  ".....sS..Ss.....",
  "....NNN..NNN....",
  "....NNN..NNN....",
];
const SHIELD = [
  "CCCCC",
  "CcgcC",
  "CgggC",
  "CcgcC",
  "CcgcC",
  ".CcC.",
  "..C..",
];
const CRACKED_SHIELD = [
  "CCCCC",
  "CcgoC",
  "Cggo.",
  "Ccoc.",
  "CogcC",
  ".CcC.",
  "..C..",
];
/* the sword arm, laid over the body at (0, 0) */
const ARM = {
  ready: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "..S.............",
    "..s.............",
    "..s.............",
    "..k.............",
    ".ggg............",
    "..W.............",
    "..W.............",
    "..s.............",
    "..s.............",
    "..s.............",
  ],
  victory: [
    "..W.............",
    "..W.............",
    "..W.............",
    "..W.............",
    "..s.............",
    ".ggg............",
    "..k.............",
    "..s.............",
    "..s.............",
    "..sS............",
    "...S............",
  ],
  wounded: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "..S.............",
    "..s.............",
    "..s.............",
    "..k.............",
    ".ggg............",
    "..W.............",
    "..s.............",
  ],
};
/* sparkles round a victory, stars round a wounded head (themed; no outline) */
const FX = {
  victory: [
    "y.............y.",
    "...............y",
    "y...............",
    "...............y",
  ],
  wounded: [
    "................",
    "...z.......z....",
    "z..............z",
  ],
};
/* wounded: a bandage round the head (its knot sticking out) and an arm in a sling */
const BANDAGE = [
  "wwwwwrww..",
  "........ww",
];
const SLING = [
  "........w",
  ".......w.",
  "wwwwwwk..",
  ".wwwww...",
  "..www....",
];

/**
 * A knight standing.
 * @param {1|2|3} level
 * @param {string} hex  the player's color
 * @param {"ready"|"victory"|"wounded"} [pose]
 */
export function knight(level, hex, pose = "ready"){
  let g = layer(BODY, HEAD[level] ?? HEAD[1], 4, 2);
  g = layer(g, pose === "wounded" ? CRACKED_SHIELD : SHIELD, 11, 12);
  g = layer(g, ARM[pose] ?? ARM.ready);
  if(pose === "wounded"){
    g = layer(g, BANDAGE, 4, 5);
    g = layer(g, SLING, 3, 12);
  }
  const rows = outlined(g);
  const fx = layer(blank(rows[0].length, rows.length), FX[pose] ?? [], 1, 0);
  return art(rows, `knight-art is-${pose}`, [
    pixels(rows, palette(hex)),
    group("knight-fx", pixels(fx, {}, () => true, THEMED)),
  ], 3);
}

/* ---------- riding (34 × 28): facing right — the rider's head goes on at (10, 0) ---------- */
const RIDING = [
  "..................................",
  "..................................",
  "..................................",
  "..................................",
  "..................................",
  "..................................",
  "..................................",
  "....................skNNNNNNNNNNWW",
  "............SccccS.ss....bB.......",
  "...........SccccccSs....mbbB......",
  "...........ScCccCcS....mmbbbbb....",
  "...........SccccccS...mmbbbebbb...",
  "...........SccccccS...mbbbbbbbbbb.",
  "..........CCCCC.sS...mmbbb...bbBh.",
  "..........CcgcC.sS...mbbbb....Bh..",
  "..........CgggC.sS..mmbbbb........",
  "........cccCgCccNNNcmbbbbb........",
  ".....bcCccccCccccccccCbbbb........",
  "...mmbcccgccccccgcccccbbbb........",
  "..mm.bccccccccccccccccbbbB........",
  ".mm..bccccccccccccccccbbB.........",
  ".m...Bggggggggggggggggbb..........",
  ".....BbbB..........BbbB...........",
  "..................................",
  "..................................",
  "..................................",
  "..................................",
  "..................................",
];
/* the gallop: legs stretched out, then gathered under */
const GALLOP = {
  a: [
    "....bB............bB..............",
    "...bB..............bB.............",
    "..bB................bB............",
    ".hh..................hh...........",
  ],
  b: [
    "......bB..........bB..............",
    "......bB..........bB..............",
    "......bB..........bB..............",
    "......hh..........hh..............",
  ],
};

/**
 * A knight charging on a horse in the player's colors, lance forward,
 * facing right; `.legs-a` / `.legs-b` are the gallop's two frames (CSS
 * shows one at a time).
 * @param {1|2|3} level
 * @param {string} hex
 */
export function rider(level, hex){
  const rows = outlined(layer(RIDING, SIDE_HEAD[level] ?? SIDE_HEAD[1], 10, 0)), colors = palette(hex);
  const legs = f => outlined(layer(blank(34, 28), GALLOP[f], 0, 23));
  /* (each frame outlined on its own, drawn under the horse) */
  return art(rows, "rider-art", [
    group("legs-a", pixels(legs("a"), colors)),
    group("legs-b", pixels(legs("b"), colors)),
    pixels(rows, colors),
  ], 3);
}

/* ---------- the dust cloud where they collide ---------- */
const DUST = [
  "..........dddddd..............",
  "......ddddddddddddd...dddd....",
  "....ddddddddddddddddddddddddd.",
  "...dddddzddddddDDDddddddzdddd.",
  "..dddddzzzddddDdddDdddddzzzddd",
  ".ddddddzddddddddddDdddddzdddd.",
  "dddDDDdddddddddddDddddddddddd.",
  "ddDdddDddddzdddDDdddddddddDDdd",
  "dddddDdddddzzzdddddddddddDdddd",
  ".ddddDddddddzddddddzddddDddddd",
  ".dddDddddddddddddddddddddDddd.",
  "dddddddddDDDddddddddzzzdddddd.",
  ".dddddddDddddddddddddzdddddddd",
  "..dddddddDDDdddddddddddddddd..",
  "...dddddddddd.dddddddd.dddd...",
  ".....dddd......dddd...........",
];

/** The cloud of a scuffle, with stars in it. */
export function dust(){
  const rows = outlined(DUST, "D");
  return art(rows, "dust-art", [
    pixels(rows, { d:"#EADFCB", D:"#9C8B72" }, c => c !== "z"),
    pixels(rows, {}, c => c === "z", THEMED),
  ], 4);
}

/** Pips under a knight: its level, 1–3. */
export const pips = level => h("span", { class:"knight-pips", "aria-hidden":"true" }, Array.from({ length:level }, () => h("i")));
