/**
 * The 0–100 map score shown to players: four 25-point parts.
 */
import { RES_ORDER } from "./catalog.js";
import { Smax } from "./topology.js";

export const VERDICTS = [
  { min:78, key:"good", label:"Playable as dealt" },
  { min:58, key:"ok",   label:"Acceptable" },
  { min:-Infinity, key:"bad", label:"Re-roll advised" },
];

const clamp01 = x => Math.max(0, Math.min(1, x));

/**
 * @param {{ topo, evaluation:{detail:object}, players:number }} p
 * @returns {{ total:number, verdict:{key:string,label:string}, parts:{name:string,value:number,note:string}[] }}
 */
export function scoreBoard({ topo, evaluation, players }){
  const d = evaluation.detail;
  const SM = Smax(topo.A);

  /* compactness — the only lever on how many 3-spots exist */
  const compact = clamp01((topo.S / SM - 0.72) / 0.28) * 25;

  /* can 2N non-conflicting strong spots actually be seated */
  const seat = clamp01((d.topDeg3 - d.topDeg1 * 1.5) / (players * 2)) * 25;

  /* draft fairness: best-to-worst seat spread relative to the mean */
  const vals = d.draft.map(p => p.wpips);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const spread = mean > 0 ? (Math.max(...vals) - Math.min(...vals)) / mean : 1;
  const fair = clamp01(1 - spread / 0.34) * 25;

  /* number + resource discipline */
  const worstRes = Math.max(...RES_ORDER.map(r => Math.abs(1 - d.resIdx[r])));
  const numbers = clamp01(1 - d.red * 0.34 - d.same * 0.05 - Math.min(0.5, worstRes * 1.5)) * 25;

  const total = compact + seat + fair + numbers;
  return {
    total,
    verdict: VERDICTS.find(v => total >= v.min),
    parts: [
      { name:"Compactness",     value:compact, note:`S ${topo.S} / ${SM}` },
      { name:"Seating quality", value:seat,    note:`${d.topDeg3} of ${players * 2} on 3-spots` },
      { name:"Draft fairness",  value:fair,    note:`${(spread * 100).toFixed(0)}% spread` },
      { name:"Number balance",  value:numbers, note:`${d.red} red pair${d.red === 1 ? "" : "s"}` },
    ],
  };
}
