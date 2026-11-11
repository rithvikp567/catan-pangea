/**
 * Registry of board types. The UI builds its mode switch from this list,
 * so registering a new generator here is all it takes to expose it.
 */
import { OpenSeaGenerator } from "./OpenSeaGenerator.js";
import { SeaLanesGenerator } from "./SeaLanesGenerator.js";

export { BoardGenerator, MIN_TILES } from "./BoardGenerator.js";
export { OpenSeaGenerator, SeaLanesGenerator };

export const GENERATORS = Object.freeze([new OpenSeaGenerator(), new SeaLanesGenerator()]);

/** @returns {import("./BoardGenerator.js").BoardGenerator} */
export function getGenerator(id){
  return GENERATORS.find(g => g.id === id) ?? GENERATORS[0];
}
