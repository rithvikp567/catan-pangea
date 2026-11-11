/**
 * Public surface of the map engine. The engine is DOM-free: everything
 * here runs the same in the browser, in Node tests, or in a worker.
 */
export { GENERATORS, getGenerator, BoardGenerator, MIN_TILES } from "./generators/index.js";
export { Board } from "./Board.js";
export { Annealer, AbortError } from "./Annealer.js";
export { randomSeedName } from "./random.js";
export { TERRAIN, RES_LABEL, PIPS } from "./catalog.js";
export { Smax } from "./topology.js";
