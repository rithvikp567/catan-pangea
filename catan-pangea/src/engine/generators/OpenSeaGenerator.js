/**
 * Open Sea: one connected continent in open water, no frame. Nine loose
 * port tiles clip onto the outer coast.
 *
 * Carries over what the retired "Surveyed" generator did well:
 *  - every seat must open with ore and wheat (either profile);
 *  - a tight coastline (floor ≥ 0.95) grows from a rounder seed blob,
 *    which reliably reaches the floor;
 *  - its longer anneal is now the default "Standard" quality.
 */
import { BoardGenerator } from "./BoardGenerator.js";

export const TIGHT_FLOOR = 0.95;

export class OpenSeaGenerator extends BoardGenerator {
  constructor(){
    super({
      id:"open",
      name:"Open Sea",
      description:"One continent in open water. Nine ports clip onto the coast.",
      portCount:9,
      oreWheatFloor:true,
    });
  }

  growthExponent(floor){ return floor >= TIGHT_FLOOR ? 3.2 : 2.0; }
}
