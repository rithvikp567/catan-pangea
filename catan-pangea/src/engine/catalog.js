/**
 * Game data and tuning constants. Pure data — no colors or other
 * presentation concerns live here (see ui/palette.js).
 */

export const TERRAIN = {
  forest   : { res:"lumber", label:"Forest",    commodity:"paper" },
  pasture  : { res:"wool",   label:"Pasture",   commodity:"cloth" },
  fields   : { res:"grain",  label:"Fields",    commodity:null    },
  hills    : { res:"brick",  label:"Hills",     commodity:null    },
  mountains: { res:"ore",    label:"Mountains", commodity:"coin"  },
  desert   : { res:null,     label:"Desert",    commodity:null    },
};

export const RES_ORDER = ["lumber","brick","wool","grain","ore"];
export const RES_LABEL = { lumber:"Wood", brick:"Brick", wool:"Sheep", grain:"Wheat", ore:"Ore" };

/** Dots on each number token = ways to roll it with two dice. */
export const PIPS = { 2:1, 3:2, 4:3, 5:4, 6:5, 8:5, 9:4, 10:3, 11:2, 12:1 };

/** Base set: 4 forest / 4 pasture / 4 fields / 3 hills / 3 mountains / 1 desert = 19. */
export const BASE_TERRAIN = [
  ...Array(4).fill("forest"), ...Array(4).fill("pasture"), ...Array(4).fill("fields"),
  ...Array(3).fill("hills"),  ...Array(3).fill("mountains"), "desert",
];
export const BASE_NUMBERS = [2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12];

/** Terrain added, in turn, for each land tile beyond 19. */
export const EXTRA_TERRAIN = ["forest","pasture","fields","hills","mountains"];

/** Number tokens are trimmed / extended in pairs that mirror around 7, so
 *  every number on the board has its twin. Trim order alternates thin and
 *  fat pairs (3&11 then 5&9 …) to hold the base set's mean pips. */
export const TRIM_PAIRS = [[3,11],[5,9],[4,10],[6,8],[2,12]];
export const GROW_PAIRS = [[4,10],[5,9],[6,8]];

/** Terrain value weights. C&K: forest / pasture / mountains also yield
 *  commodities, and the metropolis race is decided on ore + wheat. */
export const WEIGHTS = {
  ck:   { forest:1.35, pasture:1.28, fields:1.18, hills:1.00, mountains:1.50 },
  base: { forest:1.00, pasture:0.95, fields:1.05, hills:1.12, mountains:1.15 },
};

/** Port pip-equivalent value used by the draft simulator. */
export const PORT_VALUE = { two:3.0, three:1.6 };
/** Ship cost + one trade per turn + exclusivity, for sea-lane ports. */
export const LANE_DISCOUNT = 0.45;

/** A 2:1 port wants its resource this many hexes from the hex it sits on:
 *  near enough to matter, far enough that one settlement can't hog both. */
export const PORT_SITE_DIST = 2;
