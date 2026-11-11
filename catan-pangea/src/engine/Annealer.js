/**
 * Simulated annealing over terrain, number tokens and ports.
 *
 * Each step tries one random swap — two whole tiles, two number tokens, or
 * the ports on two coastal slots. Improvements are always kept; a worse
 * board is kept with probability exp(−Δ/T), where the temperature T cools
 * geometrically over the run. Tolerating bad moves early is what lets it
 * escape boards a plain hill-climb would get stuck on.
 *
 * The work is chunked and yields between chunks so a browser stays
 * responsive; pass an AbortSignal to cancel a run that is no longer wanted.
 */
import { mulberry32, pick } from "./random.js";
import { evaluate } from "./objective.js";

export class AbortError extends Error {
  constructor(){ super("Anneal aborted"); this.name = "AbortError"; }
}

const cloneTiles = tiles => new Map([...tiles].map(([k, v]) => [k, { ...v }]));

/** Yield to the event loop (lets the UI paint progress between chunks). */
const yieldToEventLoop = () => new Promise(resolve => setTimeout(resolve, 0));

export class Annealer {
  /**
   * @param {object} [opts]
   * @param {number} [opts.startTemp]    T at the first step
   * @param {number} [opts.endTemp]      T at the last step
   * @param {number} [opts.portMoveP]    share of steps that swap two ports
   * @param {number} [opts.tileMoveP]    share of the remaining steps that swap whole tiles
   * @param {number} [opts.chunkSize]    steps between yields
   * @param {() => Promise<void>} [opts.yieldFn]
   */
  constructor({ startTemp = 240, endTemp = 0.6, portMoveP = 0.08, tileMoveP = 0.45,
                chunkSize = 550, yieldFn = yieldToEventLoop } = {}){
    Object.assign(this, { startTemp, endTemp, portMoveP, tileMoveP, chunkSize, yieldFn });
  }

  /**
   * @param {ReturnType<import("./objective.js").buildContext>} ctx
   * @param {{ keys:string[], tiles:import("./tileSet.js").TileMap }} state initial deal
   * @param {object} opts
   * @param {number} opts.iterations
   * @param {boolean} [opts.tileSwap=true] false keeps terrain fixed (only tokens + ports move)
   * @param {(fraction:number) => void} [opts.onProgress]
   * @param {AbortSignal} [opts.signal]
   * @returns {Promise<{ tiles, evaluation, portSlots }>}
   */
  async run(ctx, state, { iterations, tileSwap = true, onProgress, signal } = {}){
    const rng = mulberry32(ctx.seed ^ 0xC2B2AE35);
    const { keys } = state;

    let cur = cloneTiles(state.tiles);
    let curPorts = ctx.portSlots.map(s => s.port);   /* never mutated in place */
    let curRes = evaluate(ctx, cur, curPorts);
    let best = cloneTiles(cur), bestPorts = curPorts, bestRes = curRes;

    for(let i = 0; i < iterations; ){
      if(signal?.aborted) throw new AbortError();
      const chunkEnd = Math.min(i + this.chunkSize, iterations);
      for(; i < chunkEnd; i++){
        const T = this.startTemp * Math.pow(this.endTemp / this.startTemp, i / iterations);
        const cand = cloneTiles(cur);
        let candPorts = curPorts;

        if(curPorts.length > 1 && rng() < this.portMoveP){
          const a = Math.floor(rng() * curPorts.length), b = Math.floor(rng() * curPorts.length);
          const pa = curPorts[a], pb = curPorts[b];
          if(a === b || (pa.type === pb.type && pa.res === pb.res)) continue;
          candPorts = curPorts.slice();
          candPorts[a] = pb; candPorts[b] = pa;
        } else if(tileSwap && rng() < this.tileMoveP){
          /* move a whole tile (terrain + its token) */
          const a = pick(rng, keys), b = pick(rng, keys);
          if(a === b) continue;
          const ta = cand.get(a), tb = cand.get(b);
          cand.set(a, { ...tb, key:a }); cand.set(b, { ...ta, key:b });
        } else {
          /* move a number token only. Recomputed each time: a whole-tile
             swap can move the desert, changing which hexes hold tokens. */
          const numbered = keys.filter(k => cur.get(k).num !== null);
          const a = pick(rng, numbered), b = pick(rng, numbered);
          if(a === b) continue;
          const na = cand.get(a).num;
          cand.get(a).num = cand.get(b).num; cand.get(b).num = na;
        }

        const res = evaluate(ctx, cand, candPorts);
        const d = res.pen - curRes.pen;
        if(d < 0 || rng() < Math.exp(-d / T)){
          cur = cand; curPorts = candPorts; curRes = res;
          if(res.pen < bestRes.pen){ bestRes = res; best = cloneTiles(cand); bestPorts = candPorts; }
        }
      }
      onProgress?.(i / iterations);
      if(i < iterations) await this.yieldFn();
    }
    return {
      tiles: best,
      evaluation: bestRes,
      portSlots: ctx.portSlots.map((s, j) => ({ ...s, port:bestPorts[j] })),
    };
  }
}
