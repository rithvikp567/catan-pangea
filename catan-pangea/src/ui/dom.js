/**
 * Tiny DOM builders — enough structure to avoid innerHTML string soup
 * without pulling in a framework.
 */

/**
 * Create an HTML element.
 *   h("button", { class:"btn", onClick:fn, "aria-label":"Go" }, "Go")
 * `on*` props become listeners; `true` sets a boolean attribute; null /
 * false / undefined are skipped.
 */
export function h(tag, props = {}, ...children){
  const el = document.createElement(tag);
  for(const [k, v] of Object.entries(props)){
    if(v == null || v === false) continue;
    if(k === "class") el.className = v;
    else if(k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  el.append(...children.flat().filter(c => c != null && c !== false));
  return el;
}

export const SVG_NS = "http://www.w3.org/2000/svg";

/** Create an SVG element with attributes. */
export function s(tag, attrs = {}){
  const el = document.createElementNS(SVG_NS, tag);
  for(const [k, v] of Object.entries(attrs)) if(v != null) el.setAttribute(k, String(v));
  return el;
}
