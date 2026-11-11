/**
 * Sea Lanes: land inside the 5–6 player frame; the leftover slots are
 * navigable water. House rule: pay a ship to claim one otherwise
 * unreachable frame port, one player per port — so bays (2-spots with sea
 * access) are playable and spikes (1-spots with sea access) are traps.
 */
import { BoardGenerator } from "./BoardGenerator.js";
import { frame56Region } from "../shapes.js";
import { topology } from "../topology.js";
import { orderBoundary } from "../ports.js";
import { seaLanes } from "../seaLanes.js";

const FRAME = frame56Region();

export class SeaLanesGenerator extends BoardGenerator {
  constructor(){
    super({
      id:"lanes",
      name:"Sea Lanes",
      description:"Land inside the 5–6 player frame. Ships can claim the ports land can't reach.",
      portCount:11,
      maxTiles:FRAME.length,
      usesShipRule:true,
    });
  }

  domain(){ return FRAME.slice(); }

  /* the ship rule pays back roughly a quarter of what a lost adjacency
     costs, so it can afford a little coastline — within reason */
  effectiveFloor(compactness){ return Math.max(0.80, compactness - 0.05); }

  growthExponent(){ return 2.4; }

  /* ports sit on the outer rim of the frame, land or water alike */
  portSlotSource(topo, domain){ return orderBoundary(topology(new Set(domain)).boundary); }

  buildLanes(land, domain, portSlots, request){
    return seaLanes(land, domain, portSlots, request.shipRule !== "dist");
  }
}
