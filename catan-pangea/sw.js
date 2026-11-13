/**
 * Service worker: what makes Pangaea an installable app that still opens
 * with no signal at the table.
 *
 *   - The app's own files: network first, so a new deploy reaches everyone
 *     the next time they open it (nobody gets stuck on an old version).
 *     Each good response is kept; offline — or after SLOW_MS on a bad
 *     connection — the last good copy is used instead.
 *   - Firebase's SDK from Google's CDN: versioned and never changes, so
 *     cache first.
 *   - Everything else (YouTube, the database connection) goes straight to
 *     the network, untouched.
 *
 * Only bump CACHE when this strategy changes; the files themselves stay
 * fresh without it.
 */
const CACHE = "pangaea-v1";
const SLOW_MS = 4000;
const SHELL = ["./", "manifest.webmanifest", "icons/icon-192.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for(const key of await caches.keys()) if(key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);
  if(url.origin === self.location.origin) event.respondWith(networkFirst(event, url));
  else if(url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) event.respondWith(cacheFirst(req));
});

async function networkFirst(event, url){
  const req = event.request, cache = await caches.open(CACHE);
  const page = req.mode === "navigate";
  /* pages are kept without their ?query (?store=local…) so any start URL finds the app */
  const key = page ? url.origin + url.pathname : req;
  /* revalidate with the server instead of trusting the browser's HTTP cache */
  const network = fetch(page ? url.origin + url.pathname + url.search : req, { cache:"no-cache" }).then(res => {
    if(res.ok) cache.put(key, res.clone());
    return res;
  });
  event.waitUntil(network.catch(() => {}));             /* a slow answer still refreshes the copy */
  const kept = async () => (await cache.match(key)) ?? (page ? await cache.match("./") : undefined);
  try{
    return await Promise.race([
      network,
      new Promise(resolve => setTimeout(async () => { const k = await kept(); if(k) resolve(k); }, SLOW_MS)),
    ]);
  }catch{
    return (await kept()) ?? Response.error();
  }
}

async function cacheFirst(req){
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if(hit) return hit;
  const res = await fetch(req);
  if(res.ok) cache.put(req, res.clone());
  return res;
}
