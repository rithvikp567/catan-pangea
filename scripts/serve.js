/**
 * Zero-dependency static server for local development.
 *
 *   npm start                     -> http://localhost:8000
 *   PORT=9000 npm start           -> another port
 *   HOST=0.0.0.0 npm start        -> also reachable from a phone on the same Wi-Fi
 *
 * ES modules don't load from file://, so the app needs to be served over
 * HTTP locally — exactly as GitHub Pages serves it in production.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";

const ROOT = resolve(fileURLToPath(new URL("../catan-pangea/", import.meta.url)));
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || "127.0.0.1";

const TYPES = {
  ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png",
  ".json":"application/json", ".ico":"image/x-icon", ".webmanifest":"application/manifest+json",
};

const server = createServer(async (req, res) => {
  try{
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = normalize(join(ROOT, urlPath));
    if(file !== ROOT && !file.startsWith(ROOT + sep)){ res.writeHead(403).end(); return; }
    if((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type":TYPES[extname(file)] || "application/octet-stream", "Cache-Control":"no-store" });
    res.end(body);
  }catch{
    res.writeHead(404, { "Content-Type":"text/plain" }).end("Not found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Catan Pangea → http://localhost:${PORT}`);
  if(HOST === "0.0.0.0"){
    for(const addrs of Object.values(networkInterfaces())){
      for(const a of addrs || []) if(a.family === "IPv4" && !a.internal) console.log(`  on your network → http://${a.address}:${PORT}`);
    }
  }
});
