/**
 * Fixed board outlines (domains a continent can be grown inside).
 */
import { hk } from "./hex.js";

/** Regular hexagon of radius R (R = 2 is the standard 19-hex board). */
export function hexagonRegion(R){
  const out = [];
  for(let q = -R; q <= R; q++){
    for(let r = Math.max(-R, -q-R); r <= Math.min(R, -q+R); r++) out.push(hk(q, r));
  }
  return out;
}

/** The 5–6 player frame: rows of 3-4-5-6-5-4-3 = 30 hexes. */
export function frame56Region(){
  const rows = [3,4,5,6,5,4,3], out = [];
  rows.forEach((len, i) => {
    const r = i - 3;
    const q0 = Math.round(-r/2 - (len-1)/2);
    for(let k = 0; k < len; k++) out.push(hk(q0 + k, r));
  });
  return out;
}

/** The domain hex nearest the origin — where growth and drafting start. */
export function centreOf(domain){
  let best = null, bd = Infinity;
  for(const k of domain){
    const [q, r] = k.split(",").map(Number);
    const d = Math.abs(q) + Math.abs(r) + Math.abs(q + r);
    if(d < bd){ bd = d; best = k; }
  }
  return best;
}
