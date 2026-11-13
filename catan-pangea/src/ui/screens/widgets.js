/**
 * Small pieces shared by several screens.
 */
import { h } from "../dom.js";

const STATUS = {
  live:       { label:"Live",            hint:"Synced with every phone" },
  offline:    { label:"Offline",         hint:"Changes will sync when you reconnect" },
  device:     { label:"This device only", hint:"Nothing syncs between phones" },
  connecting: { label:"Connecting…",     hint:"" },
};

/** "● Live" style indicator for the sync connection. */
export function syncStatusPill(status){
  const s = STATUS[status] ?? STATUS.connecting;
  return h("span", { class:"sync-pill", "data-status":status, title:s.hint, "aria-label":`${s.label}. ${s.hint}` },
    h("span", { class:"dot" }), s.label);
}

/** A titled card section. */
export function section(title, ...children){
  return h("section", { class:"card" }, h("h2", { class:"card-title" }, title), ...children);
}

/** A static, trusted SVG from ICONS as a decorative inline element. */
export function icon(markup, cls = "icon"){
  const el = h("span", { class:cls, "aria-hidden":"true" });
  el.innerHTML = markup;
  return el;
}

/**
 * A native <select> with our own chevron: the browser's arrow sits off
 * centre (and differs per platform), so it is hidden and drawn here.
 */
export function selectField(select){
  select.classList.add("select-input");
  return h("span", { class:"select-field" }, select, icon(ICONS.chevronDown, "select-chevron"));
}

/** Readable ink (dark / light) on a given background hex. */
export function inkOn(hex){
  const n = parseInt(String(hex).slice(1), 16);
  const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255];
  return (0.299*r + 0.587*g + 0.114*b) > 170 ? "#232220" : "#FFFFFF";
}

export const ICONS = {
  brand:`<svg viewBox="0 0 24 24"><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z" fill="#3E6B48"/></svg>`,
  chevronRight:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6l6 6-6 6"/></svg>`,
  chevronDown:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9.5l5.5 5.5 5.5-5.5"/></svg>`,
  music:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/></svg>`,
  trophy:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/></svg>`,
  /* honorable: a crown; dishonorable: a skull */
  heads:`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 8.5l4 3.5 4-6 4 6 4-3.5-1.6 9.5H5.6z"/><rect x="5.6" y="19" width="12.8" height="1.8" rx=".9"/></svg>`,
  tails:`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.5 1.2 4.6 3.1 5.9V19a1 1 0 0 0 1 1h1.4v-2h1.2v2h1.6v-2h1.2v2h1.4a1 1 0 0 0 1-1v-2.6c1.9-1.3 3.1-3.4 3.1-5.9A7.5 7.5 0 0 0 12 3z"/><circle cx="9" cy="11" r="1.9" fill="var(--coin, #000)"/><circle cx="15" cy="11" r="1.9" fill="var(--coin, #000)"/></svg>`,
};
