/**
 * Renders the app icons (catan-pangea/icons/) from one SVG design: a 7-hex
 * island in the terrain colours with an 8 token, on black. The PNGs are
 * committed, so this only runs when the icon changes — it isn't part of a
 * build (there is none) or of `npm test`.
 *
 *   node scripts/make-icons.mjs [outDir]
 *   BROWSER="/path/to/Chrome or Brave" node scripts/make-icons.mjs
 *
 * Needs a Chromium-based browser (headless, DevTools protocol); defaults to
 * Brave on macOS. Node 22+ (global WebSocket).
 */
import { spawn } from "node:child_process";
import { writeFile, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const OUT = process.argv[2] ?? fileURLToPath(new URL("../catan-pangea/icons/", import.meta.url));
const BROWSER = process.env.BROWSER ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = 9481;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* a 7-hex island (pointy-top, like the board) in the terrain colours, on black (until 2.11.0: a dark teal sea) */
function svg(size, scale){
  const c = size / 2, R = size * scale / 5.2, gap = R * .085;
  const hex = (x, y, r) => Array.from({ length:6 }, (_, i) => {
    const a = Math.PI / 180 * (60 * i - 90);
    return `${(x + r * Math.cos(a)).toFixed(2)},${(y + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  const s3 = Math.sqrt(3);
  const cells = [
    [0, 0, "#E1B04B"],                                   /* fields in the middle */
    [s3, 0, "#3E6B48"], [-s3, 0, "#C46A45"],
    [s3 / 2, 1.5, "#8C969E"], [-s3 / 2, 1.5, "#3E6B48"],
    [s3 / 2, -1.5, "#9DBE6B"], [-s3 / 2, -1.5, "#E5D6B0"],
  ];
  const polys = cells.map(([dx, dy, fill]) => `<polygon points="${hex(c + dx * R, c + dy * R, R - gap)}" fill="${fill}" stroke="${fill}" stroke-width="${(R * .12).toFixed(1)}" stroke-linejoin="round"/>`).join("");
  const token = `<circle cx="${c}" cy="${c}" r="${(R * .42).toFixed(1)}" fill="#FBF8F1"/>` +
    `<text x="${c}" y="${c}" font-family="-apple-system, Helvetica, Arial, sans-serif" font-weight="800" font-size="${(R * .5).toFixed(1)}" fill="#B3382C" text-anchor="middle" dominant-baseline="central">8</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="#000"/>${polys}${token}</svg>`;
}

const icons = [
  ["icon-512.png", 512, .74], ["icon-192.png", 192, .74], ["apple-touch-icon.png", 180, .74],
  ["icon-maskable-512.png", 512, .56],                    /* inside the maskable safe zone (80% circle) */
];
const profile = await mkdtemp(join(tmpdir(), "cdpprof-"));
const browser = spawn(BROWSER, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio:"ignore" });
process.on("exit", () => browser.kill());
for(let i = 0; i < 60; i++){ try{ await fetch(`http://127.0.0.1:${PORT}/json/version`); break; }catch{ await sleep(200); } }
const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method:"PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once:true }));
let id = 0; const pending = new Map();
ws.addEventListener("message", ev => { const m = JSON.parse(ev.data); if(pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id:i, method, params })); });
await send("Page.enable");
for(const [name, size, scale] of icons){
  await send("Emulation.setDeviceMetricsOverride", { width:size, height:size, deviceScaleFactor:1, mobile:false });
  const html = `<!doctype html><html style="overflow:hidden"><body style="margin:0;overflow:hidden;background:#000"><div style="display:block;line-height:0">${svg(size, scale).replace("<svg ", "<svg style=\"display:block\" ")}</div></body></html>`;
  await send("Page.navigate", { url:"data:text/html;base64," + Buffer.from(html).toString("base64") });
  await sleep(400);
  const r = await send("Page.captureScreenshot", { format:"png", clip:{ x:0, y:0, width:size, height:size, scale:1 } });
  await writeFile(join(OUT, name), Buffer.from(r.result.data, "base64"));
  console.log("wrote", name);
}
browser.kill(); process.exit(0);
