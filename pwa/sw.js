// Netwerk eerst, cache als terugval: de pagina bevat alle data, dus offline zie je de laatst geladen stand.
// Alleen een goed antwoord (200) gaat de cache in. Een antwoord uit de cache krijgt de header `X-Uit-Cache`,
// zodat de pagina kan tonen dat de pc niet bereikbaar is. Het netwerk krijgt 6 s om te *beginnen* met antwoorden.
const CACHE = 'superaanbieding-v1';
const uitCache = async (req) => {
  const c = await caches.match(req, { ignoreSearch: true });
  if (!c) return null;
  const h = new Headers(c.headers);
  h.set('X-Uit-Cache', '1');
  h.delete('Content-Encoding');
  h.delete('Content-Length');
  return new Response(c.body, { status: c.status, statusText: c.statusText, headers: h });
};
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((namen) => Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim()),
));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // afbeeldingen van winkels niet onderscheppen
  if (e.request.method !== 'GET' && e.request.method !== 'HEAD') return;
  e.respondWith((async () => {
    try {
      const stop = new AbortController();
      const timer = setTimeout(() => stop.abort(), 6000);
      let r;
      try { r = await fetch(e.request, { signal: stop.signal }); } finally { clearTimeout(timer); }
      if (e.request.method === 'GET' && r.status === 200 && r.type === 'basic' && !r.redirected) {
        const kopie = r.clone();
        e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, kopie)).catch(() => {}));
        return r;
      }
      return (await uitCache(e.request)) ?? r;
    } catch {
      return (await uitCache(e.request)) ?? Response.error();
    }
  })());
});
