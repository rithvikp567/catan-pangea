/**
 * Hex-grid core. Pointy-top axial coordinates; hexes and vertices are keyed
 * by strings so they can live in Sets and Maps.
 *
 * Vertices sit on an exact integer lattice, so corners shared by
 * neighbouring hexes dedupe without any float tolerance:
 *     hex(q,r) centre   -> (2q + r, 3r)
 *     corner i offsets  -> (0,-2)(1,-1)(1,1)(0,2)(-1,1)(-1,-1)
 */

export const SQ3 = Math.sqrt(3);
export const DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
export const CORNER = [[0,-2],[1,-1],[1,1],[0,2],[-1,1],[-1,-1]];
/** Edge i runs from CORNER[i] to CORNER[i+1]; the hex across it is DIRS[EDGE_DIR[i]]. */
export const EDGE_DIR = [1,0,5,4,3,2];

/** @param {number} q @param {number} r @returns {string} hex key */
export const hk = (q, r) => q + "," + r;
/** @param {string} k hex or vertex key @returns {number[]} */
export const unhk = k => k.split(",").map(Number);
/** Order-independent key for the edge between two vertex keys. */
export const ek = (a, b) => a < b ? a + "/" + b : b + "/" + a;

/** The six vertex keys of hex (q, r), in CORNER order. */
export function hexVerts(q, r){
  const bx = 2*q + r, by = 3*r;
  return CORNER.map(([dx,dy]) => (bx+dx) + "," + (by+dy));
}

/** The six neighbouring hex keys, in DIRS order. */
export function neighbours(k){
  const [q,r] = unhk(k);
  return DIRS.map(([dq,dr]) => hk(q+dq, r+dr));
}

/** Hex-step distance between two hex keys. */
export function hexDist(a, b){
  const [q1,r1] = unhk(a), [q2,r2] = unhk(b);
  return (Math.abs(q1-q2) + Math.abs(r1-r2) + Math.abs(q1+r1-q2-r2)) / 2;
}

/** Pixel position of a vertex key for hex radius s. */
export function vertexToPixel(vk, s){
  const [a,b] = unhk(vk);
  return [(SQ3*s/2)*a, (s/2)*b];
}

/** Pixel position of a hex centre for hex radius s. */
export function hexToPixel(q, r, s){
  return [(SQ3*s/2)*(2*q + r), (s/2)*(3*r)];
}
