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
 *   victor()   after the clash, the winner: still mounted, sword raised
 *   fallen()   after the clash, the loser: knocked over with the horse —
 *              the horse on its back, legs in the air, the knight thrown
 *              on the ground beside it, stars round both heads
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

const rgb = hex => { const n = parseInt(String(hex).slice(1), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

/** A darker shade of a color (the shading on the player's tunic, cloth and shield). */
export function shadeOf(hex, f = .66){ return `rgb(${rgb(hex).map(v => Math.round(v * f)).join(",")})`; }

/** A pale grey horse, for a player whose color is too close to the bay horse's brown (their cloth would vanish on it). */
const GREY_HORSE = { b:"#D3CEC6", B:"#9C958B", m:"#5E5850" };
const nearHorse = hex => Math.hypot(...rgb(hex).map((v, i) => v - rgb(BASE.b)[i])) < 50;

/** The player's color and its shade (and a horse that stands apart from them). */
function palette(hex){
  return { ...BASE, ...(nearHorse(hex) ? GREY_HORSE : {}), c:hex, C:shadeOf(hex) };
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

/* ---------- after the clash: the winner still mounted, sword up; the loser knocked over with the horse ----------
   32 rows: the charge's 28 with 4 more on top for the raised sword, so the ground (row 30) lines up with the
   riders' hooves; both face right, like rider() (the right-hand one is mirrored in CSS) */
const UP = 4;
/** The grid turned a quarter left (its top row becomes the left column) — a head lying on its back. */
const turnLeft = rows => [...rows[0]].map((_, i) => rows.map(r => r[r.length - 1 - i]).join(""));

/* the rider without the lance (row 7: the hand and the lance), on a horse standing still */
const MOUNTED = RIDING.map((r, y) => y === 7 ? ".".repeat(r.length) : r);
/* the sword arm raised, at (19, 0): blade, guard, hand, arm — down to the shoulder at (19, 12) */
const SWORD_UP = [
  ".W..",
  ".Ws.",
  ".Ws.",
  ".Ws.",
  ".Ws.",
  ".Ws.",
  ".Ws.",
  ".Ws.",
  "gggG",
  ".kk.",
  ".s..",
  ".s..",
];
const VICTOR_FX = [
  ".y......y.",
  "..........",
  "y.........",
  ".........y",
];

/**
 * The winner, after the clash: still on the horse (standing), the sword
 * raised, sparkling.
 * @param {1|2|3} level
 * @param {string} hex
 */
export function victor(level, hex){
  let g = layer(blank(34, 28 + UP), MOUNTED, 0, UP);
  g = layer(g, GALLOP.b, 0, 23 + UP);
  g = layer(g, SIDE_HEAD[level] ?? SIDE_HEAD[1], 10, UP);
  const rows = outlined(layer(g, SWORD_UP, 19, 0));
  const fx = layer(blank(rows[0].length, rows.length), VICTOR_FX, 15, 0);
  return art(rows, "victor-art", [
    pixels(rows, palette(hex)),
    group("knight-fx", pixels(fx, {}, () => true, THEMED)),
  ], 3);
}

/* the knight thrown on the ground, on his back: his head (the side view turned) at the left, feet up at the right */
const LYING = [
  "...........",
  "...........",
  "...........",
  "ScccCN...NN",
  "SccgcNs..NN",
  "SccccNsssNN",
  "SCCCCNsSSNN",
  ".SSS.N.....",
];
/* the horse on its back, legs in the air (its head goes on at the right: the charge's, lying on its jaw) */
const ON_ITS_BACK = [
  "..hh...hh.........hh...hh.",
  "...b....b..........b...b..",
  "...b....b..........b...b..",
  "...bB..Bb..........bB.Bb..",
  "....b..b............b.b...",
  "..bbbbbbbbbbbbbbbbbbbbbbb.",
  ".bbbbbbbbbbbbbbbbbbbbbbbbB",
  ".bgggggggggggggggggggggggb",
  ".bcccgccccccccgcccccccgccb",
  "mbcCcccccccccccccccccccCcb",
  "mmcCCCCCCCCCCCCCCCCCCCCCcb",
  ".m.CNNNNNNNNNNNCCCCCCCCCbb",
  ".mm.....................bb",
];
const HORSE_HEAD = RIDING.slice(8, 15).map(r => r.slice(21));
/* stars round both heads (in the outlined grid, from row 19) */
const FALLEN_FX = [
  "..z.........................................z...",
  "z...z....................................z.....z",
];

/**
 * The loser, after the clash: knocked over with the horse — the horse on
 * its back, legs in the air, the knight thrown on the ground beside it,
 * both seeing stars.
 * @param {1|2|3} level
 * @param {string} hex
 */
export function fallen(level, hex){
  let g = blank(52, 28 + UP);
  g = layer(g, ON_ITS_BACK, 16, 18);
  g = layer(g, HORSE_HEAD, 16 + 23, 24);
  g = layer(g, turnLeft(SIDE_HEAD[level] ?? SIDE_HEAD[1]), 0, 23);
  g = layer(g, LYING, 8, 23);
  const rows = outlined(g);
  const fx = layer(blank(rows[0].length, rows.length), FALLEN_FX, 1, 19);
  return art(rows, "fallen-art", [
    pixels(rows, palette(hex)),
    group("knight-fx", pixels(fx, {}, () => true, THEMED)),
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
