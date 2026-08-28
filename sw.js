// Bump this whenever the cached app-shell files should be invalidated.
// v3: added ./styles.css and ./main.js (the built bundle) to APP_SHELL,
// plus the self-hosted font/icon assets that replaced the Google
// Fonts/Lucide CDN requests -- see index.html and styles.css for why.
// These were missing before: the fetch handler below only caches a
// same-origin GET *after* it's actually been requested once, but the very
// first page load that registers a new service worker isn't controlled by
// it yet (a SW doesn't intercept fetches from clients it doesn't control
// until a later navigation), so styles.css/main.js were never guaranteed
// to be cached even after "installing" the PWA -- go offline before a
// second page load ever happens under an active SW and you'd get an
// unstyled app with empty-circle icons. Precaching them here during
// install (which always runs, regardless of fetch-handler timing) closes
// that gap.
const CACHE_NAME = "rrrj-v3";
const APP_SHELL = [
  "./", "./index.html", "./manifest.json", "./styles.css", "./main.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/sprite.svg",
  "./fonts/inter-latin.woff2", "./fonts/notosansthai-thai.woff2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first for same-origin GET requests: always serve the latest app
// when online, cache each response for offline fallback, and never touch
// cross-origin requests (Supabase auth/data, the supabase-js CDN script,
// Google Identity Services) so those always go straight to the network.
// The font and icons used to be cross-origin (Google Fonts, unpkg) too --
// now that they're self-hosted (see index.html/styles.css), they're
// same-origin and get the same caching as everything else here.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req, { cache: "no-store" })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});
