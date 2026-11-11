/**
 * Board colours. Terrain is the same in both themes (it's the board, not
 * the chrome); everything else comes from the board-* CSS tokens so the
 * board — and any exported image — follows the current theme.
 */

export const TERRAIN_COLOR = {
  forest:    "#3E6B48",
  pasture:   "#9DBE6B",
  fields:    "#E1B04B",
  hills:     "#C46A45",
  mountains: "#8C969E",
  desert:    "#E5D6B0",
};

export const RESOURCE_COLOR = {
  lumber:"#3E6B48", wool:"#9DBE6B", grain:"#E1B04B", brick:"#C46A45", ore:"#8C969E",
};

/** Resolve the theme-dependent board colours from CSS custom properties. */
export function readBoardPalette(root = document.documentElement){
  const cs = getComputedStyle(root);
  const v = name => cs.getPropertyValue(name).trim();
  return {
    background: v("--bg"),
    gap:        v("--board-gap"),
    sea:        v("--board-sea"),
    token:      v("--board-token"),
    tokenInk:   v("--board-token-ink"),
    red:        v("--board-red"),
    port:       v("--board-port"),
    port3:      v("--board-port-3"),
    label:      v("--board-label"),
    font:       v("--font"),
  };
}
